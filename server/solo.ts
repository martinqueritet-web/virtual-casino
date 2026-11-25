import { q, tx } from "./db.js";
import { ApiError, debit, credit, addHistory, balanceOf } from "./core.js";
import * as BJ from "./games/blackjack.js";
import * as SL from "./games/slots.js";

// ------------------------------------------------------------ blackjack

const BJ_MIN = 1;
const BJ_MAX = 500;

async function bjSettled(c: Parameters<Parameters<typeof tx>[0]>[0], userId: string, g: BJ.BJGame) {
  if (g.stage !== "done") return;
  const net = g.totalPayout - g.totalBet;
  if (!Number.isFinite(net)) throw new Error("Manche de blackjack incohérente : montant non numérique");
  if (g.practice) {
    const decisions = g.feedback.length;
    const correct = g.feedback.filter((f) => f.correct).length;
    await c.query(
      "UPDATE game_stats SET bj_practice_rounds = bj_practice_rounds + 1, bj_practice_decisions = bj_practice_decisions + $2, bj_practice_correct = bj_practice_correct + $3 WHERE user_id = $1",
      [userId, decisions, correct],
    );
    return;
  }
  if (g.totalPayout > 0) await credit(c, userId, g.totalPayout, "BJ_PAYOUT", g.message ?? null);
  const res = g.hands.map((h) => h.result!);
  const wins = res.filter((r) => r === "win" || r === "blackjack").length;
  const losses = res.filter((r) => r === "lose" || r === "bust" || r === "surrender").length;
  const pushes = res.filter((r) => r === "push").length;
  await c.query(
    `UPDATE game_stats SET bj_rounds = bj_rounds + 1, bj_wins = bj_wins + $2, bj_losses = bj_losses + $3,
       bj_pushes = bj_pushes + $4, bj_blackjacks = bj_blackjacks + $5, bj_net = bj_net + $6 WHERE user_id = $1`,
    [userId, wins, losses, pushes, res.filter((r) => r === "blackjack").length, net],
  );
  await addHistory(c, userId, "blackjack", net > 0 ? "Gagnée" : net < 0 ? "Perdue" : "Égalité", net, { message: g.message });
}

export async function bjGet(userId: string) {
  const { rows } = await q<{ state: BJ.BJGame }>("SELECT state FROM blackjack_games WHERE user_id = $1", [userId]);
  return { game: rows[0] ? BJ.bjView(BJ.normalize(rows[0].state)) : null, balance: await balanceOf(userId) };
}

export async function bjStart(userId: string, body: any) {
  const practice = !!body.practice;
  const bet = Math.floor(Number(body.bet));
  if (!(bet >= BJ_MIN && bet <= BJ_MAX)) throw new ApiError(400, `Mise entre ${BJ_MIN} et ${BJ_MAX} VC`);
  return tx(async (c) => {
    const { rows } = await c.query<{ state: BJ.BJGame }>("SELECT state FROM blackjack_games WHERE user_id = $1 FOR UPDATE", [userId]);
    if (rows[0] && rows[0].state.stage !== "done" && !rows[0].state.practice) throw new ApiError(400, "Terminez d'abord la manche en cours");
    if (!practice) await debit(c, userId, bet, "BJ_BET", "Mise blackjack");
    // le sabot est conservé d'une manche à l'autre jusqu'à la carte de coupe
    const prev = rows[0]?.state;
    const g = BJ.newGame(bet, practice, prev?.shoe && prev.stage === "done" ? { shoe: prev.shoe, discards: prev.discards ?? 0 } : undefined);
    await bjSettled(c, userId, g);
    await c.query(
      "INSERT INTO blackjack_games (user_id, state) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()",
      [userId, JSON.stringify(g)],
    );
    const { rows: b } = await c.query<{ balance: number }>("SELECT balance FROM wallets WHERE user_id = $1", [userId]);
    return { game: BJ.bjView(g), balance: b[0].balance };
  });
}

