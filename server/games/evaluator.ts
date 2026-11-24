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
