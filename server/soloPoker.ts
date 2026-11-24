/**
 * Poker solo contre des bots. Même moteur que les salons multijoueurs.
 * La cave du joueur vient de son portefeuille et y retourne quand il quitte la table.
 * Les bots jouent une action à la fois (/step) pour que le client puisse animer la partie.
 */
import { q, tx, type Q } from "./db.js";
import { ApiError, debit, credit, type User } from "./core.js";
import { recordHandStats } from "./rooms.js";
import * as P from "./games/poker.js";
import { BOTS, decide, isBot, type BotLevel, type BotProfile } from "./games/pokerbot.js";
import { shuffle } from "./games/cards.js";

interface SoloState {
  table: P.PokerTable;
  level: BotLevel;
  bots: Record<string, BotProfile>;
  botIndex: number;
}

const LEVELS: BotLevel[] = ["facile", "normal", "difficile"];
const SB = 5;
const BB = 10;

async function load(c: Q, userId: string): Promise<SoloState | null> {
  const { rows } = await c.query<{ state: SoloState }>("SELECT state FROM solo_poker WHERE user_id = $1 FOR UPDATE", [userId]);
  return rows[0]?.state ?? null;
}
async function save(c: Q, userId: string, s: SoloState) {
  await c.query(
    "INSERT INTO solo_poker (user_id, state) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()",
    [userId, JSON.stringify(s)],
  );
}
async function balance(c: Q, userId: string) {
  const { rows } = await c.query<{ balance: number }>("SELECT balance FROM wallets WHERE user_id = $1", [userId]);
  return rows[0].balance;
}
function view(s: SoloState | null, userId: string, bal: number) {
  if (!s) return { table: null, balance: bal, serverTime: Date.now() };
  return { table: P.viewFor(s.table, userId), level: s.level, balance: bal, serverTime: Date.now() };
}

/** Remplace les bots éliminés par de nouveaux adversaires. */
function refillBots(s: SoloState, buyIn: number) {
  const t = s.table;
  t.seats.forEach((seat, i) => {
    if (seat && isBot(seat.userId) && seat.stack === 0) {
      t.log.push(`${seat.username} est éliminé et quitte la table`);
      const used = new Set(t.seats.filter(Boolean).map((x) => x!.username));
      const profile = shuffle(BOTS).find((b) => !used.has(b.name)) ?? BOTS[s.botIndex % BOTS.length];
      const id = `bot:${++s.botIndex}`;
      s.bots[id] = profile;
      t.seats[i] = { userId: id, username: profile.name, avatar: profile.avatar, color: profile.color, stack: buyIn, sittingOut: false, leaveAfterHand: false };
      t.log.push(`${profile.name} prend place avec ${buyIn} VC`);
    }
  });
}

export async function soloGet(userId: string) {
  const { rows } = await q<{ state: SoloState }>("SELECT state FROM solo_poker WHERE user_id = $1", [userId]);
  const { rows: b } = await q<{ balance: number }>("SELECT balance FROM wallets WHERE user_id = $1", [userId]);
  return view(rows[0]?.state ?? null, userId, b[0]?.balance ?? 0);
}

