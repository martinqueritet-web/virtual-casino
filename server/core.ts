import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { q, tx, type Q } from "./db.js";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const START_BALANCE = 500;
/** En dessous de ce solde, le bouton « Recharger » apparaît. */
export const REFILL_THRESHOLD = 10;
/** Mise maximale par coup (la vraie limite est le solde du joueur). */
export const MAX_BET = 100_000;
export function checkBet(raw: unknown): number {
  const bet = Math.floor(Number(raw));
  if (!(bet >= 1 && bet <= MAX_BET)) throw new ApiError(400, `Mise entre 1 et ${MAX_BET.toLocaleString("fr-FR")} VC`);
  return bet;
}
/** Salons où l'utilisateur ($1) a des jetons posés sur la table. */
export const SEATED_SQL = `SELECT code, updated_at FROM rooms WHERE jsonb_path_exists(state, '$.poker.seats[*] ? (@.userId == $uid)', jsonb_build_object('uid', $1::text))`;
const SESSION_DAYS = 30;

export interface User {
  id: string;
  username: string;
  avatar: string;
  avatar_color: string;
  prefs: Record<string, unknown>;
  created_at: string;
}

// ------------------------------------------------------------ mots de passe
export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}
export function verifyPassword(pw: string, stored: string): boolean {
  const [, s, h] = stored.split("$");
  const expected = Buffer.from(h, "base64");
  const got = scryptSync(pw, Buffer.from(s, "base64"), expected.length, { N: 16384, r: 8, p: 1 });
  return timingSafeEqual(expected, got);
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

// ------------------------------------------------------------ comptes
const USERNAME_RE = /^[A-Za-z0-9_\-À-ÿ]{3,16}$/;

export async function register(username: string, password: string) {
  username = String(username ?? "").trim();
  password = String(password ?? "");
  if (!USERNAME_RE.test(username)) throw new ApiError(400, "Pseudo : 3 à 16 caractères (lettres, chiffres, - et _)");
  if (password.length < 6 || password.length > 100) throw new ApiError(400, "Le mot de passe doit faire au moins 6 caractères");
  const avatars = ["🎩", "🃏", "🦊", "🐯", "🦁", "🐺", "🦉", "👑", "💎", "🍀"];
  const avatar = avatars[Math.floor(Math.random() * avatars.length)];
  const user = await tx(async (c) => {
    const exists = await c.query("SELECT 1 FROM users WHERE LOWER(username) = LOWER($1)", [username]);
    if (exists.rowCount) throw new ApiError(409, "Ce pseudo est déjà pris");
    const { rows } = await c.query<User>(
      "INSERT INTO users (username, password_hash, avatar) VALUES ($1, $2, $3) RETURNING id, username, avatar, avatar_color, prefs, created_at",
      [username, hashPassword(password), avatar],
    );
    const u = rows[0];
    await c.query("INSERT INTO wallets (user_id, balance) VALUES ($1, $2)", [u.id, START_BALANCE]);
    await c.query("INSERT INTO wallet_tx (user_id, kind, amount, balance_after, ref) VALUES ($1, 'SIGNUP_GRANT', $2, $2, 'Bienvenue')", [u.id, START_BALANCE]);
    await c.query("INSERT INTO game_stats (user_id) VALUES ($1)", [u.id]);
    return u;
  });
  return { user, token: await createSession(user.id) };
}

export async function login(username: string, password: string) {
  const { rows } = await q<User & { password_hash: string }>(
    "SELECT id, username, avatar, avatar_color, prefs, created_at, password_hash FROM users WHERE LOWER(username) = LOWER($1)",
    [String(username ?? "").trim()],
  );
  const u = rows[0];
  if (!u || !verifyPassword(String(password ?? ""), u.password_hash)) throw new ApiError(401, "Pseudo ou mot de passe incorrect");
  const { password_hash, ...user } = u;
  return { user, token: await createSession(user.id) };
}

async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await q("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + ($3 || ' days')::interval)", [sha(token), userId, String(SESSION_DAYS)]);
  return token;
}

