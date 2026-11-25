/**
 * Tests d'intégration : API complète contre un vrai PostgreSQL local.
 * DATABASE_URL doit pointer vers une base de test (elle est vidée).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import pg from "pg";
import { handle } from "../server/api";
import { setPoolForTests } from "../server/db";

const URL_DB = process.env.DATABASE_URL ?? "postgresql://postgres@localhost:5432/casino_test?host=/tmp";
let pool: pg.Pool;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: URL_DB });
  await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  const dir = "netlify/database/migrations";
  for (const f of readdirSync(dir).sort()) await pool.query(readFileSync(`${dir}/${f}`, "utf8"));
  setPoolForTests(pool as any);
});
afterAll(async () => pool.end());

async function call(method: string, path: string, token?: string, body?: unknown) {
  const res = await handle(
    new Request("http://test/api" + path, {
      method,
      headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const data = await res.json();
  return { status: res.status, data };
}

async function signup(name: string) {
  const r = await call("POST", "/auth/register", undefined, { username: name, password: "secret123" });
  expect(r.status).toBe(201);
  return { token: r.data.token as string, id: r.data.user.id as string, name };
}

const totalVC = async () => {
  const w = await pool.query("SELECT COALESCE(SUM(balance),0)::int AS s FROM wallets");
  const t = await pool.query(
    `SELECT COALESCE(SUM((seat->>'stack')::int),0)::int AS s FROM rooms, jsonb_array_elements(state->'poker'->'seats') seat WHERE seat <> 'null'::jsonb`,
  );
  const inHand = await pool.query(
    `SELECT COALESCE(SUM((p.value->>'total')::int),0)::int AS s FROM rooms, jsonb_each(state->'poker'->'hand'->'players') p
      WHERE state->'poker'->'hand' <> 'null'::jsonb AND state->'poker'->'hand'->>'stage' <> 'done'`,
  );
  return w.rows[0].s + t.rows[0].s + inHand.rows[0].s;
};

describe("comptes et portefeuille", () => {
  it("inscription : 500 VC, pseudo unique, connexion", async () => {
    const a = await signup("Alice");
    const me = await call("GET", "/me", a.token);
    expect(me.data.balance).toBe(500);
    expect((await call("POST", "/auth/register", undefined, { username: "alice", password: "xxxxxx" })).status).toBe(409);
    expect((await call("POST", "/auth/login", undefined, { username: "ALICE", password: "nope" })).status).toBe(401);
    const ok = await call("POST", "/auth/login", undefined, { username: "alice", password: "secret123" });
    expect(ok.status).toBe(200);
    expect((await call("GET", "/me")).status).toBe(401);
    expect((await call("GET", "/me", "faux-jeton")).status).toBe(401);
  });

  it("machines à sous : résultat serveur, solde cohérent, jamais négatif", async () => {
    const u = await signup("Slotty");
    let bal = 500;
    for (let i = 0; i < 40; i++) {
      const r = await call("POST", "/slots/spin", u.token, { machine: "egypte", bet: 5 });
      if (r.status !== 200) break;
      expect(r.data.balance).toBe(bal - 5 + r.data.win);
      bal = r.data.balance;
    }
    expect((await call("POST", "/slots/spin", u.token, { machine: "egypte", bet: 3 })).status).toBe(400);
    const ledger = await pool.query("SELECT SUM(amount)::int s FROM wallet_tx WHERE user_id = $1", [u.id]);
    expect(ledger.rows[0].s).toBe(bal); // le journal correspond exactement au solde
  });

  it("blackjack : mise débitée, gains crédités, entraînement gratuit avec conseils", async () => {
    const u = await signup("Blacky");
    const r = await call("POST", "/blackjack/start", u.token, { bet: 20 });
    expect(r.status).toBe(200);
    let g = r.data.game;
    if (g.stage === "insurance") {
      expect(r.data.game.insuranceCost).toBe(10);
      g = (await call("POST", "/blackjack/insurance", u.token, { take: true })).data.game;
    }
    if (g.stage === "player") {
      expect(g.dealer[1]).toBeNull(); // carte cachée
      expect((await call("POST", "/blackjack/start", u.token, { bet: 20 })).status).toBe(400);
      const end = await call("POST", "/blackjack/action", u.token, { action: "stand" });
      g = end.data.game;
    }
    expect(g.stage).toBe("done");
    const bal = (await call("GET", "/me", u.token)).data.balance;
    expect(bal).toBe(500 - g.totalBet + g.totalPayout);

    // plusieurs manches : le sabot diminue (il n'est pas remélangé à chaque fois)
    const shoeA = g.shoe.remaining;
    let n = await call("POST", "/blackjack/start", u.token, { bet: 2 });
    while (n.data.game.stage !== "done") {
      n = n.data.game.stage === "insurance"
        ? await call("POST", "/blackjack/insurance", u.token, { take: false })
        : await call("POST", "/blackjack/action", u.token, { action: "stand" });
    }
    expect(n.data.game.shoe.remaining).toBeLessThan(shoeA);
    expect(n.data.balance).toBe(bal - n.data.game.totalBet + n.data.game.totalPayout);

    const p = await call("POST", "/blackjack/start", u.token, { bet: 100, practice: true });
    expect(p.data.balance).toBe(n.data.balance); // entraînement : portefeuille intact
    if (p.data.game.stage === "player") expect(p.data.game.hint.explanation).toBeTruthy();
  });

  it("une manche commencée avant une mise à jour se termine sans erreur", async () => {
    const u = await signup("Ancien");
    // manche au format de la version précédente : ni assurance, ni défausse
    const legacy = {
      shoe: ["2c", "3d", "4h", "5s", "6c", "7d", "8h", "9s"],
      dealer: ["9h", "7c"],
      hands: [{ cards: ["Ts", "8d"], bet: 20, doubled: false, done: false, splitAces: false, fromSplit: false }],
      active: 0,
      stage: "player",
      practice: false,
      feedback: [],
      totalBet: 20,
      totalPayout: 0,
    };
    await pool.query("UPDATE wallets SET balance = 480 WHERE user_id = $1", [u.id]);
    await pool.query("INSERT INTO blackjack_games (user_id, state) VALUES ($1, $2)", [u.id, JSON.stringify(legacy)]);
    expect((await call("GET", "/blackjack", u.token)).status).toBe(200);
    const r = await call("POST", "/blackjack/action", u.token, { action: "stand" });
    expect(r.status).toBe(200);
    expect(r.data.game.stage).toBe("done");
    expect(r.data.game.hands[0].result).toBe("win"); // 18 contre 16 + 8 = 24 : le croupier dépasse
    expect(r.data.balance).toBe(520);
    // et la manche suivante repart normalement
    expect((await call("POST", "/blackjack/start", u.token, { bet: 10 })).status).toBe(200);
  });

  it("réinitialisation du portefeuille", async () => {
    const u = await signup("Resetter");
    await call("POST", "/slots/spin", u.token, { machine: "neon", bet: 25 });
    const r = await call("POST", "/wallet/reset", u.token);
    expect(r.data.balance).toBe(500);
  });
});

describe("Mines, Roulette, Plinko", () => {
  it("Mines : grille secrète, encaissement, mine touchée, journal exact", async () => {
    const u = await signup("Mineur");
    let r = await call("POST", "/mines/start", u.token, { bet: 50, mines: 3 });
    expect(r.status).toBe(200);
    expect(r.data.balance).toBe(450);
    expect(r.data.game.layout).toBeNull();
    expect((await call("POST", "/mines/start", u.token, { bet: 50, mines: 3 })).status).toBe(400);
    expect((await call("POST", "/wallet/reset", u.token)).status).toBe(400);
    const layout: number[] = (await pool.query("SELECT state FROM mines_games WHERE user_id = $1", [u.id])).rows[0].state.layout;
    const safe = [...Array(25).keys()].filter((c) => !layout.includes(c));
    r = await call("POST", "/mines/action", u.token, { cell: safe[0] });
    r = await call("POST", "/mines/action", u.token, { cell: safe[1] });
    expect(r.data.game.multiplier).toBeGreaterThan(1);
    r = await call("POST", "/mines/action", u.token, { action: "cashout" });
    expect(r.data.game.stage).toBe("cashed");
    expect(r.data.balance).toBe(450 + r.data.game.payout);
    expect(r.data.game.layout).toEqual(layout);
    // deuxième partie : on touche une mine
    await call("POST", "/mines/start", u.token, { bet: 20, mines: 24 });
    const lay2: number[] = (await pool.query("SELECT state FROM mines_games WHERE user_id = $1", [u.id])).rows[0].state.layout;
    r = await call("POST", "/mines/action", u.token, { cell: lay2[0] });
    expect(r.data.game.stage).toBe("lost");
    const ledger = await pool.query("SELECT SUM(amount)::int s FROM wallet_tx WHERE user_id = $1", [u.id]);
    expect(ledger.rows[0].s).toBe(r.data.balance);
    expect((await call("GET", "/stats", u.token)).data.stats.mines_rounds).toBe(2);
  });

  it("Roulette : plusieurs mises, gains crédités, limites", async () => {
    const u = await signup("Rouletteur");
    expect((await call("POST", "/roulette/spin", u.token, { bets: [{ type: "rouge", amount: 400 }, { type: "noir", amount: 200 }] })).status).toBe(400);
    const r = await call("POST", "/roulette/spin", u.token, { bets: [{ type: "plein", value: 17, amount: 10 }, { type: "rouge", amount: 20 }] });
    expect(r.status).toBe(200);
    expect(r.data.number).toBeGreaterThanOrEqual(0);
    expect(r.data.balance).toBe(500 - 30 + r.data.payout);
  });

  it("Plinko : chemin, multiplicateur et solde cohérents", async () => {
    const u = await signup("Plinkeur");
    expect((await call("POST", "/plinko/drop", u.token, { bet: 10, risk: "extreme" })).status).toBe(400);
    let bal = 500;
    for (let i = 0; i < 10; i++) {
      const r = await call("POST", "/plinko/drop", u.token, { bet: 10, risk: "eleve" });
      expect(r.data.path).toHaveLength(12);
      expect(r.data.balance).toBe(bal - 10 + r.data.payout);
      bal = r.data.balance;
    }
  });
});

describe("poker solo contre les bots", () => {
  it("partie complète : cave, bots, mains successives, départ", async () => {
    const u = await signup("Solo");
    expect((await call("POST", "/solo-poker/start", u.token, { bots: 3, level: "normal", buyIn: 9999 })).status).toBe(400);
    let r = await call("POST", "/solo-poker/start", u.token, { bots: 3, level: "normal", buyIn: 200 });
    expect(r.status).toBe(200);
    expect(r.data.balance).toBe(300);
    expect(r.data.table.seats.filter(Boolean)).toHaveLength(4);
    expect((await call("POST", "/solo-poker/start", u.token, { bots: 2, level: "facile", buyIn: 100 })).status).toBe(400);
    // les cartes des bots restent cachées
    expect(r.data.table.hand.players[1].hole).toEqual([null, null]);
    expect((await call("POST", "/wallet/reset", u.token)).status).toBe(400);

    let hands = 0;
    for (let guard = 0; guard < 400 && hands < 4; guard++) {
      const t = r.data.table;
      const h = t.hand;
      if (h.stage === "done") {
        hands++;
        if (t.seats[0].stack === 0) break;
        r = await call("POST", "/solo-poker/next", u.token);
        expect(r.status).toBe(200);
        continue;
      }
      if (h.toAct === 0) {
        r = await call("POST", "/solo-poker/act", u.token, { type: t.me.legal.check ? "check" : "call" });
      } else {
        r = await call("POST", "/solo-poker/step", u.token);
      }
      expect(r.status).toBe(200);
    }
    expect(hands).toBeGreaterThanOrEqual(1);
    const stats = (await call("GET", "/stats", u.token)).data.stats;
    expect(stats.poker_hands).toBeGreaterThanOrEqual(1);

    const stack = r.data.table.seats[0].stack;
    const inHand = r.data.table.hand.stage !== "done";
    const left = await call("POST", "/solo-poker/leave", u.token);
    expect(left.data.table).toBeNull();
    if (!inHand) expect(left.data.balance).toBe(300 + stack);
    expect((await call("GET", "/solo-poker", u.token)).data.table).toBeNull();
  }, 60000);
});

describe("salons multijoueurs et poker", () => {
  it("créer, rejoindre par code, chat, prêt, partie complète, départ", async () => {
    const before = await totalVC();
    const h = await signup("Hote");
    const b = await signup("Bob");
    const c = await signup("Chloe");
    const created = await call("POST", "/rooms", h.token);
    const code = created.data.code as string;
    expect(code).toMatch(/^CASINO-[A-Z2-9]{4}$/);

    expect((await call("POST", "/rooms/join", b.token, { code: code.toLowerCase().replace("-", " ") })).status).toBe(200);
    expect((await call("POST", "/rooms/join", c.token, { code: code.slice(7) })).status).toBe(200);
    expect((await call("POST", "/rooms/join", c.token, { code: "CASINO-0000" })).status).toBe(404);

    await call("POST", `/rooms/${code}/chat`, b.token, { text: "Salut tout le monde !" });
    await call("POST", `/rooms/${code}/ready`, c.token, { ready: true });
    const st = await call("GET", `/rooms/${code}?v=0`, h.token);
    expect(st.data.room.members.map((m: any) => m.username)).toEqual(["Hote", "Bob", "Chloe"]);
    expect(st.data.room.chat.some((m: any) => m.text === "Salut tout le monde !")).toBe(true);
    expect(st.data.room.members[2].ready).toBe(true);

    // synchronisation : rien de neuf → réponse légère
    const same = await call("GET", `/rooms/${code}?v=${st.data.version}`, h.token);
    expect(same.data.unchanged).toBe(true);

    // s'asseoir : la cave quitte le portefeuille
    expect((await call("POST", `/rooms/${code}/sit`, h.token, { seat: 0, buyIn: 200 })).status).toBe(200);
    expect((await call("POST", `/rooms/${code}/sit`, b.token, { seat: 0, buyIn: 200 })).status).toBe(400); // siège pris
    expect((await call("POST", `/rooms/${code}/sit`, b.token, { seat: 3, buyIn: 9999 })).status).toBe(400); // hors limites
    await call("POST", `/rooms/${code}/sit`, b.token, { seat: 3, buyIn: 300 });
    await call("POST", `/rooms/${code}/sit`, c.token, { seat: 6, buyIn: 100 });
    expect((await call("GET", "/me", b.token)).data.balance).toBe(200);
    expect(await totalVC()).toBe(before + 1500);

    await call("POST", `/rooms/${code}/start`, h.token);
    let s = (await call("GET", `/rooms/${code}?v=0`, b.token)).data;
    expect(s.poker.hand.stage).toBe("preflop");
    // Bob ne voit pas les cartes des autres
    expect(s.poker.hand.players[0].hole).toEqual([null, null]);
    expect(s.poker.hand.players[3].hole.every(Boolean)).toBe(true);
    expect(s.poker.me.handInfo.label).toBeTruthy();

    // jouer jusqu'à la fin de la main : tout le monde suit/parle
    const tokens: Record<string, string> = { [h.id]: h.token, [b.id]: b.token, [c.id]: c.token };
    for (let guard = 0; guard < 40; guard++) {
      s = (await call("GET", `/rooms/${code}?v=0`, h.token)).data;
      if (s.poker.hand.stage === "done") break;
      const seat = s.poker.hand.toAct;
      const uid = s.poker.seats[seat].userId;
      const me = (await call("GET", `/rooms/${code}?v=0`, tokens[uid])).data.poker.me;
      const type = me.legal.check ? "check" : "call";
      // une action hors tour est refusée
      const other = Object.keys(tokens).find((k) => k !== uid)!;
      expect((await call("POST", `/rooms/${code}/act`, tokens[other], { type: "check" })).status).toBe(400);
      expect((await call("POST", `/rooms/${code}/act`, tokens[uid], { type })).status).toBe(200);
    }
    expect(s.poker.hand.stage).toBe("done");
    expect(s.poker.hand.result.summary).toBeTruthy();
    expect(await totalVC()).toBe(before + 1500);

    // statistiques enregistrées
    const stats = (await call("GET", "/stats", b.token)).data.stats;
    expect(stats.poker_hands).toBe(1);

    // l'hôte verrouille ; un inconnu ne peut plus entrer
    const d = await signup("Dan");
    await call("POST", `/rooms/${code}/lock`, h.token, { locked: true });
    expect((await call("POST", "/rooms/join", d.token, { code })).status).toBe(403);
    expect((await call("POST", `/rooms/${code}/lock`, b.token, { locked: false })).status).toBe(403); // pas l'hôte

    // exclusion : Chloé est exclue, ses jetons reviennent à son portefeuille
    const chloeStack = s.poker.seats[6].stack;
    await call("POST", `/rooms/${code}/kick`, h.token, { userId: c.id });
    expect((await call("GET", "/me", c.token)).data.balance).toBe(400 + chloeStack);
    expect((await call("GET", `/rooms/${code}?v=0`, c.token)).status).toBe(403);
    expect(await totalVC()).toBe(before + 2000);

    // l'hôte quitte : Bob devient hôte
    await call("POST", `/rooms/${code}/leave`, h.token);
    const after = (await call("GET", `/rooms/${code}?v=0`, b.token)).data;
    expect(after.room.hostId).toBe(b.id);
    await call("POST", `/rooms/${code}/leave`, b.token);
    expect(await totalVC()).toBe(before + 2000);
    expect((await pool.query("SELECT 1 FROM rooms WHERE code = $1", [code])).rowCount).toBe(0);
  });

  it("déconnexion : l'hôte peut faire jouer un absent ; reconnexion transparente", async () => {
    const h = await signup("Host2");
    const z = await signup("Zoe");
    const { code } = (await call("POST", "/rooms", h.token)).data;
    await call("POST", "/rooms/join", z.token, { code });
    await call("POST", `/rooms/${code}/sit`, h.token, { seat: 0, buyIn: 100 });
    await call("POST", `/rooms/${code}/sit`, z.token, { seat: 1, buyIn: 100 });
    await call("POST", `/rooms/${code}/start`, h.token);
    let s = (await call("GET", `/rooms/${code}?v=0`, h.token)).data;
    // faire en sorte que ce soit le tour de Zoé
    if (s.poker.seats[s.poker.hand.toAct].userId === h.id) {
      await call("POST", `/rooms/${code}/act`, h.token, { type: "call" });
    }
    // Zoé est encore « en ligne » → refus
    expect((await call("POST", `/rooms/${code}/forceAbsent`, h.token)).status).toBe(400);
    // simulation de déconnexion : dernière présence il y a 1 minute
    await pool.query("UPDATE room_presence SET last_seen = NOW() - INTERVAL '1 minute' WHERE user_id = $1", [z.id]);
    s = (await call("GET", `/rooms/${code}?v=0`, h.token)).data;
    expect(s.online).not.toContain(z.id);
    expect((await call("POST", `/rooms/${code}/forceAbsent`, h.token)).status).toBe(200);
    // reconnexion : Zoé revient, retrouve son siège et sa main
    s = (await call("GET", `/rooms/${code}?v=0`, z.token)).data;
    expect(s.poker.seats[1].userId).toBe(z.id);
    expect(s.online).toContain(z.id);
  });

  it("jetons bloqués : quitter le salon en pleine main puis les autres disparaissent", async () => {
    const a = await signup("Bloque");
    const b = await signup("Parti");
    const c = await signup("Absent");
    const { code } = (await call("POST", "/rooms", a.token)).data;
    await call("POST", "/rooms/join", b.token, { code });
    await call("POST", "/rooms/join", c.token, { code });
    await call("POST", `/rooms/${code}/sit`, a.token, { seat: 0, buyIn: 500 });
    await call("POST", `/rooms/${code}/sit`, b.token, { seat: 1, buyIn: 300 });
    await call("POST", `/rooms/${code}/sit`, c.token, { seat: 2, buyIn: 300 });
    await call("POST", `/rooms/${code}/start`, a.token);
    const tok: Record<string, string> = { [a.id]: a.token, [b.id]: b.token, [c.id]: c.token };
    // on joue jusqu'à ce que ce ne soit pas à A de parler
    let s = (await call("GET", `/rooms/${code}?v=0`, a.token)).data;
    while (s.poker.seats[s.poker.hand.toAct].userId === a.id) {
      await call("POST", `/rooms/${code}/act`, a.token, { type: "call" });
      s = (await call("GET", `/rooms/${code}?v=0`, a.token)).data;
    }
    // A quitte le salon en pleine main : il se couche, ses jetons attendent la fin de la main
    await call("POST", `/rooms/${code}/leave`, a.token);
    let t = (await call("GET", "/me/tables", a.token)).data.tables;
    expect(t).toHaveLength(1);
    expect(t[0].member).toBe(false);
    // B et C sont connectés : rien n'est forcé
    let r = await call("POST", "/me/tables/reclaim", a.token);
    expect(r.data.pending).toEqual([code]);
    // B et C ferment leur navigateur : la main se débloque, les jetons de A reviennent
    await pool.query("UPDATE room_presence SET last_seen = NOW() - INTERVAL '5 minutes' WHERE user_id = ANY($1)", [[b.id, c.id]]);
    r = await call("POST", "/me/tables/reclaim", a.token);
    expect(r.data.pending).toEqual([]);
    expect(r.data.tables).toHaveLength(0);
    expect(r.data.balance).toBeGreaterThan(0);
    expect((await call("POST", "/wallet/reset", a.token)).status).toBe(200);
    void tok;
  });

  it("concurrence : deux joueurs visent le même siège au même instant", async () => {
    const before = await totalVC();
    const h = await signup("Host3");
    const x = await signup("Xavier");
    const y = await signup("Yann");
    const { code } = (await call("POST", "/rooms", h.token)).data;
    await call("POST", "/rooms/join", x.token, { code });
    await call("POST", "/rooms/join", y.token, { code });
    const [r1, r2] = await Promise.all([
      call("POST", `/rooms/${code}/sit`, x.token, { seat: 2, buyIn: 300 }),
      call("POST", `/rooms/${code}/sit`, y.token, { seat: 2, buyIn: 300 }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 400]);
    const loser = r1.status === 400 ? x : y;
    expect((await call("GET", "/me", loser.token)).data.balance).toBe(500); // aucun débit fantôme
    expect(await totalVC()).toBe(before + 1500);
  });

  it("anti-triche : impossible de s'asseoir sans les fonds ; réinitialiser lève d'abord de table", async () => {
    const h = await signup("Host4");
    const { code } = (await call("POST", "/rooms", h.token)).data;
    expect((await call("POST", `/rooms/${code}/sit`, h.token, { seat: 0, buyIn: 600 })).status).toBe(400);
    await call("POST", `/rooms/${code}/sit`, h.token, { seat: 0, buyIn: 500 });
    expect((await call("GET", "/me", h.token)).data.balance).toBe(0);
    // réinitialiser assis (sans main en cours) : on est d'abord levé de table, puis remis à 500
    expect((await call("POST", "/wallet/reset", h.token)).data.balance).toBe(500);
    expect((await call("GET", "/me/tables", h.token)).data.tables).toHaveLength(0);
  });
});
