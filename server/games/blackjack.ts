/**
 * Blackjack — règles d'un casino classique :
 * sabot de 6 jeux conservé d'une manche à l'autre, remélangé à la carte de coupe (≈ 75 %),
 * le croupier reste sur 17 souple (S17), blackjack payé 3 pour 2, assurance payée 2 pour 1
 * quand le croupier montre un As, abandon tardif (récupère la moitié de la mise),
 * double sur 2 cartes (aussi après séparation), séparation jusqu'à 4 mains,
 * As séparés : une seule carte chacun. Le croupier vérifie s'il a blackjack (As ou 10 visible).
 */
import { Card, newDeck, shuffle } from "./cards.js";

export type BJAction = "hit" | "stand" | "double" | "split" | "surrender";
export class BJError extends Error {}

export const DECKS = 6;
export const SHOE_SIZE = DECKS * 52;
/** Carte de coupe : on remélange quand il reste moins de 25 % du sabot. */
export const CUT_CARD = Math.round(SHOE_SIZE * 0.25);

export interface BJHand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  done: boolean;
  splitAces: boolean;
  fromSplit: boolean;
  surrendered?: boolean;
  result?: "blackjack" | "win" | "push" | "lose" | "bust" | "surrender";
  payout?: number;
}

export interface BJFeedback {
  hand: number;
  action: BJAction | "insurance" | "no-insurance";
  recommended: BJAction | "insurance" | "no-insurance";
  correct: boolean;
  explanation: string;
}

