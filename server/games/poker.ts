/**
 * Moteur Texas Hold'em No-Limit — logique pure et sérialisable (JSON).
 * Le serveur est seul détenteur du paquet et des cartes privées ;
 * `viewFor` produit la vue filtrée envoyée à chaque joueur.
 */
import { Card, newDeck, shuffle } from "./cards.js";
import { evaluateBest, describeCurrent } from "./evaluator.js";

export type Stage = "preflop" | "flop" | "turn" | "river" | "showdown" | "done";
export type ActionType = "fold" | "check" | "call" | "raise" | "allin";

export interface PokerSeat {
  userId: string;
  username: string;
  avatar: string;
  color: string;
  stack: number;
  sittingOut: boolean;
  leaveAfterHand: boolean;
}

export interface PlayerHand {
  seat: number;
  userId: string;
  hole: Card[];
  bet: number; // mise sur le tour d'enchères en cours
  total: number; // total investi dans la main
  folded: boolean;
  allIn: boolean;
  acted: boolean;
  actedLevel: number | null; // fullRaiseCount au moment de sa dernière action
  startStack: number;
  vpip: boolean;
  lastAction?: string;
}

export interface PotResult {
  amount: number;
  winners: number[];
  label: string;
}

export interface HandResult {
  pots: PotResult[];
  shown: Record<number, { hole: Card[]; label: string; best: Card[] }>;
  net: Record<number, number>;
  showdown: boolean;
  summary: string;
  participants: { userId: string; seat: number; net: number; won: boolean; showdown: boolean; label: string | null; category: number; vpip: boolean; hole: Card[] }[];
  potTotal: number;
}

export interface HandState {
  number: number;
  deck: Card[];
  board: Card[];
  stage: Stage;
  button: number;
  sbSeat: number;
  bbSeat: number;
  players: Record<number, PlayerHand>;
  toAct: number | null;
  currentBet: number;
  minRaise: number;
  fullRaiseCount: number;
  result?: HandResult;
  endedAt?: number;
  startedAt: number;
  statsRecorded?: boolean;
}

export interface HandSummaryLog {
  number: number;
  board: Card[];
  lines: string[];
  result?: { summary: string; potTotal: number };
}

export interface PokerTable {
  seats: (PokerSeat | null)[];
  sb: number;
  bb: number;
  minBuyIn: number;
  maxBuyIn: number;
  button: number;
  handNumber: number;
  hand: HandState | null;
  log: string[]; // journal de la main en cours
  history: HandSummaryLog[]; // dernières mains (rejouables)
}

export class PokerError extends Error {}

const SUIT_SYMBOL: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
export const pretty = (c: Card) => `${c[0] === "T" ? "10" : c[0]}${SUIT_SYMBOL[c[1]]}`;

export function createTable(opts: { maxSeats?: number; sb?: number; bb?: number } = {}): PokerTable {
  const maxSeats = Math.min(10, Math.max(2, opts.maxSeats ?? 9));
  const sb = opts.sb ?? 5;
  const bb = opts.bb ?? 10;
  return {
    seats: Array(maxSeats).fill(null),
    sb,
    bb,
    minBuyIn: bb * 10,
    maxBuyIn: bb * 100,
    button: -1,
    handNumber: 0,
    hand: null,
    log: [],
    history: [],
  };
}

export const handInProgress = (t: PokerTable) => !!t.hand && t.hand.stage !== "done";

export function seatOf(t: PokerTable, userId: string): number {
  return t.seats.findIndex((s) => s?.userId === userId);
}

export function sit(t: PokerTable, seat: number, p: { userId: string; username: string; avatar: string; color: string }, buyIn: number) {
  if (seat < 0 || seat >= t.seats.length) throw new PokerError("Siège invalide");
  if (t.seats[seat]) throw new PokerError("Ce siège est déjà occupé");
  if (seatOf(t, p.userId) !== -1) throw new PokerError("Vous êtes déjà assis à cette table");
  if (!Number.isInteger(buyIn) || buyIn < t.minBuyIn || buyIn > t.maxBuyIn)
    throw new PokerError(`La cave doit être comprise entre ${t.minBuyIn} et ${t.maxBuyIn} VC`);
  t.seats[seat] = { ...p, stack: buyIn, sittingOut: false, leaveAfterHand: false };
  t.log.push(`${p.username} s'assoit avec ${buyIn} VC`);
}

