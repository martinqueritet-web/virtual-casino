/**
 * Baccara (punto banco), Vidéo poker (Jacks or Better 9/6), Keno et Roue de la fortune.
 * Règles officielles de casino, tirages par le serveur, taux de retour publics.
 */
import { newDeck, shuffle, rankValue, type Card } from "./cards.js";
import { evaluate5 } from "./evaluator.js";
import { randomInt } from "./cards.js";

export class TableGameError extends Error {}

// ============================================================== BACCARA
export type BaccaratBet = "joueur" | "banque" | "egalite" | "paire_joueur" | "paire_banque";
export const BACCARAT_PAYS: Record<BaccaratBet, number> = { joueur: 1, banque: 0.95, egalite: 8, paire_joueur: 11, paire_banque: 11 };

export const baccaratValue = (c: Card) => {
  const v = rankValue(c);
  return v === 14 ? 1 : v >= 10 ? 0 : v;
};
export const baccaratTotal = (cards: Card[]) => cards.reduce((a, c) => a + baccaratValue(c), 0) % 10;

/** Le banquier tire-t-il une 3e carte, selon la troisième carte du joueur ? (tableau officiel) */
export function bankerDraws(bankerTotal: number, playerThird: Card | null): boolean {
  if (playerThird === null) return bankerTotal <= 5;
  const p = baccaratValue(playerThird);
  switch (bankerTotal) {
    case 0:
    case 1:
    case 2:
      return true;
    case 3:
      return p !== 8;
    case 4:
      return p >= 2 && p <= 7;
    case 5:
      return p >= 4 && p <= 7;
    case 6:
      return p === 6 || p === 7;
    default:
      return false;
  }
}

/** Joue un coup complet à partir d'un sabot (8 jeux). L'ordre réel de distribution est conservé pour l'animation. */
export function baccaratCoup(shoe: Card[] = shuffle(newDeck(8))) {
  const player: Card[] = [];
  const banker: Card[] = [];
  const order: { to: "joueur" | "banque"; card: Card }[] = [];
  const give = (to: "joueur" | "banque") => {
    const c = shoe.pop()!;
    (to === "joueur" ? player : banker).push(c);
    order.push({ to, card: c });
  };
  give("joueur");
  give("banque");
  give("joueur");
  give("banque");
  const natural = baccaratTotal(player) >= 8 || baccaratTotal(banker) >= 8;
  let playerThird: Card | null = null;
  if (!natural) {
    if (baccaratTotal(player) <= 5) {
      give("joueur");
      playerThird = player[2];
    }
    if (bankerDraws(baccaratTotal(banker), playerThird)) give("banque");
  }
  const pt = baccaratTotal(player);
  const bt = baccaratTotal(banker);
  const winner: "joueur" | "banque" | "egalite" = pt > bt ? "joueur" : bt > pt ? "banque" : "egalite";
  return {
    player,
    banker,
    order,
    playerTotal: pt,
    bankerTotal: bt,
    natural,
    winner,
    playerPair: player[0][0] === player[1][0],
    bankerPair: banker[0][0] === banker[1][0],
  };
}

export function baccaratSettle(bets: { type: BaccaratBet; amount: number }[], coup: ReturnType<typeof baccaratCoup>) {
  return bets.map((b) => {
    let payout = 0;
    let outcome: "gagné" | "perdu" | "rendu" = "perdu";
    if (b.type === "egalite" && coup.winner === "egalite") outcome = "gagné";
    else if (b.type === "paire_joueur" && coup.playerPair) outcome = "gagné";
    else if (b.type === "paire_banque" && coup.bankerPair) outcome = "gagné";
    else if ((b.type === "joueur" || b.type === "banque") && coup.winner === "egalite") outcome = "rendu"; // égalité : mise rendue
    else if (b.type === coup.winner) outcome = "gagné";
    if (outcome === "gagné") payout = b.amount + Math.floor(b.amount * BACCARAT_PAYS[b.type]);
    if (outcome === "rendu") payout = b.amount;
    return { ...b, outcome, payout };
  });
}