export interface BJGame {
  shoe: Card[];
  discards: number;
  reshuffled: boolean;
  dealer: Card[];
  hands: BJHand[];
  active: number;
  stage: "insurance" | "player" | "done";
  practice: boolean;
  feedback: BJFeedback[];
  insurance: number; // mise d'assurance (0 = refusée)
  insuranceDecided: boolean;
  insurancePayout: number;
  totalBet: number;
  totalPayout: number;
  message?: string;
  dealerBlackjack?: boolean;
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

/** Sabot pour la manche suivante : on garde l'ancien tant que la carte de coupe n'est pas sortie. */
export function nextShoe(prev?: { shoe: Card[]; discards: number }): { shoe: Card[]; discards: number; reshuffled: boolean } {
  if (prev && prev.shoe.length > CUT_CARD) return { shoe: prev.shoe, discards: prev.discards, reshuffled: false };
  return { shoe: shuffle(newDeck(DECKS)), discards: 0, reshuffled: true };
}

export function newGame(bet: number, practice: boolean, prev?: { shoe: Card[]; discards: number }): BJGame {
  const s = nextShoe(prev);
  const g: BJGame = {
    shoe: s.shoe,
    discards: s.discards,
    reshuffled: s.reshuffled,
    dealer: [],
    hands: [{ cards: [], bet, doubled: false, done: false, splitAces: false, fromSplit: false }],
    active: 0,
    stage: "player",
    practice,
    feedback: [],
    insurance: 0,
    insuranceDecided: false,
    insurancePayout: 0,
    totalBet: bet,
    totalPayout: 0,
  };
  const p = g.hands[0];
  // ordre réel : joueur, croupier (visible), joueur, croupier (cachée)
  p.cards.push(draw(g));
  g.dealer.push(draw(g));
  p.cards.push(draw(g));
  g.dealer.push(draw(g));

  const up = g.dealer[0];
  if (isBlackjack(p.cards)) {
    p.done = true;
    settle(g);
  } else if (up[0] === "A") {
    g.stage = "insurance"; // le croupier propose l'assurance avant de vérifier
  } else if (cardPoints(up) === 10) {
    peek(g);
  }
  return g;
}

function draw(g: BJGame): Card {
  // sécurité : un sabot ne s'épuise jamais en pleine manche (carte de coupe à 25 %)
  if (g.shoe.length === 0) {
    g.shoe = shuffle(newDeck(DECKS));
    g.discards = 0;
  }
  return g.shoe.pop()!;
}

/** Le croupier regarde sa carte cachée : blackjack → la manche s'arrête. */
function peek(g: BJGame) {
  if (isBlackjack(g.dealer)) {
    g.dealerBlackjack = true;
    g.hands[0].done = true;
    settle(g);
  }
}

/** Coût de l'assurance : la moitié de la mise. */
export const insuranceCost = (g: BJGame) => Math.floor(g.hands[0].bet / 2);

export function decideInsurance(g: BJGame, take: boolean) {
  if (g.stage !== "insurance") throw new BJError("L'assurance n'est pas proposée");
  g.feedback.push({
    hand: 0,
    action: take ? "insurance" : "no-insurance",
    recommended: "no-insurance",
    correct: !take,
    explanation:
      "La stratégie de base refuse toujours l'assurance : le croupier n'a blackjack qu'environ une fois sur trois, alors que l'assurance ne paie que 2 pour 1. À long terme, elle coûte plus qu'elle ne rapporte.",
  });
  g.insuranceDecided = true;
  if (take) {
    g.insurance = insuranceCost(g);
    g.totalBet += g.insurance;
  }
  g.stage = "player";
  peek(g);
}

export function legal(g: BJGame) {
  if (g.stage !== "player") return { hit: false, stand: false, double: false, split: false, surrender: false };
  const h = g.hands[g.active];
  const two = h.cards.length === 2;
  return {
    hit: !h.splitAces,
    stand: true,
    double: two && !h.splitAces,
    split: two && cardPoints(h.cards[0]) === cardPoints(h.cards[1]) && g.hands.length < 4 && !h.splitAces,
    surrender: two && g.hands.length === 1 && !h.fromSplit,
  };
}

/** Coût supplémentaire (débit portefeuille) d'une action. */
export function actionCost(g: BJGame, action: BJAction): number {
  const h = g.hands[g.active];
  return action === "double" || action === "split" ? h.bet : 0;
}

export function play(g: BJGame, action: BJAction): void {
  if (g.stage === "insurance") throw new BJError("Répondez d'abord à la proposition d'assurance");
  if (g.stage !== "player") throw new BJError("La manche est terminée");
  const l = legal(g);
  if (!l[action]) throw new BJError("Action impossible pour cette main");
  const h = g.hands[g.active];
  const rec = recommend(h.cards, g.dealer[0], l.double, l.split, l.surrender);
  g.feedback.push({ hand: g.active, action, recommended: rec.action, correct: rec.action === action, explanation: rec.explanation });

  switch (action) {
    case "hit":
      h.cards.push(draw(g));
      if (handValue(h.cards).total >= 21) h.done = true;
      break;
    case "stand":
      h.done = true;
      break;
    case "surrender":
      h.surrendered = true;
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
  const anyLive = g.hands.some((h) => !h.surrendered && handValue(h.cards).total <= 21);
  if (!anyLive) return; // rien à défendre : le croupier ne tire pas
  while (handValue(g.dealer).total < 17) g.dealer.push(draw(g));
}

function settle(g: BJGame) {
  const d = handValue(g.dealer).total;
  const dealerBJ = isBlackjack(g.dealer);
  let payout = 0;
  for (const h of g.hands) {
    const v = handValue(h.cards).total;
    const pBJ = isBlackjack(h.cards) && !h.fromSplit;
    if (h.surrendered) {
      h.result = "surrender";
      h.payout = Math.floor(h.bet / 2);
    } else if (v > 21) {
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
  if (g.insurance > 0) g.insurancePayout = dealerBJ ? g.insurance * 3 : 0;
  payout += g.insurancePayout;
  g.totalPayout = payout;
  g.dealerBlackjack = dealerBJ;
  g.stage = "done";
  g.discards += g.dealer.length + g.hands.reduce((a, h) => a + h.cards.length, 0);
  const labels = { blackjack: "Blackjack !", win: "Gagné", push: "Égalité", lose: "Perdu", bust: "Dépassé (plus de 21)", surrender: "Abandon : moitié de la mise rendue" };
  const parts = g.hands.map((h) => labels[h.result!]);
  if (g.insurance > 0) parts.push(dealerBJ ? "Assurance payée 2 pour 1" : "Assurance perdue");
  g.message = parts.join(" · ");
}

// ------------------------------------------------- stratégie de base (6 jeux, S17, double après séparation, abandon tardif)

const upVal = (c: Card) => (c[0] === "A" ? 11 : cardPoints(c));
const upName = (v: number) => (v === 11 ? "un As" : `un ${v}`);

export function recommend(cards: Card[], dealerUp: Card, canDouble: boolean, canSplit: boolean, canSurrender = false): { action: BJAction; explanation: string } {
  const up = upVal(dealerUp);
  const { total, soft } = handValue(cards);
  const D = (why: string) =>
    canDouble ? { action: "double" as BJAction, explanation: why } : { action: "hit" as BJAction, explanation: why + " (doubler impossible ici : on tire)" };
  const Ds = (why: string) =>
    canDouble ? { action: "double" as BJAction, explanation: why } : { action: "stand" as BJAction, explanation: why + " (doubler impossible ici : on reste)" };
  const H = (why: string) => ({ action: "hit" as BJAction, explanation: why });
  const S = (why: string) => ({ action: "stand" as BJAction, explanation: why });
  const P = (why: string) => ({ action: "split" as BJAction, explanation: why });
  const R = (why: string) => ({ action: "surrender" as BJAction, explanation: why });

  if (canSurrender && !soft && cards.length === 2) {
    const pair8 = cardPoints(cards[0]) === 8 && cardPoints(cards[1]) === 8;
    if (!pair8 && total === 16 && up >= 9) return R(`16 contre ${upName(up)} : abandonner et récupérer la moitié de la mise. Cette main perd environ 3 fois sur 4.`);
    if (total === 15 && up === 10) return R("15 contre un 10 : abandonner et récupérer la moitié de la mise, on perd moins à long terme.");
  }
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
  const l = legal(g);
  return {
    stage: g.stage,
    practice: g.practice,
    dealer: done ? g.dealer : [g.dealer[0], null],
    dealerValue: done ? handValue(g.dealer).total : handValue([g.dealer[0]]).total,
    dealerBlackjack: done ? !!g.dealerBlackjack : null,
    hands: g.hands.map((x) => ({ ...x, value: handValue(x.cards) })),
    active: g.active,
    legal: l,
    hint:
      g.practice && g.stage === "insurance"
        ? { action: "no-insurance", explanation: "Refusez l'assurance : à long terme, elle coûte plus qu'elle ne rapporte." }
        : g.practice && h
          ? recommend(h.cards, g.dealer[0], l.double, l.split, l.surrender)
          : null,
    feedback: g.feedback,
    insurance: g.insurance,
    insuranceCost: g.stage === "insurance" ? insuranceCost(g) : 0,
    insurancePayout: g.insurancePayout,
    totalBet: g.totalBet,
    totalPayout: g.totalPayout,
    message: g.message ?? null,
    nextCost: h ? h.bet : 0,
    shoe: { remaining: g.shoe.length, size: SHOE_SIZE, cut: CUT_CARD, discards: g.discards, reshuffled: g.reshuffled },
  };
}
