/** Mines, Roulette et Plinko côté serveur : portefeuille et statistiques dans la même transaction. */
import { q, tx, type Q } from "./db.js";
import { ApiError, debit, credit, addHistory, balanceOf } from "./core.js";
import * as G from "./games/minigames.js";

const MAX_BET = 500;
const checkBet = (raw: unknown) => {
  const bet = Math.floor(Number(raw));
  if (!(bet >= 1 && bet <= MAX_BET)) throw new ApiError(400, `Mise entre 1 et ${MAX_BET} VC`);
  return bet;
};
const wrap = <T>(fn: () => T): T => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof G.GameError) throw new ApiError(400, e.message);
    throw e;
  }
};
const bal = async (c: Q, userId: string) => (await c.query<{ balance: number }>("SELECT balance FROM wallets WHERE user_id = $1", [userId])).rows[0].balance;

// ------------------------------------------------------------ Mines
async function minesSettle(c: Q, userId: string, g: G.MinesGame) {
  if (g.stage === "playing") return;
  if (g.payout > 0) await credit(c, userId, g.payout, "MINES_PAYOUT", `${g.mines} mines`);
  const net = g.payout - g.bet;
  const mult = g.stage === "cashed" ? G.minesMultiplier(g.mines, g.revealed.length) : 0;
  await c.query("UPDATE game_stats SET mines_rounds = mines_rounds + 1, mines_net = mines_net + $2, mines_best_mult = GREATEST(mines_best_mult, $3) WHERE user_id = $1", [userId, net, mult]);
  await addHistory(c, userId, "mines", g.stage === "cashed" ? "Encaissé" : "Mine touchée", net, { label: g.stage === "cashed" ? `×${mult} avec ${g.mines} mines` : `Mine après ${g.revealed.length} case(s)` });
}

async function minesLoad(c: Q, userId: string) {
  const { rows } = await c.query<{ state: G.MinesGame }>("SELECT state FROM mines_games WHERE user_id = $1 FOR UPDATE", [userId]);
  return rows[0]?.state ?? null;
}
async function minesSave(c: Q, userId: string, g: G.MinesGame) {
  await c.query(
    "INSERT INTO mines_games (user_id, state) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()",
    [userId, JSON.stringify(g)],
  );
}

export async function minesGet(userId: string) {
  const { rows } = await q<{ state: G.MinesGame }>("SELECT state FROM mines_games WHERE user_id = $1", [userId]);
  return { game: rows[0] ? G.minesView(rows[0].state) : null, balance: await balanceOf(userId) };
}

export async function minesStart(userId: string, body: any) {
  const bet = checkBet(body.bet);
  return tx(async (c) => {
    const cur = await minesLoad(c, userId);
    if (cur && cur.stage === "playing") throw new ApiError(400, "Terminez d'abord la partie en cours");
    const g = wrap(() => G.minesStart(bet, Math.floor(Number(body.mines))));
    await debit(c, userId, bet, "MINES_BET", `${g.mines} mines`);
    await minesSave(c, userId, g);
    return { game: G.minesView(g), balance: await bal(c, userId) };
  });
}

export async function minesAction(userId: string, body: any) {
  return tx(async (c) => {
    const g = await minesLoad(c, userId);
    if (!g || g.stage !== "playing") throw new ApiError(400, "Aucune partie en cours");
    wrap(() => (body.action === "cashout" ? G.minesCashout(g) : G.minesReveal(g, Math.floor(Number(body.cell)))));
    await minesSettle(c, userId, g);
    await minesSave(c, userId, g);
    return { game: G.minesView(g), balance: await bal(c, userId) };
  });
}

// ------------------------------------------------------------ Roulette
export async function rouletteSpin(userId: string, body: any) {
  const bets = wrap(() => G.validateRouletteBets(body.bets));
  const total = bets.reduce((a, b) => a + b.amount, 0);
  if (total > MAX_BET) throw new ApiError(400, `Mise totale limitée à ${MAX_BET} VC par tour`);
  return tx(async (c) => {
    await debit(c, userId, total, "ROULETTE_BET", "Roulette");
    const r = G.rouletteSpin(bets);
    if (r.payout > 0) await credit(c, userId, r.payout, "ROULETTE_PAYOUT", `Numéro ${r.number}`);
    const net = r.payout - r.total;
    await c.query("UPDATE game_stats SET roulette_spins = roulette_spins + 1, roulette_net = roulette_net + $2 WHERE user_id = $1", [userId, net]);
    if (r.payout >= r.total * 5) await addHistory(c, userId, "roulette", "Gros gain", net, { label: `Numéro ${r.number}` });
    return { ...r, balance: await bal(c, userId) };
  });
}

// ------------------------------------------------------------ Plinko
export async function plinkoDrop(userId: string, body: any) {
  const bet = checkBet(body.bet);
  const risk = body.risk as G.PlinkoRisk;
  const d = wrap(() => G.plinkoDrop(bet, risk));
  return tx(async (c) => {
    await debit(c, userId, bet, "PLINKO_BET", "Plinko");
    if (d.payout > 0) await credit(c, userId, d.payout, "PLINKO_PAYOUT", `×${d.multiplier}`);
    const net = d.payout - bet;
    await c.query("UPDATE game_stats SET plinko_drops = plinko_drops + 1, plinko_net = plinko_net + $2, plinko_best_mult = GREATEST(plinko_best_mult, $3) WHERE user_id = $1", [userId, net, d.multiplier]);
    if (d.multiplier >= 10) await addHistory(c, userId, "plinko", "Gros gain", net, { label: `×${d.multiplier}` });
    return { ...d, balance: await bal(c, userId) };
  });
}

export function casinoInfo() {
  return {
    mines: { grid: G.MINES_GRID, rtp: G.MINES_RTP, maxBet: MAX_BET },
    roulette: { red: [...G.RED], wheel: G.WHEEL, rtp: 36 / 37, maxBet: MAX_BET },
    plinko: { rows: G.PLINKO_ROWS, tables: G.PLINKO_TABLES, rtp: { faible: G.plinkoRTP("faible"), moyen: G.plinkoRTP("moyen"), eleve: G.plinkoRTP("eleve") }, maxBet: MAX_BET },
  };
}