// ============================================================== VIDÉO POKER
export const VP_PAYTABLE = [
  { id: "royal", name: "Quinte flush royale", pays: 800 },
  { id: "straightflush", name: "Quinte flush", pays: 50 },
  { id: "quads", name: "Carré", pays: 25 },
  { id: "fullhouse", name: "Full", pays: 9 },
  { id: "flush", name: "Couleur", pays: 6 },
  { id: "straight", name: "Quinte", pays: 4 },
  { id: "trips", name: "Brelan", pays: 3 },
  { id: "twopair", name: "Double paire", pays: 2 },
  { id: "jacks", name: "Paire de Valets ou mieux", pays: 1 },
] as const;

/** Combinaison payante d'une main de 5 cartes (ou null). */
export function vpHand(cards: Card[]): (typeof VP_PAYTABLE)[number] | null {
  const v = evaluate5(cards);
  const find = (id: string) => VP_PAYTABLE.find((p) => p.id === id)!;
  switch (v.category) {
    case 8:
      return v.tiebreak[0] === 14 ? find("royal") : find("straightflush");
    case 7:
      return find("quads");
    case 6:
      return find("fullhouse");
    case 5:
      return find("flush");
    case 4:
      return find("straight");
    case 3:
      return find("trips");
    case 2:
      return find("twopair");
    case 1:
      return v.tiebreak[0] >= 11 ? find("jacks") : null;
    default:
      return null;
  }
}

export interface VPGame {
  bet: number;
  deck: Card[];
  hand: Card[];
  stage: "hold" | "done";
  held?: boolean[];
  result?: string | null;
  payout: number;
}

export function vpDeal(bet: number): VPGame {
  const deck = shuffle(newDeck());
  const hand = [deck.pop()!, deck.pop()!, deck.pop()!, deck.pop()!, deck.pop()!];
  return { bet, deck, hand, stage: "hold", payout: 0 };
}

export function vpDraw(g: VPGame, held: boolean[]) {
  if (g.stage !== "hold") throw new TableGameError("La main est terminée");
  if (!Array.isArray(held) || held.length !== 5) throw new TableGameError("Indiquez les cartes à garder");
  g.held = held.map(Boolean);
  g.hand = g.hand.map((c, i) => (g.held![i] ? c : g.deck.pop()!));
  const h = vpHand(g.hand);
  g.result = h?.name ?? null;
  g.payout = h ? g.bet * h.pays : 0;
  g.stage = "done";
}

/**
 * Conseil simplifié de stratégie (Jacks or Better) : quelles cartes garder.
 * Reprend les décisions les plus importantes de la stratégie optimale.
 */