export async function authenticate(req: Request): Promise<User> {
  const h = req.headers.get("authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) throw new ApiError(401, "Connexion requise");
  const { rows } = await q<User>(
    `SELECT u.id, u.username, u.avatar, u.avatar_color, u.prefs, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [sha(token)],
  );
  if (!rows[0]) throw new ApiError(401, "Session expirée, reconnectez-vous");
  return rows[0];
}

export async function logout(req: Request) {
  const h = req.headers.get("authorization") ?? "";
  if (h.startsWith("Bearer ")) await q("DELETE FROM sessions WHERE token_hash = $1", [sha(h.slice(7))]);
}

// ------------------------------------------------------------ portefeuille
/** Débit atomique : échoue si le solde est insuffisant (jamais de solde négatif). */
export async function debit(c: Q, userId: string, amount: number, kind: string, ref: string | null = null): Promise<number> {
  if (!Number.isInteger(amount) || amount <= 0) throw new ApiError(400, "Montant invalide");
  const { rows } = await c.query<{ balance: number }>(
    "UPDATE wallets SET balance = balance - $2, updated_at = NOW() WHERE user_id = $1 AND balance >= $2 RETURNING balance",
    [userId, amount],
  );
  if (!rows[0]) throw new ApiError(400, "Solde de crédits virtuels insuffisant");
  await c.query("INSERT INTO wallet_tx (user_id, kind, amount, balance_after, ref) VALUES ($1, $2, $3, $4, $5)", [userId, kind, -amount, rows[0].balance, ref]);
  return rows[0].balance;
}

export async function credit(c: Q, userId: string, amount: number, kind: string, ref: string | null = null): Promise<number> {
  if (!Number.isInteger(amount) || amount < 0) throw new ApiError(400, "Montant invalide");
  const { rows } = await c.query<{ balance: number }>(
    "UPDATE wallets SET balance = balance + $2, updated_at = NOW() WHERE user_id = $1 RETURNING balance",
    [userId, amount],
  );
  if (amount > 0) await c.query("INSERT INTO wallet_tx (user_id, kind, amount, balance_after, ref) VALUES ($1, $2, $3, $4, $5)", [userId, kind, amount, rows[0].balance, ref]);
  return rows[0].balance;
}

export async function balanceOf(userId: string, c: Q = { query: q }): Promise<number> {
  const { rows } = await c.query<{ balance: number }>("SELECT balance FROM wallets WHERE user_id = $1", [userId]);
  return rows[0]?.balance ?? 0;
}

/** Réinitialisation gratuite à 500 VC (impossible si des jetons sont posés sur une table). */
export async function resetWallet(userId: string) {
  return tx(async (c) => {
    const seated = await c.query<{ code: string }>(SEATED_SQL, [userId]);
    if (seated.rowCount)
      throw new ApiError(
        400,
        `Une main est encore en cours au salon ${seated.rows.map((r) => r.code).join(", ")} : vos jetons vous seront rendus dès qu'elle se termine. Réessayez dans un instant.`,
      );
    const mines = await c.query("SELECT 1 FROM mines_games WHERE user_id = $1 AND state->>'stage' = 'playing'", [userId]);
    if (mines.rowCount) throw new ApiError(400, "Terminez d'abord votre partie de Mines");
    const vp = await c.query("SELECT 1 FROM videopoker_games WHERE user_id = $1 AND state->>'stage' = 'hold'", [userId]);
    if (vp.rowCount) throw new ApiError(400, "Terminez d'abord votre main de vidéo poker");
    const solo = await c.query("SELECT 1 FROM solo_poker WHERE user_id = $1", [userId]);
    if (solo.rowCount) throw new ApiError(400, "Quittez d'abord votre table contre les bots pour réinitialiser votre portefeuille");
    const bj = await c.query("SELECT 1 FROM blackjack_games WHERE user_id = $1 AND state->>'stage' <> 'done' AND (state->>'practice')::boolean = false", [userId]);
    if (bj.rowCount) throw new ApiError(400, "Terminez votre main de blackjack en cours");
    const { rows } = await c.query<{ balance: number }>("SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE", [userId]);
    const delta = START_BALANCE - rows[0].balance;
    await c.query("UPDATE wallets SET balance = $2, updated_at = NOW() WHERE user_id = $1", [userId, START_BALANCE]);
    await c.query("INSERT INTO wallet_tx (user_id, kind, amount, balance_after, ref) VALUES ($1, 'RESET', $2, $3, 'Réinitialisation')", [userId, delta, START_BALANCE]);
    return START_BALANCE;
  });
}

