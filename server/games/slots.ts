/**
 * Machines à sous — 3 rouleaux, ligne centrale.
 * Mathématiques identiques et publiques pour toutes les machines :
 * taux de retour théorique affiché, tirage par le serveur (crypto).
 */
import { randomInt } from "./cards.js";

export interface SlotSymbol {
  id: string;
  icon: string;
  name: string;
}
export interface SlotMachine {
  id: string;
  name: string;
  tagline: string;
  symbols: SlotSymbol[]; // du plus rare au plus fréquent
  palette: { from: string; to: string; accent: string };
}

// Poids de chaque symbole sur chaque rouleau (même ordre que `symbols`)
export const WEIGHTS = [1, 2, 3, 4, 5, 7];
// Gains pour 3 symboles identiques (multiplicateur de la mise)
export const PAY3 = [200, 75, 30, 15, 10, 7];
// Gains pour les 2 premiers rouleaux identiques (3e différent)
export const PAY2 = [10, 5, 3, 2, 2, 2];
export const BETS = [1, 2, 5, 10, 25];

export const MACHINES: SlotMachine[] = [
  {
    id: "classique",
    name: "Royal Classique",
    tagline: "Les grands classiques du casino",
    symbols: [
      { id: "7", icon: "7️⃣", name: "Sept" },
      { id: "diamond", icon: "💎", name: "Diamant" },
      { id: "bell", icon: "🔔", name: "Cloche" },
      { id: "bar", icon: "🎰", name: "Bar" },
      { id: "lemon", icon: "🍋", name: "Citron" },
      { id: "cherry", icon: "🍒", name: "Cerise" },
    ],
    palette: { from: "#3b0a0a", to: "#120303", accent: "#e6b422" },
  },
  {
    id: "egypte",
    name: "Trésor du Nil",
    tagline: "Égypte antique",
    symbols: [
      { id: "pharaoh", icon: "👑", name: "Pharaon" },
      { id: "eye", icon: "👁️", name: "Œil d'Horus" },
      { id: "scarab", icon: "🪲", name: "Scarabée" },
      { id: "ankh", icon: "☥", name: "Ânkh" },
      { id: "pyramid", icon: "🔺", name: "Pyramide" },
      { id: "cat", icon: "🐈‍⬛", name: "Chat sacré" },
    ],
    palette: { from: "#3d2c08", to: "#150f02", accent: "#f2c14e" },
  },
  {
    id: "olympe",
    name: "Foudre de l'Olympe",
    tagline: "Mythologie grecque",
    symbols: [
      { id: "zeus", icon: "⚡", name: "Foudre" },
      { id: "trident", icon: "🔱", name: "Trident" },
      { id: "helmet", icon: "🪖", name: "Casque" },
      { id: "amphora", icon: "🏺", name: "Amphore" },
      { id: "laurel", icon: "🌿", name: "Laurier" },
      { id: "grapes", icon: "🍇", name: "Raisin" },
    ],
    palette: { from: "#0d1f3c", to: "#050b16", accent: "#9fc3ff" },
  },
  {
    id: "espace",
    name: "Odyssée Stellaire",
    tagline: "Voyage dans l'espace",
    symbols: [
      { id: "galaxy", icon: "🌌", name: "Galaxie" },
      { id: "rocket", icon: "🚀", name: "Fusée" },
      { id: "planet", icon: "🪐", name: "Planète" },
      { id: "alien", icon: "👽", name: "Alien" },
      { id: "star", icon: "⭐", name: "Étoile" },
      { id: "moon", icon: "🌙", name: "Lune" },
    ],
    palette: { from: "#1a0b33", to: "#05020c", accent: "#b48cff" },
  },
  {
    id: "neon",
    name: "Néon 2099",
    tagline: "Néons futuristes",
    symbols: [
      { id: "crown", icon: "💠", name: "Cristal" },
      { id: "bolt", icon: "🔋", name: "Batterie" },
      { id: "disc", icon: "💿", name: "Disque" },
      { id: "robot", icon: "🤖", name: "Robot" },
      { id: "joy", icon: "🕹️", name: "Manette" },
      { id: "chip", icon: "🔌", name: "Prise" },
    ],
    palette: { from: "#06283a", to: "#02080d", accent: "#29f5ff" },
  },
];

/** Bande d'un rouleau : chaque symbole répété selon son poids, entrelacé. */
export const STRIP: number[] = (() => {
  const s: number[] = [];
  const left = WEIGHTS.slice();
  while (left.some((w) => w > 0)) for (let i = left.length - 1; i >= 0; i--) if (left[i]-- > 0) s.push(i);
  return s;
})();

export function theoreticalRTP(): number {
  const N = STRIP.length;
  let rtp = 0;
  WEIGHTS.forEach((w, i) => {
    const p = w / N;
    rtp += p * p * p * PAY3[i];
    rtp += p * p * (1 - p) * PAY2[i];
  });
  return rtp;
}

export function payoutFor(line: number[], bet: number): { win: number; kind: string | null } {
  const [a, b, c] = line;
  if (a === b && b === c) return { win: bet * PAY3[a], kind: "3" };
  if (a === b) return { win: bet * PAY2[a], kind: "2" };
  return { win: 0, kind: null };
}

export function spin(bet: number) {
  if (!BETS.includes(bet)) throw new Error("Mise invalide");
  const N = STRIP.length;
  const stops = [randomInt(N), randomInt(N), randomInt(N)];
  // fenêtre visible : au-dessus, ligne gagnante, en dessous
  const grid = stops.map((p) => [STRIP[(p - 1 + N) % N], STRIP[p], STRIP[(p + 1) % N]]);
  const line = grid.map((col) => col[1]);
  const { win, kind } = payoutFor(line, bet);
  return { stops, grid, line, win, kind };
}

export function publicMachines() {
  return {
    machines: MACHINES,
    pay3: PAY3,
    pay2: PAY2,
    bets: BETS,
    probabilities: WEIGHTS.map((w) => w / STRIP.length),
    rtp: theoreticalRTP(),
  };
}