/** Recave : ajoute des jetons quand le joueur n'est pas en main. */
export function rebuy(t: PokerTable, userId: string, amount: number) {
  const i = seatOf(t, userId);
  if (i === -1) throw new PokerError("Vous n'êtes pas assis");
  if (handInProgress(t) && t.hand!.players[i] && !t.hand!.players[i].folded) throw new PokerError("Attendez la fin de la main pour recaver");
  const s = t.seats[i]!;
  if (!Number.isInteger(amount) || amount <= 0 || s.stack + amount > t.maxBuyIn)
    throw new PokerError(`Votre tapis ne peut pas dépasser ${t.maxBuyIn} VC`);
  s.stack += amount;
  s.sittingOut = false;
  t.log.push(`${s.username} recave de ${amount} VC`);
}

/**
 * Quitter la table. Si une main est en cours et que le joueur y participe,
 * il se couche et ses jetons lui sont rendus à la fin de la main.
 * Retourne le montant à rendre immédiatement au portefeuille (0 si différé).
 */
export function leave(t: PokerTable, userId: string): { cashOut: number; deferred: boolean } {
  const i = seatOf(t, userId);
  if (i === -1) return { cashOut: 0, deferred: false };
  const s = t.seats[i]!;
  const ph = t.hand?.players[i];
  if (handInProgress(t) && ph && !ph.folded) {
    s.leaveAfterHand = true;
    if (t.hand!.toAct === i) act(t, userId, "fold");
    else {
      ph.folded = true;
      ph.lastAction = "Couché";
      t.log.push(`${s.username} quitte la table (se couche)`);
      const live = Object.values(t.hand!.players).filter((p) => !p.folded);
      if (live.length === 1) finishUncontested(t, live[0].seat);
    }
    if (!handInProgress(t)) {
      // la main s'est terminée grâce à ce départ
      return { cashOut: removeSeat(t, i), deferred: false };
    }
    return { cashOut: 0, deferred: true };
  }
  if (handInProgress(t) && ph) {
    s.leaveAfterHand = true;
    return { cashOut: 0, deferred: true };
  }
  return { cashOut: removeSeat(t, i), deferred: false };
}

function removeSeat(t: PokerTable, i: number): number {
  const s = t.seats[i]!;
  t.seats[i] = null;
  t.log.push(`${s.username} quitte la table avec ${s.stack} VC`);
  return s.stack;
}

/** Retire les joueurs ayant demandé à partir (hors main). */
export function collectLeavers(t: PokerTable): { userId: string; amount: number }[] {
  if (handInProgress(t)) return [];
  const out: { userId: string; amount: number }[] = [];
  t.seats.forEach((s, i) => {
    if (s?.leaveAfterHand) out.push({ userId: s.userId, amount: removeSeat(t, i) });
  });
  return out;
}

export function setSittingOut(t: PokerTable, userId: string, value: boolean) {
  const i = seatOf(t, userId);
  if (i === -1) throw new PokerError("Vous n'êtes pas assis");
  t.seats[i]!.sittingOut = value;
}

function nextSeat(t: PokerTable, from: number, pred: (i: number) => boolean): number {
  const n = t.seats.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k + n) % n;
    if (pred(i)) return i;
  }
  return -1;
}

export function eligibleSeats(t: PokerTable): number[] {
  return t.seats.map((s, i) => (s && s.stack > 0 && !s.sittingOut && !s.leaveAfterHand ? i : -1)).filter((i) => i >= 0);
}