export function vpAdvice(hand: Card[]): { hold: boolean[]; reason: string } {
  const ranks = hand.map(rankValue);
  const suits = hand.map((c) => c[1]);
  const keep = (pred: (i: number) => boolean, reason: string) => ({ hold: hand.map((_, i) => pred(i)), reason });
  const made = vpHand(hand);
  const count = (r: number) => ranks.filter((x) => x === r).length;
  if (made && ["royal", "straightflush", "fullhouse", "flush", "straight"].includes(made.id)) return keep(() => true, `${made.name} servie : gardez tout.`);
  if (made?.id === "quads") return keep((i) => count(ranks[i]) === 4, "Carré servi : gardez les 4 cartes.");
  // 4 cartes vers une quinte flush royale
  for (const s of new Set(suits)) {
    const royal = hand.map((c, i) => c[1] === s && ranks[i] >= 10);
    if (royal.filter(Boolean).length === 4) return { hold: royal, reason: "4 cartes vers une quinte flush royale : tentez le gros lot." };
  }
  if (made?.id === "trips") return keep((i) => count(ranks[i]) === 3, "Brelan : gardez les 3 cartes, un carré ou un full peuvent venir.");
  if (made?.id === "twopair") return keep((i) => count(ranks[i]) === 2, "Double paire : gardez les 4 cartes, un full peut venir.");
  if (made?.id === "jacks") return keep((i) => count(ranks[i]) === 2 && ranks[i] >= 11, "Paire de Valets ou mieux : elle paie déjà, gardez-la.");
  for (const s of new Set(suits)) {
    const same = suits.map((x) => x === s);
    if (same.filter(Boolean).length === 4) return { hold: same, reason: "4 cartes de la même couleur : gardez-les pour la couleur." };
  }
  const pair = ranks.find((r) => count(r) === 2);
  if (pair) return keep((i) => ranks[i] === pair, "Petite paire : gardez-la, elle peut devenir un brelan ou mieux.");
  // 4 cartes consécutives (quinte par les deux bouts)
  const uniq = [...new Set(ranks)].sort((a, b) => a - b);
  for (let i = 0; i + 3 < uniq.length; i++) {
    if (uniq[i + 3] - uniq[i] === 3 && uniq[i] >= 2 && uniq[i + 3] <= 13)
      return keep((k) => ranks[k] >= uniq[i] && ranks[k] <= uniq[i + 3] && ranks.indexOf(ranks[k]) === k, "4 cartes qui se suivent : gardez-les pour la quinte.");
  }
  const high = hand.map((_, i) => ranks[i] >= 11);
  if (high.some(Boolean)) {
    // au plus 2 figures, les plus basses (meilleures chances de paire payante)
    const idx = hand.map((_, i) => i).filter((i) => high[i]).sort((a, b) => ranks[a] - ranks[b]).slice(0, 2);
    return keep((i) => idx.includes(i), "Gardez vos figures (Valet ou plus) : une paire de figures paie.");
  }
  return keep(() => false, "Rien d'intéressant : changez les 5 cartes.");
}

export function vpView(g: VPGame) {
  const current = vpHand(g.hand);
  return {
    bet: g.bet,
    hand: g.hand,
    stage: g.stage,
    held: g.held ?? null,
    result: g.result ?? null,
    payout: g.payout,
    current: g.stage === "hold" ? (current?.name ?? null) : null,
    advice: g.stage === "hold" ? vpAdvice(g.hand) : null,
  };
}

// ============================================================== KENO
export const KENO_NUMBERS = 40;
export const KENO_DRAWN = 10;
/** Gains (× la mise) selon le nombre de numéros choisis, puis le nombre de numéros trouvés. */
export const KENO_PAYS: Record<number, Record<number, number>> = {
  1: { 1: 3.8 },
  2: { 1: 1, 2: 9.5 },
  3: { 2: 3.6, 3: 38 },
  4: { 2: 2, 3: 6.8, 4: 110 },
  5: { 2: 1.3, 3: 4, 4: 16, 5: 270 },
  6: { 3: 3.8, 4: 11, 5: 76, 6: 950 },
  7: { 3: 2.8, 4: 5.5, 5: 22, 6: 180, 7: 1800 },
  8: { 3: 1.7, 4: 4.5, 5: 11, 6: 54, 7: 540, 8: 3600 },
  9: { 4: 4.9, 5: 9.9, 6: 37, 7: 200, 8: 2000, 9: 12300 },
  10: { 4: 3.4, 5: 6.7, 6: 18, 7: 67, 8: 450, 9: 4500, 10: 22400 },
};
const comb = (n: number, k: number) => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};
export const kenoProbability = (picks: number, hits: number) =>
  (comb(KENO_DRAWN, hits) * comb(KENO_NUMBERS - KENO_DRAWN, picks - hits)) / comb(KENO_NUMBERS, picks);
export const kenoRTP = (picks: number) => Object.entries(KENO_PAYS[picks]).reduce((a, [h, m]) => a + kenoProbability(picks, Number(h)) * m, 0);