export async function bjAction(userId: string, body: any) {
  const action = body.action as BJ.BJAction;
  if (!["hit", "stand", "double", "split", "surrender"].includes(action)) throw new ApiError(400, "Action inconnue");
  return tx(async (c) => {
    const { rows } = await c.query<{ state: BJ.BJGame }>("SELECT state FROM blackjack_games WHERE user_id = $1 FOR UPDATE", [userId]);
    const g = rows[0]?.state ? BJ.normalize(rows[0].state) : undefined;
    if (!g || g.stage !== "player") throw new ApiError(400, "Aucune manche en cours");
    if (!BJ.legal(g)[action]) throw new ApiError(400, "Action impossible pour cette main");
    const cost = BJ.actionCost(g, action);
    if (cost && !g.practice) await debit(c, userId, cost, "BJ_BET", action === "double" ? "Doubler" : "Séparer");
    try {
      BJ.play(g, action);
    } catch (e) {
      throw new ApiError(400, (e as Error).message);
    }
    await bjSettled(c, userId, g);
    await c.query("UPDATE blackjack_games SET state = $2, updated_at = NOW() WHERE user_id = $1", [userId, JSON.stringify(g)]);
    const { rows: b } = await c.query<{ balance: number }>("SELECT balance FROM wallets WHERE user_id = $1", [userId]);
    return { game: BJ.bjView(g), balance: b[0].balance };
  });
}

export async function bjInsurance(userId: string, body: any) {
  const take = !!body.take;
  return tx(async (c) => {
    const { rows } = await c.query<{ state: BJ.BJGame }>("SELECT state FROM blackjack_games WHERE user_id = $1 FOR UPDATE", [userId]);
    const g = rows[0]?.state ? BJ.normalize(rows[0].state) : undefined;
    if (!g || g.stage !== "insurance") throw new ApiError(400, "L'assurance n'est pas proposée");
    const cost = BJ.insuranceCost(g);
    if (take && cost > 0 && !g.practice) await debit(c, userId, cost, "BJ_BET", "Assurance");
    BJ.decideInsurance(g, take && cost > 0);
    await bjSettled(c, userId, g);
    await c.query("UPDATE blackjack_games SET state = $2, updated_at = NOW() WHERE user_id = $1", [userId, JSON.stringify(g)]);
    const { rows: b } = await c.query<{ balance: number }>("SELECT balance FROM wallets WHERE user_id = $1", [userId]);
    return { game: BJ.bjView(g), balance: b[0].balance };
  });
}

// ------------------------------------------------------------ machines à sous

export async function slotSpin(userId: string, body: any) {
  const machine = SL.MACHINES.find((m) => m.id === body.machine);
  if (!machine) throw new ApiError(400, "Machine inconnue");
  const bet = Math.floor(Number(body.bet));
  if (!SL.BETS.includes(bet)) throw new ApiError(400, "Mise invalide");
  const r = SL.spin(bet);
  return tx(async (c) => {
    const delta = r.win - bet;
    const { rows } = await c.query<{ balance: number }>(
      "UPDATE wallets SET balance = balance + $2, updated_at = NOW() WHERE user_id = $1 AND balance >= $3 RETURNING balance",
      [userId, delta, bet],
    );
    if (!rows[0]) throw new ApiError(400, "Solde de crédits virtuels insuffisant");
    await c.query("INSERT INTO wallet_tx (user_id, kind, amount, balance_after, ref) VALUES ($1, 'SLOTS', $2, $3, $4)", [userId, delta, rows[0].balance, machine.name]);
    await c.query(
      "UPDATE game_stats SET slots_spins = slots_spins + 1, slots_net = slots_net + $2, slots_biggest_win = GREATEST(slots_biggest_win, $3) WHERE user_id = $1",
      [userId, delta, r.win],
    );
    if (r.win >= bet * 10) await addHistory(c, userId, "slots", "Gros gain", delta, { machine: machine.name, win: r.win });
    return { ...r, balance: rows[0].balance };
  });
}