export function startHand(t: PokerTable, now = Date.now()): void {
  if (handInProgress(t)) throw new PokerError("Une main est déjà en cours");
  for (const s of t.seats) if (s && s.stack === 0) s.sittingOut = true;
  const elig = new Set(eligibleSeats(t));
  if (elig.size < 2) throw new PokerError("Il faut au moins 2 joueurs avec des jetons");

  if (t.hand) archiveHand(t);
  t.handNumber += 1;
  t.log = [];
  const inHand = (i: number) => elig.has(i);
  const button = nextSeat(t, t.button < 0 ? -1 : t.button, inHand);
  t.button = button;
  const headsUp = elig.size === 2;
  const sbSeat = headsUp ? button : nextSeat(t, button, inHand);
  const bbSeat = nextSeat(t, sbSeat, inHand);

  const players: Record<number, PlayerHand> = {};
  for (const i of elig) {
    const s = t.seats[i]!;
    players[i] = { seat: i, userId: s.userId, hole: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, actedLevel: null, startStack: s.stack, vpip: false };
  }
  const hand: HandState = {
    number: t.handNumber,
    deck: shuffle(newDeck()),
    board: [],
    stage: "preflop",
    button,
    sbSeat,
    bbSeat,
    players,
    toAct: null,
    currentBet: 0,
    minRaise: t.bb,
    fullRaiseCount: 0,
    startedAt: now,
  };
  t.hand = hand;
  t.log.push(`— Main n°${t.handNumber} — Bouton : ${t.seats[button]!.username}`);
  post(t, sbSeat, t.sb, "petite blind");
  post(t, bbSeat, t.bb, "grosse blind");
  hand.currentBet = t.bb;

  // distribution : une carte à la fois en partant de la petite blind
  for (let r = 0; r < 2; r++) {
    let i = sbSeat;
    do {
      players[i].hole.push(hand.deck.pop()!);
      i = nextSeat(t, i, inHand);
    } while (i !== sbSeat);
  }
  const first = headsUp ? sbSeat : nextSeat(t, bbSeat, inHand);
  hand.toAct = first;
  if (!canAct(hand, first)) {
    hand.toAct = nextToAct(t, first, true);
  }
  if (hand.toAct === null || roundComplete(hand)) advance(t);
}

function post(t: PokerTable, seat: number, amount: number, what: string) {
  const s = t.seats[seat]!;
  const p = t.hand!.players[seat];
  const a = Math.min(amount, s.stack);
  s.stack -= a;
  p.bet += a;
  p.total += a;
  if (s.stack === 0) p.allIn = true;
  t.log.push(`${s.username} poste la ${what} (${a})`);
}

const canAct = (h: HandState, i: number) => !!h.players[i] && !h.players[i].folded && !h.players[i].allIn;

function nextToAct(t: PokerTable, from: number, includeFrom = false): number | null {
  const h = t.hand!;
  const needs = (i: number) => canAct(h, i) && (!h.players[i].acted || h.players[i].bet < h.currentBet);
  if (includeFrom && needs(from)) return from;
  const i = nextSeat(t, from, needs);
  return i === -1 ? null : i;
}

function roundComplete(h: HandState): boolean {
  const live = Object.values(h.players).filter((p) => !p.folded);
  return live.every((p) => p.allIn || (p.acted && p.bet === h.currentBet));
}

export interface LegalActions {
  fold: boolean;
  check: boolean;
  call: number; // 0 si impossible
  raise: { min: number; max: number } | null; // montants "relancer à"
  allIn: number; // tapis restant
  toCall: number;
}

export function legalActions(t: PokerTable, seat: number): LegalActions | null {
  const h = t.hand;
  if (!h || h.stage === "done" || h.stage === "showdown" || h.toAct !== seat) return null;
  const p = h.players[seat];
  const s = t.seats[seat]!;
  const toCall = Math.max(0, h.currentBet - p.bet);
  const maxTo = p.bet + s.stack;
  const mayRaise = p.actedLevel === null || h.fullRaiseCount > p.actedLevel;
  const othersCanRespond = Object.values(h.players).some((o) => o.seat !== seat && !o.folded && !o.allIn);
  let raise: LegalActions["raise"] = null;
  if (mayRaise && maxTo > h.currentBet && othersCanRespond) {
    const minTo = h.currentBet === 0 ? t.bb : h.currentBet + h.minRaise;
    raise = { min: Math.min(minTo, maxTo), max: maxTo };
  }
  return {
    fold: true,
    check: toCall === 0,
    call: toCall > 0 ? Math.min(toCall, s.stack) : 0,
    raise,
    allIn: (raise || toCall > 0) ? s.stack : 0,
    toCall,
  };
}

