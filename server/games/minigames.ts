/**
 * Mines, Roulette européenne et Plinko — tirages par le serveur (Web Crypto).
 * Tous les taux de retour sont publics et affichés dans l'interface.
 */
import { createHash, randomBytes } from "node:crypto";
import { randomInt } from "./cards.js";

export class GameError extends Error {}

// =================================================================== MINES
export const MINES_GRID = 25;
export const MINES_RTP = 0.97;

export interface MinesGame {
  bet: number;
  mines: number;
  layout: number[]; // positions des mines (secret tant que la partie dure)
  salt: string;
  commitment: string; // empreinte publiée dès le début : preuve que la grille n'a pas changé
  revealed: number[];
  stage: "playing" | "lost" | "cashed";
  hit?: number;
  payout: number;
}

/** Multiplicateur après `k` cases sûres découvertes : chances inverses × taux de retour. */
export function minesMultiplier(mines: number, k: number): number {
  let m = 1;
  for (let i = 0; i < k; i++) m *= (MINES_GRID - i) / (MINES_GRID - mines - i);
  return k === 0 ? 1 : Math.floor(m * MINES_RTP * 100) / 100;
}

export const commitmentOf = (layout: number[], salt: string) =>
  createHash("sha256").update(`${[...layout].sort((a, b) => a - b).join(",")}:${salt}`).digest("hex");

export function minesStart(bet: number, mines: number): MinesGame {
  if (!Number.isInteger(mines) || mines < 1 || mines > 24) throw new GameError("Choisissez entre 1 et 24 mines");
  const cells = Array.from({ length: MINES_GRID }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  const layout = cells.slice(0, mines).sort((a, b) => a - b);
  const salt = randomBytes(12).toString("hex");
  return { bet, mines, layout, salt, commitment: commitmentOf(layout, salt), revealed: [], stage: "playing", payout: 0 };
}

export function minesReveal(g: MinesGame, cell: number) {
  if (g.stage !== "playing") throw new GameError("La partie est terminée");
  if (!Number.isInteger(cell) || cell < 0 || cell >= MINES_GRID) throw new GameError("Case invalide");
  if (g.revealed.includes(cell)) throw new GameError("Case déjà découverte");
  if (g.layout.includes(cell)) {
    g.stage = "lost";
    g.hit = cell;
    g.payout = 0;
    return;
  }
  g.revealed.push(cell);
  // toutes les cases sûres trouvées : encaissement automatique
  if (g.revealed.length === MINES_GRID - g.mines) minesCashout(g);
}

export function minesCashout(g: MinesGame) {
  if (g.stage !== "playing") throw new GameError("La partie est terminée");
  if (g.revealed.length === 0) throw new GameError("Découvrez au moins une case avant d'encaisser");
  g.stage = "cashed";
  g.payout = Math.floor(g.bet * minesMultiplier(g.mines, g.revealed.length));
}

export function minesView(g: MinesGame) {
  const over = g.stage !== "playing";
  const k = g.revealed.length;
  return {
    bet: g.bet,
    mines: g.mines,
    stage: g.stage,
    revealed: g.revealed,
    hit: g.hit ?? null,
    layout: over ? g.layout : null, // jamais envoyé pendant la partie
    salt: over ? g.salt : null,
    commitment: g.commitment,
    multiplier: minesMultiplier(g.mines, k),
    nextMultiplier: k < MINES_GRID - g.mines ? minesMultiplier(g.mines, k + 1) : null,
    cashoutValue: k ? Math.floor(g.bet * minesMultiplier(g.mines, k)) : 0,
    safeChance: k < MINES_GRID - g.mines ? (MINES_GRID - g.mines - k) / (MINES_GRID - k) : 0,
    payout: g.payout,
  };
}

// =================================================================== ROULETTE
export const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
/** Ordre des cases sur le cylindre européen. */
export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];

export type RouletteBetType = "plein" | "rouge" | "noir" | "pair" | "impair" | "manque" | "passe" | "douzaine" | "colonne";
export interface RouletteBet {
  type: RouletteBetType;
  value?: number; // numéro (plein) ou 1-3 (douzaine/colonne)
  amount: number;
}

