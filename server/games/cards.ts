/** Entier aléatoire uniforme dans [0, n) via le générateur cryptographique (Web Crypto). */
export function randomInt(n: number): number {
  const max = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  let x: number;
  do {
    globalThis.crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= max);
  return x % n;
}

// Carte = "As" (As de pique), "Th" (10 de cœur), "2c", "Kd"
export type Card = string;
export const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"] as const;
export const SUITS = ["s", "h", "d", "c"] as const;

export function rankValue(card: Card): number {
  return RANKS.indexOf(card[0] as (typeof RANKS)[number]) + 2; // 2..14
}
export function suitOf(card: Card): string {
  return card[1];
}

export function newDeck(decks = 1): Card[] {
  const out: Card[] = [];
  for (let d = 0; d < decks; d++) for (const s of SUITS) for (const r of RANKS) out.push(r + s);
  return out;
}

/** Mélange Fisher-Yates avec le générateur cryptographique du serveur. */
export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const RANK_NAMES_FR: Record<number, { s: string; p: string; m: boolean }> = {
  2: { s: "Deux", p: "Deux", m: true },
  3: { s: "Trois", p: "Trois", m: true },
  4: { s: "Quatre", p: "Quatre", m: true },
  5: { s: "Cinq", p: "Cinq", m: true },
  6: { s: "Six", p: "Six", m: true },
  7: { s: "Sept", p: "Sept", m: true },
  8: { s: "Huit", p: "Huit", m: true },
  9: { s: "Neuf", p: "Neuf", m: true },
  10: { s: "Dix", p: "Dix", m: true },
  11: { s: "Valet", p: "Valets", m: true },
  12: { s: "Dame", p: "Dames", m: false },
  13: { s: "Roi", p: "Rois", m: true },
  14: { s: "As", p: "As", m: true },
};
export const rankSingular = (v: number) => RANK_NAMES_FR[v].s;
export const rankPlural = (v: number) => RANK_NAMES_FR[v].p;
/** "à l'As", "au Roi", "à la Dame" */
export function rankA(v: number): string {
  const n = RANK_NAMES_FR[v];
  if (v === 14 || v === 8) return `à l'${n.s}`;
  return n.m ? `au ${n.s}` : `à la ${n.s}`;
}
/** "aux Rois", "aux Dames" */
export const rankAux = (v: number) => `aux ${rankPlural(v)}`;
/** "de Rois", "d'As", "d'Huit" */
export function rankDe(v: number): string {
  const p = rankPlural(v);
  return v === 14 || v === 8 ? `d'${p}` : `de ${p}`;
}