export function act(t: PokerTable, userId: string, type: ActionType, amount?: number): void {
  const h = t.hand;
  if (!h || !handInProgress(t)) throw new PokerError("Aucune main en cours");
  const seat = seatOf(t, userId);
  if (seat === -1 || h.toAct !== seat) throw new PokerError("Ce n'est pas votre tour");
  const legal = legalActions(t, seat)!;
  const p = h.players[seat];
  const s = t.seats[seat]!;
  const name = s.username;
  const put = (n: number) => {
    s.stack -= n;
    p.bet += n;
    p.total += n;
    if (s.stack === 0) p.allIn = true;
    if (h.stage === "preflop") p.vpip = true;
  };
  const raiseTo = (to: number) => {
    const increment = to - h.currentBet;
    put(to - p.bet);
    if (increment >= h.minRaise) {
      h.minRaise = increment;
      h.fullRaiseCount += 1;
    }
    h.currentBet = to;
    for (const o of Object.values(h.players)) if (o.seat !== seat && !o.folded && !o.allIn) o.acted = false;
  };

  switch (type) {
    case "fold":
      p.folded = true;
      p.lastAction = "Couché";
      t.log.push(`${name} se couche`);
      break;
    case "check":
      if (!legal.check) throw new PokerError("Impossible de parler : il y a une mise à suivre");
      p.lastAction = "Parole";
      t.log.push(`${name} parle (check)`);
      break;
    case "call":
      if (!legal.call) throw new PokerError("Rien à suivre : utilisez Parole");
      put(legal.call);
      p.lastAction = p.allIn ? "Tapis" : `Suit ${legal.call}`;
      t.log.push(p.allIn ? `${name} suit et fait tapis (${legal.call})` : `${name} suit ${legal.call}`);
      break;
    case "raise": {
      if (!legal.raise) throw new PokerError("Relance impossible");
      const to = Math.floor(Number(amount));
      if (!Number.isFinite(to) || to < legal.raise.min || to > legal.raise.max)
        throw new PokerError(`La relance doit être comprise entre ${legal.raise.min} et ${legal.raise.max}`);
      const wasBet = h.currentBet === 0;
      raiseTo(to);
      p.lastAction = p.allIn ? "Tapis" : `${wasBet ? "Mise" : "Relance à"} ${to}`;
      t.log.push(p.allIn ? `${name} fait tapis (${to})` : `${name} ${wasBet ? "mise" : "relance à"} ${to}`);
      break;
    }
    case "allin": {
      if (!legal.allIn) throw new PokerError("Tapis impossible");
      const to = p.bet + s.stack;
      if (to <= h.currentBet) put(s.stack);
      else raiseTo(to);
      p.lastAction = "Tapis";
      t.log.push(`${name} fait tapis (${p.bet})`);
      break;
    }
    default:
      throw new PokerError("Action inconnue");
  }
  p.acted = true;
  p.actedLevel = h.fullRaiseCount;
  advance(t, seat);
}

function advance(t: PokerTable, fromSeat?: number) {
  const h = t.hand!;
  const live = Object.values(h.players).filter((p) => !p.folded);
  if (live.length === 1) return finishUncontested(t, live[0].seat);

  if (!roundComplete(h)) {
    const from = fromSeat ?? h.toAct ?? h.button;
    h.toAct = nextToAct(t, from);
    if (h.toAct !== null) return;
  }
  // fin du tour d'enchères
  for (const p of Object.values(h.players)) {
    p.bet = 0;
    p.acted = false;
    p.actedLevel = null;
    if (!p.folded && !p.allIn) p.lastAction = undefined;
  }
  h.currentBet = 0;
  h.minRaise = t.bb;
  h.fullRaiseCount = 0;
  h.toAct = null;

  const canBet = live.filter((p) => !p.allIn).length;
  if (h.stage === "river") return showdown(t);
  if (canBet <= 1) {
    while (h.board.length < 5) dealStreet(t);
    return showdown(t);
  }
  dealStreet(t);
  h.toAct = nextToAct(t, h.button);
  if (h.toAct === null) advance(t);
}

function dealStreet(t: PokerTable) {
  const h = t.hand!;
  h.deck.pop(); // carte brûlée
  if (h.board.length === 0) {
    h.board.push(h.deck.pop()!, h.deck.pop()!, h.deck.pop()!);
    h.stage = "flop";
    t.log.push(`Flop : ${h.board.map(pretty).join(" ")}`);
  } else if (h.board.length === 3) {
    h.board.push(h.deck.pop()!);
    h.stage = "turn";
    t.log.push(`Turn : ${pretty(h.board[3])}`);
  } else {
    h.board.push(h.deck.pop()!);
    h.stage = "river";
    t.log.push(`River : ${pretty(h.board[4])}`);
  }
}

