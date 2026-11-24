/**
 * IA des bots de poker.
 * Chaque bot estime ses chances de gagner (équité) par simulation Monte-Carlo
 * contre le nombre d'adversaires encore en main, puis compare à la cote du pot.
 * Sa personnalité (serré/large, agressif/passif, bluffeur) et le niveau choisi
 * modulent la décision. Le bot ne voit que SES cartes et le tableau.
 */
import { newDeck, randomInt, type Card } from "./cards.js";
import { fastScore, encodeCard } from "./evaluator.js";
import * as P from "./poker.js";

export type BotLevel = "facile" | "normal" | "difficile";

export interface BotProfile {
  name: string;
  avatar: string;
  color: string;
  tight: number; // 0 = joue beaucoup de mains, 1 = très sélectif
  aggr: number; // 0 = passif, 1 = relance souvent
  bluff: number; // probabilité de bluff
}

export const BOTS: BotProfile[] = [
  { name: "Lucky Lou", avatar: "🍀", color: "#16794a", tight: 0.2, aggr: 0.4, bluff: 0.12 },
  { name: "La Comtesse", avatar: "👑", color: "#9b59d0", tight: 0.75, aggr: 0.55, bluff: 0.05 },
  { name: "Max le Requin", avatar: "🦈", color: "#4f7bd9", tight: 0.55, aggr: 0.85, bluff: 0.18 },
  { name: "Papy Roger", avatar: "🧓", color: "#b8964a", tight: 0.85, aggr: 0.2, bluff: 0.02 },
  { name: "Neon Kid", avatar: "🤖", color: "#29c5d6", tight: 0.35, aggr: 0.65, bluff: 0.15 },
  { name: "Señora Rosa", avatar: "🌹", color: "#c0334a", tight: 0.5, aggr: 0.5, bluff: 0.08 },
];

const rand = () => randomInt(1_000_000) / 1_000_000;

/** Équité estimée : part moyenne du pot gagnée contre `opponents` mains aléatoires. */
export function estimateEquity(hole: Card[], board: Card[], opponents: number, sims: number): number {
  const known = new Set([...hole, ...board]);
  const rest = newDeck().filter((c) => !known.has(c)).map(encodeCard);
  const h = hole.map(encodeCard);
  const b = board.map(encodeCard);
  const need = 5 - b.length;
  const mineBuf = new Array<number>(7);
  const oppBuf = new Array<number>(7);
  const deck = rest.slice();
  let score = 0;
  for (let s = 0; s < sims; s++) {
    // mélange partiel (Fisher-Yates) des cartes nécessaires
    const take = need + opponents * 2;
    for (let i = 0; i < take; i++) {
      const j = i + randomInt(deck.length - i);
      const tmp = deck[i];
      deck[i] = deck[j];
      deck[j] = tmp;
    }
    for (let i = 0; i < b.length; i++) mineBuf[2 + i] = oppBuf[2 + i] = b[i];
    for (let i = 0; i < need; i++) mineBuf[2 + b.length + i] = oppBuf[2 + b.length + i] = deck[i];
    mineBuf[0] = h[0];
    mineBuf[1] = h[1];
    const mine = fastScore(mineBuf, 7);
    let best = true;
    let ties = 1;
    for (let o = 0; o < opponents; o++) {
      oppBuf[0] = deck[need + o * 2];
      oppBuf[1] = deck[need + o * 2 + 1];
      const v = fastScore(oppBuf, 7);
      if (v > mine) {
        best = false;
        break;
      }
      if (v === mine) ties++;
    }
    if (best) score += 1 / ties;
  }
  return score / sims;
}

export interface BotDecision {
  type: P.ActionType;
  amount?: number;
}

export function decide(t: P.PokerTable, seat: number, profile: BotProfile, level: BotLevel): BotDecision {
  const h = t.hand!;
  const legal = P.legalActions(t, seat)!;
  const me = h.players[seat];
  const opponents = Object.values(h.players).filter((p) => p.seat !== seat && !p.folded).length;
  const sims = level === "facile" ? 60 : level === "normal" ? 160 : 320;
  let equity = estimateEquity(me.hole, h.board, Math.max(1, opponents), sims);
  // niveau facile : jugement bruité
  if (level === "facile") equity = Math.min(1, Math.max(0, equity + (rand() - 0.5) * 0.3));

  const pot = Object.values(h.players).reduce((a, p) => a + p.total, 0);
  const toCall = legal.toCall;
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;
  // seuil « main jouable » : équité attendue face à N adversaires, ajustée par le style
  const fair = 1 / (opponents + 1);
  const strong = fair + 0.22 - profile.aggr * 0.08;
  const veryStrong = Math.min(0.92, fair + 0.4);

  const raiseTo = (fraction: number): BotDecision => {
    if (!legal.raise) return toCall > 0 ? { type: "call" } : { type: "check" };
    const target = h.currentBet + Math.max(h.minRaise, Math.round(pot * fraction));
    const amount = Math.max(legal.raise.min, Math.min(legal.raise.max, target));
    if (amount >= legal.raise.max) return { type: "allin" };
    return { type: "raise", amount };
  };

  // très forte main : on construit le pot
  if (equity >= veryStrong) {
    if (rand() < 0.15 + (1 - profile.aggr) * 0.3 && toCall === 0 && h.stage !== "river") return { type: "check" }; // piège
    return raiseTo(0.6 + profile.aggr * 0.5);
  }
  if (toCall === 0) {
    if (equity >= strong && rand() < 0.4 + profile.aggr * 0.5) return raiseTo(0.5 + rand() * 0.25);
    if (rand() < profile.bluff * (opponents <= 2 ? 1.5 : 0.6)) return raiseTo(0.5);
    return { type: "check" };
  }
  // face à une mise
  const margin = profile.tight * 0.1 - (level === "difficile" ? 0.02 : 0);
  if (equity >= strong && rand() < profile.aggr * 0.45) return raiseTo(0.75);
  if (equity >= potOdds + margin) return { type: "call" };
  if (toCall <= t.bb && h.stage === "preflop" && equity >= fair * 0.8) return { type: "call" };
  if (rand() < profile.bluff * 0.4 && legal.raise && opponents === 1) return raiseTo(0.8);
  return { type: "fold" };
}

export const isBot = (userId: string) => userId.startsWith("bot:");