export async function soloStart(u: User, body: any) {
  const nBots = Math.floor(Number(body.bots));
  const level = body.level as BotLevel;
  const buyIn = Math.floor(Number(body.buyIn));
  if (!(nBots >= 1 && nBots <= 5)) throw new ApiError(400, "Choisissez entre 1 et 5 bots");
  if (!LEVELS.includes(level)) throw new ApiError(400, "Niveau inconnu");
  if (!(buyIn >= BB * 10 && buyIn <= BB * 100)) throw new ApiError(400, `La cave doit être comprise entre ${BB * 10} et ${BB * 100} VC`);
  return tx(async (c) => {
    if (await load(c, u.id)) throw new ApiError(400, "Vous avez déjà une table en cours");
    await debit(c, u.id, buyIn, "POKER_BUY_IN", "Poker contre les bots");
    const table = P.createTable({ sb: SB, bb: BB, maxSeats: nBots + 1 });
    const s: SoloState = { table, level, bots: {}, botIndex: 0 };
    P.sit(table, 0, { userId: u.id, username: u.username, avatar: u.avatar, color: u.avatar_color }, buyIn);
    shuffle(BOTS)
      .slice(0, nBots)
      .forEach((profile, i) => {
        const id = `bot:${++s.botIndex}`;
        s.bots[id] = profile;
        P.sit(table, i + 1, { userId: id, username: profile.name, avatar: profile.avatar, color: profile.color }, buyIn);
      });
    P.startHand(table);
    await save(c, u.id, s);
    return view(s, u.id, await balance(c, u.id));
  });
}

async function mutate(userId: string, fn: (s: SoloState, c: Q) => Promise<void> | void) {
  return tx(async (c) => {
    const s = await load(c, userId);
    if (!s) throw new ApiError(404, "Aucune table en cours");
    try {
      await fn(s, c);
    } catch (e) {
      if (e instanceof P.PokerError) throw new ApiError(400, e.message);
      throw e;
    }
    if (s.table.hand) await recordHandStats(c, s.table.hand, "Bots");
    await save(c, userId, s);
    return view(s, userId, await balance(c, userId));
  });
}

export const soloAct = (u: User, body: any) => mutate(u.id, (s) => P.act(s.table, u.id, body.type, body.amount));

/** Fait jouer le bot qui a la parole (une seule action). */
export const soloStep = (u: User) =>
  mutate(u.id, (s) => {
    const t = s.table;
    const h = t.hand;
    if (!h || !P.handInProgress(t) || h.toAct === null) return;
    const seat = t.seats[h.toAct]!;
    if (!isBot(seat.userId)) return;
    const d = decide(t, h.toAct, s.bots[seat.userId], s.level);
    try {
      P.act(t, seat.userId, d.type, d.amount);
    } catch {
      // filet de sécurité : action toujours légale
      const l = P.legalActions(t, h.toAct)!;
      P.act(t, seat.userId, l.check ? "check" : "fold");
    }
  });

export const soloNext = (u: User) =>
  mutate(u.id, (s) => {
    const t = s.table;
    if (P.handInProgress(t)) return;
    refillBots(s, 50 * BB);
    const me = t.seats[P.seatOf(t, u.id)];
    if (!me || me.stack === 0) throw new ApiError(400, "Vous n'avez plus de jetons : recavez ou quittez la table");
    P.startHand(t);
  });

export const soloRebuy = (u: User, body: any) =>
  mutate(u.id, async (s, c) => {
    const amount = Math.floor(Number(body.amount));
    if (P.handInProgress(s.table) && !s.table.hand!.players[0]?.folded) throw new ApiError(400, "Attendez la fin de la main pour recaver");
    await debit(c, u.id, amount, "POKER_BUY_IN", "Poker contre les bots");
    P.rebuy(s.table, u.id, amount);
  });

/** Quitter : la main en cours est abandonnée (couché), le tapis revient au portefeuille. */
export async function soloLeave(u: User) {
  return tx(async (c) => {
    const s = await load(c, u.id);
    if (!s) return view(null, u.id, await balance(c, u.id));
    const t = s.table;
    const i = P.seatOf(t, u.id);
    // les mises déjà engagées dans une main en cours restent au pot (abandon)
    if (t.hand) await recordHandStats(c, t.hand, "Bots");
    const stack = t.seats[i]?.stack ?? 0;
    if (stack > 0) await credit(c, u.id, stack, "POKER_CASH_OUT", "Poker contre les bots");
    await c.query("DELETE FROM solo_poker WHERE user_id = $1", [u.id]);
    return view(null, u.id, await balance(c, u.id));
  });
}