function finishUncontested(t: PokerTable, winner: number) {
  const h = t.hand!;
  const pot = Object.values(h.players).reduce((a, p) => a + p.total, 0);
  t.seats[winner]!.stack += pot;
  const name = t.seats[winner]!.username;
  t.log.push(`${name} remporte ${pot} VC (tous les autres se sont couchés)`);
  finalize(t, [{ amount: pot, winners: [winner], label: "Sans abattage" }], {}, false, `${name} remporte ${pot} VC sans abattage`);
}

/** Pots principal et annexes à partir des contributions totales. */
export function computePots(players: { seat: number; total: number; folded: boolean }[]): { amount: number; eligible: number[] }[] {
  const contenders = players.filter((p) => !p.folded);
  const levels = [...new Set(contenders.map((p) => p.total))].filter((l) => l > 0).sort((a, b) => a - b);
  const pots: { amount: number; eligible: number[] }[] = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const p of players) amount += Math.max(0, Math.min(p.total, level) - prev);
    const eligible = contenders.filter((p) => p.total >= level).map((p) => p.seat);
    if (amount > 0) {
      if (pots.length && sameSet(pots[pots.length - 1].eligible, eligible)) pots[pots.length - 1].amount += amount;
      else pots.push({ amount, eligible });
    }
    prev = level;
  }
  const leftover = players.reduce((a, p) => a + Math.max(0, p.total - prev), 0);
  if (leftover && pots.length) pots[pots.length - 1].amount += leftover;
  return pots;
}
const sameSet = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));

function showdown(t: PokerTable) {
  const h = t.hand!;
  h.stage = "showdown";
  const all = Object.values(h.players);
  // restitution de la mise non suivie
  const sorted = [...all].sort((a, b) => b.total - a.total);
  if (sorted.length > 1 && sorted[0].total > sorted[1].total) {
    const excess = sorted[0].total - sorted[1].total;
    sorted[0].total -= excess;
    t.seats[sorted[0].seat]!.stack += excess;
    t.log.push(`${t.seats[sorted[0].seat]!.username} récupère ${excess} VC non suivis`);
  }
  const live = all.filter((p) => !p.folded);
  const evals: Record<number, ReturnType<typeof evaluateBest>> = {};
  const shown: HandResult["shown"] = {};
  for (const p of live) {
    evals[p.seat] = evaluateBest([...p.hole, ...h.board]);
    shown[p.seat] = { hole: p.hole, label: evals[p.seat].label, best: evals[p.seat].best };
    t.log.push(`${t.seats[p.seat]!.username} montre ${p.hole.map(pretty).join(" ")} — ${evals[p.seat].label}`);
  }
  const pots = computePots(all);
  const results: PotResult[] = [];
  pots.forEach((pot, idx) => {
    const best = Math.max(...pot.eligible.map((s) => evals[s].score));
    const winners = pot.eligible.filter((s) => evals[s].score === best);
    // ordre : à partir de la gauche du bouton (reçoit les jetons indivisibles)
    winners.sort((a, b) => ((a - h.button + t.seats.length) % t.seats.length) - ((b - h.button + t.seats.length) % t.seats.length));
    const share = Math.floor(pot.amount / winners.length);
    let rem = pot.amount - share * winners.length;
    for (const w of winners) {
      t.seats[w]!.stack += share + (rem > 0 ? 1 : 0);
      rem--;
    }
    const potName = idx === 0 ? "Pot principal" : `Pot annexe ${idx}`;
    const names = winners.map((w) => t.seats[w]!.username).join(" et ");
    t.log.push(
      winners.length > 1
        ? `${potName} (${pot.amount}) partagé entre ${names} — ${evals[winners[0]].label}`
        : `${names} remporte le ${potName.toLowerCase()} (${pot.amount}) avec ${evals[winners[0]].label}`,
    );
    results.push({ amount: pot.amount, winners, label: evals[winners[0]].label });
  });
  const main = results[0];
  const summary =
    main.winners.length > 1
      ? `Égalité : pot partagé (${main.label})`
      : `${t.seats[main.winners[0]]!.username} gagne avec ${main.label}`;
  finalize(t, results, shown, true, summary, evals);
}

