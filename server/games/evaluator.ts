import { Card, rankValue, suitOf, rankSingular, rankA, rankAux, rankDe, rankPlural } from "./cards.js";

export const CATEGORY_NAMES = [
  "Carte haute",
  "Paire",
  "Double paire",
  "Brelan",
  "Quinte",
  "Couleur",
  "Full",
  "Carré",
  "Quinte flush",
] as const;

export interface HandValue {
  category: number; // 0..8
  /** valeurs de départage, ordre décroissant d'importance */
  tiebreak: number[];
  /** score comparable directement */
  score: number;
  best: Card[];
  label: string;
}

function scoreOf(category: number, tiebreak: number[]): number {
  let s = category;
  for (let i = 0; i < 5; i++) s = s * 15 + (tiebreak[i] ?? 0);
  return s;
}

/** Évalue exactement 5 cartes. */
export function evaluate5(cards: Card[]): HandValue {
  const vals = cards.map(rankValue).sort((a, b) => b - a);
  const flush = cards.every((c) => suitOf(c) === suitOf(cards[0]));
  const uniq = [...new Set(vals)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (vals[0] - vals[4] === 4) straightHigh = vals[0];
    else if (vals[0] === 14 && vals[1] === 5) straightHigh = 5; // roue A-2-3-4-5
  }
  const counts = new Map<number, number>();
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  let category: number;
  let tiebreak: number[];
  if (straightHigh && flush) {
    category = 8;
    tiebreak = [straightHigh];
  } else if (groups[0][1] === 4) {
    category = 7;
    tiebreak = [groups[0][0], groups[1][0]];
  } else if (groups[0][1] === 3 && groups[1][1] === 2) {
    category = 6;
    tiebreak = [groups[0][0], groups[1][0]];
  } else if (flush) {
    category = 5;
    tiebreak = vals;
  } else if (straightHigh) {
    category = 4;
    tiebreak = [straightHigh];
  } else if (groups[0][1] === 3) {
    category = 3;
    tiebreak = [groups[0][0], ...groups.slice(1).map((g) => g[0])];
  } else if (groups[0][1] === 2 && groups[1][1] === 2) {
    category = 2;
    tiebreak = [groups[0][0], groups[1][0], groups[2][0]];
  } else if (groups[0][1] === 2) {
    category = 1;
    tiebreak = [groups[0][0], ...groups.slice(1).map((g) => g[0])];
  } else {
    category = 0;
    tiebreak = vals;
  }
  return { category, tiebreak, score: scoreOf(category, tiebreak), best: cards.slice(), label: labelFor(category, tiebreak) };
}

export function labelFor(category: number, t: number[]): string {
  switch (category) {
    case 8:
      return t[0] === 14 ? "Quinte flush royale" : `Quinte flush ${rankA(t[0])}`;
    case 7:
      return `Carré ${rankDe(t[0])}`;
    case 6:
      return `Full ${rankAux(t[0])} par les ${rankPlural(t[1])}`;
    case 5:
      return `Couleur ${rankA(t[0])}`;
    case 4:
      return `Quinte ${rankA(t[0])}`;
    case 3:
      return `Brelan ${rankDe(t[0])}`;
    case 2:
      return `Double paire ${rankPlural(t[0])} et ${rankPlural(t[1])}`;
    case 1:
      return `Paire ${rankDe(t[0])}`;
    default:
      return `Carte haute ${rankSingular(t[0])}`;
  }
}

/** Meilleure main de 5 cartes parmi 5 à 7 cartes. */
export function evaluateBest(cards: Card[]): HandValue {
  if (cards.length < 5) throw new Error("Il faut au moins 5 cartes");
  let best: HandValue | null = null;
  const n = cards.length;
  for (let a = 0; a < n; a++)
    for (let b = a + 1; b < n; b++)
      for (let c = b + 1; c < n; c++)
        for (let d = c + 1; d < n; d++)
          for (let e = d + 1; e < n; e++) {
            const v = evaluate5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || v.score > best.score) best = v;
          }
  return best!;
}

/**
 * Description pédagogique de la main actuelle (2 à 7 cartes), avec tirages.
 * Utilisé pour l'aide aux débutants : « Paire de Rois », « Tirage couleur »…
 */