export function kenoValidate(picks: unknown): number[] {
  if (!Array.isArray(picks)) throw new TableGameError("Choisissez vos numéros");
  const p = [...new Set(picks.map((x) => Math.floor(Number(x))))];
  if (p.length < 1 || p.length > 10) throw new TableGameError("Choisissez entre 1 et 10 numéros");
  if (p.some((x) => !(x >= 1 && x <= KENO_NUMBERS))) throw new TableGameError(`Numéros de 1 à ${KENO_NUMBERS}`);
  return p.sort((a, b) => a - b);
}

export function kenoDraw(picks: number[], bet: number) {
  const pool = shuffle(Array.from({ length: KENO_NUMBERS }, (_, i) => i + 1));
  const drawn = pool.slice(0, KENO_DRAWN);
  const hits = picks.filter((n) => drawn.includes(n));
  const multiplier = KENO_PAYS[picks.length][hits.length] ?? 0;
  return { drawn, hits, multiplier, payout: Math.floor(bet * multiplier) };
}

// ============================================================== ROUE DE LA FORTUNE (Big Six)
export type WheelSymbol = "1" | "2" | "5" | "10" | "20" | "joker" | "casino";
export const WHEEL_PAYS: Record<WheelSymbol, number> = { "1": 1, "2": 2, "5": 5, "10": 10, "20": 20, joker: 40, casino: 40 };
const WHEEL_COUNTS: Record<WheelSymbol, number> = { "1": 24, "2": 15, "5": 7, "10": 4, "20": 2, joker: 1, casino: 1 };
/** 54 cases, réparties comme sur une vraie roue (les grosses cotes sont espacées). */
export const WHEEL_SEGMENTS: WheelSymbol[] = (() => {
  const seq: WheelSymbol[] = [];
  const left = { ...WHEEL_COUNTS };
  const order: WheelSymbol[] = ["1", "2", "1", "5", "1", "2", "1", "10", "1", "2", "1", "5", "1", "2", "1", "20", "1", "2", "1", "5", "1", "2", "1", "10", "1", "2", "1", "joker", "1", "2", "1", "5", "1", "2", "1", "10", "1", "2", "1", "5", "1", "2", "1", "20", "1", "2", "1", "5", "1", "2", "1", "10", "5", "casino"];
  for (const s of order) {
    if (left[s] > 0) {
      seq.push(s);
      left[s]--;
    }
  }
  // complète si besoin (sécurité)
  for (const s of Object.keys(left) as WheelSymbol[]) while (left[s]-- > 0) seq.push(s);
  return seq;
})();
export const wheelRTP = (s: WheelSymbol) => (WHEEL_COUNTS[s] * (WHEEL_PAYS[s] + 1)) / WHEEL_SEGMENTS.length;

export function wheelValidate(bets: unknown) {
  if (!Array.isArray(bets) || bets.length === 0 || bets.length > 7) throw new TableGameError("Misez sur 1 à 7 cases");
  const seen = new Set<string>();
  return bets.map((b: any) => {
    const symbol = String(b?.symbol) as WheelSymbol;
    if (!(symbol in WHEEL_PAYS) || seen.has(symbol)) throw new TableGameError("Case de mise invalide");
    seen.add(symbol);
    return { symbol, amount: Math.floor(Number(b.amount)) };
  });
}

export function wheelSpin(bets: { symbol: WheelSymbol; amount: number }[]) {
  const index = randomInt(WHEEL_SEGMENTS.length);
  const symbol = WHEEL_SEGMENTS[index];
  const results = bets.map((b) => ({ ...b, won: b.symbol === symbol, payout: b.symbol === symbol ? b.amount * (WHEEL_PAYS[symbol] + 1) : 0 }));
  return { index, symbol, results, payout: results.reduce((a, r) => a + r.payout, 0), total: bets.reduce((a, b) => a + b.amount, 0) };
}