function finalize(
  t: PokerTable,
  pots: PotResult[],
  shown: HandResult["shown"],
  wasShowdown: boolean,
  summary: string,
  evals: Record<number, ReturnType<typeof evaluateBest>> = {},
) {
  const h = t.hand!;
  const net: Record<number, number> = {};
  const winnersAll = new Set(pots.flatMap((p) => p.winners));
  const participants: HandResult["participants"] = [];
  for (const p of Object.values(h.players)) {
    const s = t.seats[p.seat]!;
    net[p.seat] = s.stack - p.startStack;
    participants.push({
      userId: p.userId,
      seat: p.seat,
      net: net[p.seat],
      won: winnersAll.has(p.seat),
      showdown: wasShowdown && !p.folded,
      label: evals[p.seat]?.label ?? null,
      category: evals[p.seat]?.category ?? -1,
      vpip: p.vpip,
      hole: p.hole,
    });
  }
  const potTotal = pots.reduce((a, p) => a + p.amount, 0);
  h.result = { pots, shown, net, showdown: wasShowdown, summary, participants, potTotal };
  h.stage = "done";
  h.toAct = null;
  h.endedAt = Date.now();
}

function archiveHand(t: PokerTable) {
  const h = t.hand!;
  t.history.unshift({ number: h.number, board: h.board, lines: t.log.slice(), result: h.result ? { summary: h.result.summary, potTotal: h.result.potTotal } : undefined });
  t.history = t.history.slice(0, 15);
}

/** Action automatique pour un joueur absent (déclenchée par l'hôte) : parole si possible, sinon couché. */
export function forceAbsentAction(t: PokerTable): string {
  const h = t.hand;
  if (!h || h.toAct === null) throw new PokerError("Personne n'a la parole");
  const seat = h.toAct;
  const s = t.seats[seat]!;
  const legal = legalActions(t, seat)!;
  if (legal.check) act(t, s.userId, "check");
  else act(t, s.userId, "fold");
  return s.userId;
}

// ---------------------------------------------------------------- vues

export function viewFor(t: PokerTable, viewerId: string) {
  const h = t.hand;
  const mySeat = seatOf(t, viewerId);
  let hand = null as null | Record<string, unknown>;
  if (h) {
    const players: Record<number, unknown> = {};
    for (const p of Object.values(h.players)) {
      const reveal = p.userId === viewerId || (h.stage === "done" && h.result?.shown[p.seat]);
      players[p.seat] = {
        seat: p.seat,
        bet: p.bet,
        total: p.total,
        folded: p.folded,
        allIn: p.allIn,
        lastAction: p.lastAction ?? null,
        hole: reveal ? p.hole : p.hole.map(() => null),
      };
    }
    hand = {
      number: h.number,
      board: h.board,
      stage: h.stage,
      button: h.button,
      sbSeat: h.sbSeat,
      bbSeat: h.bbSeat,
      toAct: h.toAct,
      currentBet: h.currentBet,
      pot: Object.values(h.players).reduce((a, p) => a + p.total, 0),
      players,
      result: h.stage === "done" ? h.result : null,
      endedAt: h.endedAt ?? null,
    };
  }
  let me = null as null | Record<string, unknown>;
  if (mySeat !== -1) {
    const ph = h?.players[mySeat];
    me = {
      seat: mySeat,
      legal: legalActions(t, mySeat),
      handInfo: ph && ph.hole.length ? handHelp(t, mySeat) : null,
    };
  }
  return {
    seats: t.seats,
    sb: t.sb,
    bb: t.bb,
    minBuyIn: t.minBuyIn,
    maxBuyIn: t.maxBuyIn,
    handNumber: t.handNumber,
    hand,
    me,
    log: t.log.slice(-60),
    history: t.history.slice(0, 10),
  };
}

/** Aide au joueur, volontairement limitée : le nom de sa main et ce qu'elle est, sans chances ni conseils. */
function handHelp(t: PokerTable, seat: number) {
  const h = t.hand!;
  const { label, category, cards, explain, shared } = describeCurrent(h.players[seat].hole, h.board);
  return { label, category, cards, explain, shared };
}

/** Somme de tous les jetons (tapis + mises). Sert aux tests d'invariants. */
export function chipsInPlay(t: PokerTable): number {
  let n = t.seats.reduce((a, s) => a + (s?.stack ?? 0), 0);
  if (t.hand && handInProgress(t)) n += Object.values(t.hand.players).reduce((a, p) => a + p.total, 0);
  return n;
}
