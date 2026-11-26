/** Baccara, Vidéo poker, Keno, Roue de la fortune : portefeuille et statistiques dans la même transaction. */
import { q, tx, type Q } from "./db.js";
import { ApiError, debit, credit, addHistory, balanceOf, MAX_BET, checkBet } from "./core.js";
import * as T from "./games/tablegames.js";

const wrap = <R>(fn: () => R): R => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof T.TableGameError) throw new ApiError(400, e.message);
    throw e;
  }
};
const bal = async (c: Q, userId: string) => (await c.query<{ balance: number }>("SELECT balance FROM wallets WHERE user_id = $1", [userId])).rows[0].balance;

// ------------------------------------------------------------ Baccara
const BACCARAT_TYPES: T.BaccaratBet[] = ["joueur", "banque", "egalite", "paire_joueur", "paire_banque"];
export async function baccaratPlay(userId: string, body: any) {
  if (!Array.isArray(body.bets) || !body.bets.length) throw new ApiError(400, "Placez au moins une mise");
  const bets = body.bets.map((b: any) => {
    if (!BACCARAT_TYPES.includes(b?.type)) throw new ApiError(400, "Mise inconnue");
    return { type: b.type as T.BaccaratBet, amount: checkBet(b.amount) };
  });
  if (new Set(bets.map((b: any) => b.type)).size !== bets.length) throw new ApiError(400, "Une seule mise par case");
  const total = bets.reduce((a: number, b: any) => a + b.amount, 0);
  if (total > MAX_BET) throw new ApiError(400, "Mise totale trop élevée");
  return tx(async (c) => {
    await debit(c, userId, total, "BACCARAT_BET", "Baccara");
    const coup = T.baccaratCoup();
    const results = T.baccaratSettle(bets, coup);
    const payout = results.reduce((a, r) => a + r.payout, 0);
    if (payout > 0) await credit(c, userId, payout, "BACCARAT_PAYOUT", `Coup : ${coup.winner}`);
    const net = payout - total;
    await c.query("UPDATE game_stats SET baccarat_coups = baccarat_coups + 1, baccarat_net = baccarat_net + $2 WHERE user_id = $1", [userId, net]);
    await addHistory(c, userId, "baccara", net > 0 ? "Gagnée" : net < 0 ? "Perdue" : "Égalité", net, {
      label: coup.winner === "egalite" ? `Égalité ${coup.playerTotal}-${coup.bankerTotal}` : `${coup.winner === "joueur" ? "Joueur" : "Banque"} gagne ${Math.max(coup.playerTotal, coup.bankerTotal)} à ${Math.min(coup.playerTotal, coup.bankerTotal)}`,
    });
    return { coup, results, total, payout, balance: await bal(c, userId) };
  });
}

// ------------------------------------------------------------ Vidéo poker
async function vpLoad(c: Q, userId: string) {
  const { rows } = await c.query<{ state: T.VPGame }>("SELECT state FROM videopoker_games WHERE user_id = $1 FOR UPDATE", [userId]);
  return rows[0]?.state ?? null;
}
async function vpSave(c: Q, userId: string, g: T.VPGame) {
  await c.query(
    "INSERT INTO videopoker_games (user_id, state) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()",
    [userId, JSON.stringify(g)],
  );
}
export async function vpGet(userId: string) {
  const { rows } = await q<{ state: T.VPGame }>("SELECT state FROM videopoker_games WHERE user_id = $1", [userId]);
  return { game: rows[0] ? T.vpView(rows[0].state) : null, balance: await balanceOf(userId) };
}
export async function vpDeal(userId: string, body: any) {
  const bet = checkBet(body.bet);
  return tx(async (c) => {
    const cur = await vpLoad(c, userId);
    if (cur && cur.stage === "hold") throw new ApiError(400, "Terminez d'abord la main en cours");
    await debit(c, userId, bet, "VP_BET", "Vidéo poker");
    const g = T.vpDeal(bet);
    await vpSave(c, userId, g);
    return { game: T.vpView(g), balance: await bal(c, userId) };
  });
}
export async function vpDraw(userId: string, body: any) {
  return tx(async (c) => {
    const g = await vpLoad(c, userId);
    if (!g || g.stage !== "hold") throw new ApiError(400, "Aucune main en cours");
    wrap(() => T.vpDraw(g, body.held));
    if (g.payout > 0) await credit(c, userId, g.payout, "VP_PAYOUT", g.result ?? null);
    const net = g.payout - g.bet;
    const pays = g.payout / g.bet;
    await c.query(
      `UPDATE game_stats SET vp_hands = vp_hands + 1, vp_net = vp_net + $2,
         vp_best = CASE WHEN $3 > vp_best_pays THEN $4 ELSE vp_best END, vp_best_pays = GREATEST(vp_best_pays, $3) WHERE user_id = $1`,
      [userId, net, Math.round(pays), g.result],
    );
    if (pays >= 9) await addHistory(c, userId, "videopoker", "Gros gain", net, { label: g.result });
    await vpSave(c, userId, g);
    return { game: T.vpView(g), balance: await bal(c, userId) };
  });
}

