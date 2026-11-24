/**
 * Blackjack — 6 jeux, le croupier reste sur 17 souple (S17), blackjack payé 3:2,
 * double sur 2 cartes (aussi après séparation), séparation jusqu'à 4 mains,
 * As séparés : une seule carte chacun. Le croupier vérifie le blackjack (As ou 10 visible).
 */
import { Card, newDeck, shuffle } from "./cards.js";

export type BJAction = "hit" | "stand" | "double" | "split";
export class BJError extends Error {}

export interface BJHand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  done: boolean;
  splitAces: boolean;
  fromSplit: boolean;
  result?: "blackjack" | "win" | "push" | "lose" | "bust";
  payout?: number;
}

export interface BJFeedback {
  hand: number;
  action: BJAction;
  recommended: BJAction;
  correct: boolean;
  explanation: string;
}

export interface BJGame {
  shoe: Card[];
  dealer: Card[];
  hands: BJHand[];
  active: number;
  stage: "player" | "done";
  practice: boolean;
  feedback: BJFeedback[];
  totalBet: number;
  totalPayout: number;
  message?: string;
}

const cardPoints = (c: Card) => (c[0] === "A" ? 11 : "TJQK".includes(c[0]) ? 10 : Number(c[0]));

export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    total += cardPoints(c);
    if (c[0] === "A") aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export const isBlackjack = (h: Card[]) => h.length === 2 && handValue(h).total === 21;

export function newGame(bet: number, practice: boolean): BJGame {
  const shoe = shuffle(newDeck(6));
  const g: BJGame = {
    shoe,
    dealer: [],
    hands: [{ cards: [], bet, doubled: false, done: false, splitAces: false, fromSplit: false }],
    active: 0,
    stage: "player",
    practice,
    feedback: [],
    totalBet: bet,
    totalPayout: 0,
  };
  const p = g.hands[0];
  p.cards.push(draw(g));
  g.dealer.push(draw(g));
  p.cards.push(draw(g));
  g.dealer.push(draw(g));

  const up = g.dealer[0];
  const dealerBJ = isBlackjack(g.dealer);
  const playerBJ = isBlackjack(p.cards);
  if (playerBJ || (dealerBJ && (up[0] === "A" || cardPoints(up) === 10))) {
    p.done = true;
    settle(g);
  }
  return g;
}

function draw(g: BJGame): Card {
  if (g.shoe.length < 15) g.shoe = shuffle(newDeck(6));
  return g.shoe.pop()!;
}

export function legal(g: BJGame) {
  if (g.stage !== "player") return { hit: false, stand: false, double: false, split: false };
  const h = g.hands[g.active];
  const two = h.cards.length === 2;
  return {
    hit: !h.splitAces,
    stand: true,
    double: two && !h.splitAces,
    split: two && cardPoints(h.cards[0]) === cardPoints(h.cards[1]) && g.hands.length < 4 && !h.splitAces,
  };
}

/** Coût supplémentaire (débit portefeuille) d'une action. */
export function actionCost(g: BJGame, action: BJAction): number {
  const h = g.hands[g.active];
  return action === "double" || action === "split" ? h.bet : 0;
}