export function describeCurrent(hole: Card[], board: Card[]): { label: string; category: number; draws: string[] } {
  const all = [...hole, ...board];
  let label: string;
  let category: number;
  if (all.length >= 5) {
    const v = evaluateBest(all);
    label = v.label;
    category = v.category;
  } else {
    const vals = all.map(rankValue).sort((a, b) => b - a);
    if (vals.length === 2 && vals[0] === vals[1]) {
      label = `Paire ${rankDe(vals[0])}`;
      category = 1;
    } else {
      label = `Carte haute ${rankSingular(vals[0])}`;
      category = 0;
    }
  }
  const draws: string[] = [];
  if (board.length >= 3 && board.length < 5) {
    if (category < 5) {
      const suitCounts = new Map<string, number>();
      for (const c of all) suitCounts.set(suitOf(c), (suitCounts.get(suitOf(c)) ?? 0) + 1);
      if ([...suitCounts.values()].some((n) => n === 4)) draws.push("Tirage couleur (il manque 1 carte de la même couleur)");
    }
    if (category < 4) {
      const set = new Set(all.map(rankValue));
      if (set.has(14)) set.add(1);
      const outs = new Set<number>();
      for (let low = 1; low <= 10; low++) {
        const window = [0, 1, 2, 3, 4].map((i) => low + i);
        const missing = window.filter((v) => !set.has(v));
        if (missing.length === 1) outs.add(missing[0] === 1 ? 14 : missing[0]);
      }
      if (outs.size >= 2) draws.push("Tirage quinte par les deux bouts (2 hauteurs de cartes la complètent)");
      else if (outs.size === 1) draws.push(`Tirage quinte (il manque un ${rankSingular([...outs][0])})`);
    }
  }
  return { label, category, draws };
}

// ------------------------------------------------------------------ évaluation rapide
// Version sans allocation, pour les simulations des bots. Même échelle de score qu'evaluateBest.
const B15 = [15 ** 4, 15 ** 3, 15 ** 2, 15, 1];
const SUIT_IDX: Record<string, number> = { s: 0, h: 1, d: 2, c: 3 };
const counts = new Int8Array(15);
const suitCount = new Int8Array(4);
const suitMask = new Int32Array(4);

function straightHigh(mask: number): number {
  for (let hi = 14; hi >= 6; hi--) if (((mask >> (hi - 4)) & 31) === 31) return hi;
  if ((mask & 0b100000000111100) === 0b100000000111100) return 5; // A-2-3-4-5
  return 0;
}
function topBits(mask: number, n: number, out: number[]): void {
  for (let r = 14; r >= 2 && out.length < n; r--) if (mask & (1 << r)) out.push(r);
}

/** Codage compact d'une carte : rang (2..14) × 4 + couleur. */
export const encodeCard = (c: Card) => rankValue(c) * 4 + SUIT_IDX[c[1]];

export function fastScore(cards: number[], n = cards.length): number {
  counts.fill(0);
  suitCount.fill(0);
  suitMask.fill(0);
  let mask = 0;
  for (let i = 0; i < n; i++) {
    const r = cards[i] >> 2;
    const s = cards[i] & 3;
    counts[r]++;
    suitCount[s]++;
    suitMask[s] |= 1 << r;
    mask |= 1 << r;
  }
  const sc = (cat: number, tb: number[]) => {
    let v = cat * 15 ** 5;
    for (let i = 0; i < tb.length; i++) v += tb[i] * B15[i];
    return v;
  };
  for (let s = 0; s < 4; s++) {
    if (suitCount[s] >= 5) {
      const sf = straightHigh(suitMask[s]);
      if (sf) return sc(8, [sf]);
      // une couleur bat tout sauf full / carré : vérifier ceux-ci d'abord
      let quad = 0, trips = 0, pair = 0;
      for (let r = 14; r >= 2; r--) {
        if (counts[r] === 4) quad = r;
        else if (counts[r] === 3) { if (!trips) trips = r; else if (!pair) pair = r; }
        else if (counts[r] === 2 && !pair) pair = r;
      }
      if (quad) { const k: number[] = []; topBits(mask & ~(1 << quad), 1, k); return sc(7, [quad, k[0]]); }
      if (trips && pair) return sc(6, [trips, pair]);
      const f: number[] = [];
      topBits(suitMask[s], 5, f);
      return sc(5, f);
    }
  }
  let quad = 0, t1 = 0, t2 = 0, p1 = 0, p2 = 0;
  for (let r = 14; r >= 2; r--) {
    const c = counts[r];
    if (c === 4) quad = r;
    else if (c === 3) { if (!t1) t1 = r; else if (!t2) t2 = r; }
    else if (c === 2) { if (!p1) p1 = r; else if (!p2) p2 = r; }
  }
  if (quad) { const k: number[] = []; topBits(mask & ~(1 << quad), 1, k); return sc(7, [quad, k[0]]); }
  if (t1 && (t2 || p1)) return sc(6, [t1, Math.max(t2, p1)]);
  const st = straightHigh(mask);
  if (st) return sc(4, [st]);
  if (t1) { const k: number[] = []; topBits(mask & ~(1 << t1), 2, k); return sc(3, [t1, ...k]); }
  if (p1 && p2) { const k: number[] = []; topBits(mask & ~(1 << p1) & ~(1 << p2), 1, k); return sc(2, [p1, p2, k[0]]); }
  if (p1) { const k: number[] = []; topBits(mask & ~(1 << p1), 3, k); return sc(1, [p1, ...k]); }
  const k: number[] = [];
  topBits(mask, 5, k);
  return sc(0, k);
}