// ------------------------------------------------------------ Keno
export async function kenoPlay(userId: string, body: any) {
  const bet = checkBet(body.bet);
  const picks = wrap(() => T.kenoValidate(body.picks));
  return tx(async (c) => {
    await debit(c, userId, bet, "KENO_BET", `Keno ${picks.length} numéros`);
    const r = T.kenoDraw(picks, bet);
    if (r.payout > 0) await credit(c, userId, r.payout, "KENO_PAYOUT", `${r.hits.length}/${picks.length}`);
    const net = r.payout - bet;
    await c.query("UPDATE game_stats SET keno_draws = keno_draws + 1, keno_net = keno_net + $2, keno_best_hits = GREATEST(keno_best_hits, $3) WHERE user_id = $1", [userId, net, r.hits.length]);
    if (r.multiplier >= 10) await addHistory(c, userId, "keno", "Gros gain", net, { label: `${r.hits.length} sur ${picks.length} (×${r.multiplier})` });
    return { ...r, picks, balance: await bal(c, userId) };
  });
}

// ------------------------------------------------------------ Roue de la fortune
export async function wheelPlay(userId: string, body: any) {
  const bets = wrap(() => T.wheelValidate(body.bets)).map((b) => ({ ...b, amount: checkBet(b.amount) }));
  const total = bets.reduce((a, b) => a + b.amount, 0);
  if (total > MAX_BET) throw new ApiError(400, "Mise totale trop élevée");
  return tx(async (c) => {
    await debit(c, userId, total, "WHEEL_BET", "Roue de la fortune");
    const r = T.wheelSpin(bets);
    if (r.payout > 0) await credit(c, userId, r.payout, "WHEEL_PAYOUT", r.symbol);
    const net = r.payout - total;
    await c.query("UPDATE game_stats SET wheel_spins = wheel_spins + 1, wheel_net = wheel_net + $2 WHERE user_id = $1", [userId, net]);
    if (["joker", "casino", "20"].includes(r.symbol) && r.payout > 0) await addHistory(c, userId, "roue", "Gros gain", net, { label: `Case ${r.symbol}` });
    return { ...r, balance: await bal(c, userId) };
  });
}

export function tablesInfo() {
  return {
    baccarat: { pays: T.BACCARAT_PAYS },
    videopoker: { paytable: T.VP_PAYTABLE },
    keno: { numbers: T.KENO_NUMBERS, drawn: T.KENO_DRAWN, pays: T.KENO_PAYS, rtp: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, T.kenoRTP(i + 1)])) },
    wheel: { segments: T.WHEEL_SEGMENTS, pays: T.WHEEL_PAYS, rtp: Object.fromEntries((Object.keys(T.WHEEL_PAYS) as T.WheelSymbol[]).map((s) => [s, T.wheelRTP(s)])) },
    maxBet: MAX_BET,
  };
}