export function play(g: BJGame, action: BJAction): void {
  if (g.stage !== "player") throw new BJError("La manche est terminée");
  const l = legal(g);
  if (!l[action]) throw new BJError("Action impossible pour cette main");
  const h = g.hands[g.active];
  const dealerUp = g.dealer[0];
  const rec = recommend(h.cards, dealerUp, l.double, l.split);
  g.feedback.push({
    hand: g.active,
    action,
    recommended: rec.action,
    correct: rec.action === action,
    explanation: rec.explanation,
  });

  switch (action) {
    case "hit":
      h.cards.push(draw(g));
      if (handValue(h.cards).total >= 21) h.done = true;
      break;
    case "stand":
      h.done = true;
      break;
    case "double":
      g.totalBet += h.bet;
      h.bet *= 2;
      h.doubled = true;
      h.cards.push(draw(g));
      h.done = true;
      break;
    case "split": {
      const aces = h.cards[0][0] === "A";
      const second: BJHand = { cards: [h.cards.pop()!], bet: h.bet, doubled: false, done: false, splitAces: aces, fromSplit: true };
      g.totalBet += h.bet;
      h.splitAces = aces;
      h.fromSplit = true;
      h.cards.push(draw(g));
      second.cards.push(draw(g));
      g.hands.splice(g.active + 1, 0, second);
      if (aces) {
        h.done = true;
        second.done = true;
      } else if (handValue(h.cards).total === 21) h.done = true;
      break;
    }
  }
  // passer à la main suivante non terminée
  while (g.active < g.hands.length && g.hands[g.active].done) g.active++;
  if (g.active < g.hands.length && g.hands[g.active].fromSplit && g.hands[g.active].cards.length === 2 && handValue(g.hands[g.active].cards).total === 21) {
    g.hands[g.active].done = true;
    while (g.active < g.hands.length && g.hands[g.active].done) g.active++;
  }
  if (g.active >= g.hands.length) {
    g.active = g.hands.length - 1;
    dealerPlay(g);
    settle(g);
  }
}

function dealerPlay(g: BJGame) {
  const allBust = g.hands.every((h) => handValue(h.cards).total > 21);
  if (allBust) return;
  // S17 : le croupier tire jusqu'à 17, et reste sur 17 souple
  while (handValue(g.dealer).total < 17) g.dealer.push(draw(g));
}

function settle(g: BJGame) {
  const d = handValue(g.dealer).total;
  const dealerBJ = isBlackjack(g.dealer);
  let payout = 0;
  for (const h of g.hands) {
    const v = handValue(h.cards).total;
    const pBJ = isBlackjack(h.cards) && !h.fromSplit;
    if (v > 21) {
      h.result = "bust";
      h.payout = 0;
    } else if (pBJ && !dealerBJ) {
      h.result = "blackjack";
      h.payout = h.bet + Math.floor((h.bet * 3) / 2);
    } else if (dealerBJ && !pBJ) {
      h.result = "lose";
      h.payout = 0;
    } else if (pBJ && dealerBJ) {
      h.result = "push";
      h.payout = h.bet;
    } else if (d > 21 || v > d) {
      h.result = "win";
      h.payout = h.bet * 2;
    } else if (v === d) {
      h.result = "push";
      h.payout = h.bet;
    } else {
      h.result = "lose";
      h.payout = 0;
    }
    payout += h.payout;
  }
  g.totalPayout = payout;
  g.stage = "done";
  const labels = { blackjack: "Blackjack !", win: "Gagné", push: "Égalité", lose: "Perdu", bust: "Dépassé (plus de 21)" };
  g.message = g.hands.map((h) => labels[h.result!]).join(" · ");
}

// ------------------------------------------------- stratégie de base

const upVal = (c: Card) => (c[0] === "A" ? 11 : cardPoints(c));
const upName = (v: number) => (v === 11 ? "un As" : `un ${v}`);