// ------------------------------------------------------------ profil & stats
const AVATARS = ["🎩", "🃏", "🦊", "🐯", "🦁", "🐺", "🦉", "👑", "💎", "🍀", "🐉", "🦄", "🐙", "🦅", "🐼", "🤠", "🧙", "🥷", "👩‍🚀", "🧛"];
const PREF_KEYS = ["sound", "reducedFx", "colorblind", "showHelp", "cardBack", "tableTheme", "lowPower"];

export async function updateProfile(userId: string, body: any) {
  const sets: string[] = [];
  const vals: unknown[] = [userId];
  if (body.avatar !== undefined) {
    if (!AVATARS.includes(body.avatar)) throw new ApiError(400, "Avatar inconnu");
    vals.push(body.avatar);
    sets.push(`avatar = $${vals.length}`);
  }
  if (body.avatarColor !== undefined) {
    if (!/^#[0-9a-fA-F]{6}$/.test(body.avatarColor)) throw new ApiError(400, "Couleur invalide");
    vals.push(body.avatarColor);
    sets.push(`avatar_color = $${vals.length}`);
  }
  if (body.prefs && typeof body.prefs === "object") {
    const clean: Record<string, unknown> = {};
    for (const k of PREF_KEYS) if (k in body.prefs) clean[k] = typeof body.prefs[k] === "boolean" ? body.prefs[k] : String(body.prefs[k]).slice(0, 20);
    vals.push(JSON.stringify(clean));
    sets.push(`prefs = prefs || $${vals.length}::jsonb`);
  }
  if (!sets.length) throw new ApiError(400, "Rien à modifier");
  const { rows } = await q<User>(`UPDATE users SET ${sets.join(", ")} WHERE id = $1 RETURNING id, username, avatar, avatar_color, prefs, created_at`, vals);
  return rows[0];
}

export async function getStats(userId: string) {
  const [stats, tx, hist] = await Promise.all([
    q("SELECT * FROM game_stats WHERE user_id = $1", [userId]),
    q("SELECT kind, amount, balance_after, ref, created_at FROM wallet_tx WHERE user_id = $1 ORDER BY id DESC LIMIT 120", [userId]),
    q("SELECT game, result, net, detail, created_at FROM game_history WHERE user_id = $1 ORDER BY id DESC LIMIT 40", [userId]),
  ]);
  return { stats: stats.rows[0] ?? null, transactions: tx.rows.reverse(), history: hist.rows };
}

const RANGES: Record<string, string | null> = { "1h": "1 hour", "24h": "24 hours", "7d": "7 days", "30d": "30 days", all: null };

/** Jeu associé à chaque type de mouvement du portefeuille. */
const KIND_GAME: [RegExp, string][] = [
  [/^POKER_/, "Poker"],
  [/^BJ_/, "Blackjack"],
  [/^SLOTS/, "Machines à sous"],
  [/^MINES_/, "Mines"],
  [/^ROULETTE_/, "Roulette"],
  [/^PLINKO_/, "Plinko"],
  [/^BACCARAT_/, "Baccara"],
  [/^VP_/, "Vidéo poker"],
  [/^KENO_/, "Keno"],
  [/^WHEEL_/, "Roue de la fortune"],
];

/**
 * Évolution du solde sur une période : point de départ, courbe (réduite à 300 points
 * au plus, en gardant le plus haut et le plus bas de chaque tranche), résumé et bilan par jeu.
 */
export async function balanceHistory(userId: string, range: string) {
  if (!(range in RANGES)) throw new ApiError(400, "Période inconnue");
  const interval = RANGES[range];
  const since = interval ? `NOW() - INTERVAL '${interval}'` : "'-infinity'::timestamptz";
  const [start, series, kinds, now] = await Promise.all([
    q<{ balance_after: number; created_at: string }>(
      `SELECT balance_after, created_at FROM wallet_tx WHERE user_id = $1 AND created_at < ${since} ORDER BY id DESC LIMIT 1`,
      [userId],
    ),
    q<{ t: string; bal: number; lo: number; hi: number; n: number }>(
      `WITH t AS (
         SELECT id, balance_after, created_at, NTILE(300) OVER (ORDER BY id) AS b
           FROM wallet_tx WHERE user_id = $1 AND created_at >= ${since})
       SELECT MAX(created_at) AS t, (ARRAY_AGG(balance_after ORDER BY id DESC))[1] AS bal,
              MIN(balance_after) AS lo, MAX(balance_after) AS hi, COUNT(*)::int AS n
         FROM t GROUP BY b ORDER BY b`,
      [userId],
    ),
    q<{ kind: string; total: number; n: number }>(
      `SELECT kind, SUM(amount)::int AS total, COUNT(*)::int AS n FROM wallet_tx WHERE user_id = $1 AND created_at >= ${since} GROUP BY kind`,
      [userId],
    ),
    q<{ now: string; first: string | null; first_balance: number | null }>(
      `SELECT NOW() AS now, f.created_at AS first, f.balance_after AS first_balance
         FROM (SELECT 1) one LEFT JOIN LATERAL (SELECT created_at, balance_after FROM wallet_tx WHERE user_id = $1 ORDER BY id LIMIT 1) f ON TRUE`,
      [userId],
    ),
  ]);
  const balance = await balanceOf(userId);
  // avant la création du compte : on part du solde de bienvenue
  const startBalance = start.rows[0]?.balance_after ?? now.rows[0].first_balance ?? balance;
  const points = series.rows.map((r) => ({ t: new Date(r.t).getTime(), balance: r.bal, low: r.lo, high: r.hi }));
  const values = [startBalance, ...series.rows.flatMap((r) => [r.lo, r.hi]), balance].filter((v): v is number => v !== null);
  const byGame = new Map<string, number>();
  let resets = 0;
  let moves = 0;
  for (const k of kinds.rows) {
    moves += k.n;
    if (k.kind === "RESET") resets += k.n;
    const game = KIND_GAME.find(([re]) => re.test(k.kind))?.[1];
    if (game) byGame.set(game, (byGame.get(game) ?? 0) + k.total);
  }
  const nowMs = new Date(now.rows[0].now).getTime();
  const firstMs = now.rows[0].first ? new Date(now.rows[0].first).getTime() : nowMs;
  const from = interval ? nowMs - { "1h": 3.6e6, "24h": 8.64e7, "7d": 6.048e8, "30d": 2.592e9 }[range as "1h"]! : firstMs;
  return {
    range,
    from,
    to: nowMs,
    startBalance,
    balance,
    points,
    summary: {
      change: balance - startBalance,
      high: values.length ? Math.max(...values) : balance,
      low: values.length ? Math.min(...values) : balance,
      moves,
      resets,
    },
    byGame: [...byGame.entries()].map(([game, net]) => ({ game, net })).sort((a, b) => b.net - a.net),
  };
}

export async function addHistory(c: Q, userId: string, game: string, result: string, net: number, detail: object = {}) {
  await c.query("INSERT INTO game_history (user_id, game, result, net, detail) VALUES ($1, $2, $3, $4, $5)", [userId, game, result, net, JSON.stringify(detail)]);
}

export { AVATARS };