const PAYS: Record<RouletteBetType, number> = { plein: 35, rouge: 1, noir: 1, pair: 1, impair: 1, manque: 1, passe: 1, douzaine: 2, colonne: 2 };

export function rouletteWins(b: RouletteBet, n: number): boolean {
  if (n === 0) return b.type === "plein" && b.value === 0;
  switch (b.type) {
    case "plein":
      return b.value === n;
    case "rouge":
      return RED.has(n);
    case "noir":
      return !RED.has(n);
    case "pair":
      return n % 2 === 0;
    case "impair":
      return n % 2 === 1;
    case "manque":
      return n <= 18;
    case "passe":
      return n >= 19;
    case "douzaine":
      return Math.ceil(n / 12) === b.value;
    case "colonne":
      return ((n - 1) % 3) + 1 === b.value;
  }
}

export function validateRouletteBets(bets: unknown): RouletteBet[] {
  if (!Array.isArray(bets) || bets.length === 0 || bets.length > 40) throw new GameError("Placez entre 1 et 40 mises");
  return bets.map((raw: any) => {
    const type = raw?.type as RouletteBetType;
    if (!(type in PAYS)) throw new GameError("Type de mise inconnu");
    const amount = Math.floor(Number(raw.amount));
    if (!(amount >= 1 && amount <= 100_000)) throw new GameError("Chaque mise doit être comprise entre 1 et 100 000 VC");
    const value = raw.value === undefined ? undefined : Math.floor(Number(raw.value));
    if (type === "plein" && !(value! >= 0 && value! <= 36)) throw new GameError("Numéro invalide");
    if ((type === "douzaine" || type === "colonne") && !(value! >= 1 && value! <= 3)) throw new GameError("Douzaine ou colonne invalide");
    return { type, amount, ...(value !== undefined && ["plein", "douzaine", "colonne"].includes(type) ? { value } : {}) };
  });
}

export function rouletteSpin(bets: RouletteBet[]) {
  const n = randomInt(37);
  const results = bets.map((b) => {
    const won = rouletteWins(b, n);
    return { ...b, won, payout: won ? b.amount * (PAYS[b.type] + 1) : 0 };
  });
  return {
    number: n,
    color: n === 0 ? "vert" : RED.has(n) ? "rouge" : "noir",
    wheelIndex: WHEEL.indexOf(n),
    results,
    total: bets.reduce((a, b) => a + b.amount, 0),
    payout: results.reduce((a, r) => a + r.payout, 0),
  };
}

// =================================================================== PLINKO
export const PLINKO_ROWS = 12;
export type PlinkoRisk = "faible" | "moyen" | "eleve";
export const PLINKO_TABLES: Record<PlinkoRisk, number[]> = {
  faible: [10, 3, 1.6, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 1.6, 3, 10],
  moyen: [33, 11, 4, 2, 1.1, 0.6, 0.3, 0.6, 1.1, 2, 4, 11, 33],
  eleve: [170, 24, 8.1, 2, 0.7, 0.2, 0.2, 0.2, 0.7, 2, 8.1, 24, 170],
};

const binom = (n: number, k: number) => {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};
export function plinkoRTP(risk: PlinkoRisk): number {
  return PLINKO_TABLES[risk].reduce((a, m, k) => a + m * (binom(PLINKO_ROWS, k) / 2 ** PLINKO_ROWS), 0);
}

export function plinkoDrop(bet: number, risk: PlinkoRisk) {
  if (!(risk in PLINKO_TABLES)) throw new GameError("Niveau de risque inconnu");
  const path: number[] = []; // 0 = gauche, 1 = droite à chaque rangée de clous
  for (let i = 0; i < PLINKO_ROWS; i++) path.push(randomInt(2));
  const slot = path.reduce((a, b) => a + b, 0);
  const multiplier = PLINKO_TABLES[risk][slot];
  return { path, slot, multiplier, payout: Math.floor(bet * multiplier) };
}