export function recommend(cards: Card[], dealerUp: Card, canDouble: boolean, canSplit: boolean): { action: BJAction; explanation: string } {
  const up = upVal(dealerUp);
  const { total, soft } = handValue(cards);
  const D = (why: string) =>
    canDouble ? { action: "double" as BJAction, explanation: why } : { action: "hit" as BJAction, explanation: why + " (doubler impossible ici : on tire)" };
  const Ds = (why: string) =>
    canDouble ? { action: "double" as BJAction, explanation: why } : { action: "stand" as BJAction, explanation: why + " (doubler impossible ici : on reste)" };
  const H = (why: string) => ({ action: "hit" as BJAction, explanation: why });
  const S = (why: string) => ({ action: "stand" as BJAction, explanation: why });
  const P = (why: string) => ({ action: "split" as BJAction, explanation: why });

  if (canSplit && cards.length === 2) {
    const r = cardPoints(cards[0]);
    if (cards[0][0] === "A") return P("Toujours séparer les As : chaque As a de bonnes chances de faire 21.");
    if (r === 8) return P("Toujours séparer les 8 : 16 est la pire main, deux mains partant de 8 valent mieux.");
    if (r === 9 && ![7, 10, 11].includes(up)) return P(`Séparer les 9 contre ${upName(up)} : 18 est battable, deux 9 sont plus forts.`);
    if ((r === 7 || r === 2 || r === 3) && up <= 7) return P(`Séparer contre ${upName(up)} : le croupier est en position faible.`);
    if (r === 6 && up <= 6) return P(`Séparer les 6 contre ${upName(up)} : le croupier risque de dépasser 21.`);
    if (r === 4 && (up === 5 || up === 6)) return P(`Séparer les 4 contre ${upName(up)}, la carte la plus faible du croupier.`);
  }
  if (soft && cards.length >= 2) {
    if (total >= 19) {
      if (total === 19 && up === 6 && cards.length === 2) return Ds("19 souple contre un 6 : doubler, le croupier est très faible.");
      return S(`${total} souple est une main forte : on reste.`);
    }
    if (total === 18) {
      if (up >= 2 && up <= 6 && cards.length === 2) return Ds("18 souple contre une carte faible : doubler pour profiter de la faiblesse du croupier.");
      if (up <= 8) return S(`18 souple contre ${upName(up)} : rester.`);
      return H(`18 souple contre ${upName(up)} : tirer, car le croupier fera souvent 19 ou plus, et l'As vous protège.`);
    }
    if (total === 17 && up >= 3 && up <= 6) return D("17 souple contre une carte faible : doubler.");
    if ((total === 15 || total === 16) && up >= 4 && up <= 6) return D(`${total} souple contre ${upName(up)} : doubler.`);
    if ((total === 13 || total === 14) && up >= 5 && up <= 6) return D(`${total} souple contre ${upName(up)} : doubler.`);
    return H(`${total} souple : tirer sans risque, l'As peut compter pour 1.`);
  }
  if (total >= 17) return S(`${total} : rester, le risque de dépasser 21 est trop élevé.`);
  if (total >= 13) return up <= 6 ? S(`${total} contre ${upName(up)} : rester et laisser le croupier risquer de dépasser 21.`) : H(`${total} contre ${upName(up)} : tirer, le croupier finira probablement à 17 ou plus.`);
  if (total === 12) return up >= 4 && up <= 6 ? S(`12 contre ${upName(up)} : rester, le croupier est faible.`) : H(`12 contre ${upName(up)} : tirer.`);
  if (total === 11) return up === 11 ? H("11 contre un As : tirer (sans doubler).") : D("11 : doubler, la prochaine carte a de fortes chances de valoir 10.");
  if (total === 10) return up <= 9 ? D(`10 contre ${upName(up)} : doubler.`) : H(`10 contre ${upName(up)} : tirer sans doubler.`);
  if (total === 9) return up >= 3 && up <= 6 ? D(`9 contre ${upName(up)} : doubler.`) : H(`9 contre ${upName(up)} : tirer.`);
  return H(`${total} : aucune chance de dépasser 21, on tire.`);
}

/** Vue publique : la carte cachée du croupier n'est révélée qu'à la fin. */
export function bjView(g: BJGame) {
  const done = g.stage === "done";
  const h = g.stage === "player" ? g.hands[g.active] : null;
  return {
    stage: g.stage,
    practice: g.practice,
    dealer: done ? g.dealer : [g.dealer[0], null],
    dealerValue: done ? handValue(g.dealer).total : handValue([g.dealer[0]]).total,
    hands: g.hands.map((x) => ({ ...x, value: handValue(x.cards) })),
    active: g.active,
    legal: legal(g),
    hint: g.practice && h ? recommend(h.cards, g.dealer[0], legal(g).double, legal(g).split) : null,
    feedback: g.feedback,
    totalBet: g.totalBet,
    totalPayout: g.totalPayout,
    message: g.message ?? null,
    nextCost: h ? h.bet : 0,
  };
}
