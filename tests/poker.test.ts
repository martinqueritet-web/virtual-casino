import { describe, it, expect } from "vitest";
import { evaluateBest, describeCurrent } from "../server/games/evaluator";
import * as P from "../server/games/poker";

const E = (s: string) => evaluateBest(s.split(" "));

describe("évaluateur de mains", () => {
  it("libellés français", () => {
    expect(E("Kh Kd 7s 4c 2d 9h 3s").label).toBe("Paire de Rois");
    expect(E("Ah Ad 7s 4c 2d 9h 3s").label).toBe("Paire d'As");
    expect(E("Qh Qd 7s 7c 2d 9h 3s").label).toBe("Double paire Dames et Sept");
    expect(E("Th Ts Tc 4c 2d 9h 3s").label).toBe("Brelan de Dix");
    expect(E("Ah 2d 3s 4c 5d Kh Ks").label).toBe("Quinte au Cinq");
    expect(E("Ah 3h 7h 9h Jh Kc 2d").label).toBe("Couleur à l'As");
    expect(E("Qh Qd Qs 8c 8d 2h 3s").label).toBe("Full aux Dames par les Huit");
    expect(E("Ah Ad As Ac 5d 2h 3s").label).toBe("Carré d'As");
    expect(E("9h Th Jh Qh Kh 2c 3d").label).toBe("Quinte flush au Roi");
    expect(E("Th Jh Qh Kh Ah 2c 3d").label).toBe("Quinte flush royale");
    expect(E("Ah Jd 9s 7c 4d 3h 2s").label).toBe("Carte haute As");
  });

  it("classement et départages", () => {
    expect(E("Ah Ad Ks 7c 2d 4h 9s").score).toBeGreaterThan(E("Ah Ad Qs 7c 2d 4h 9s").score); // kicker
    expect(E("2h 3d 4s 5c 6d Kh Ks").score).toBeGreaterThan(E("Ah 2d 3s 4c 5d Kh Qs").score); // quinte 6 > roue
    expect(E("2h 2d 2s 3c 3d 9h Ks").score).toBeGreaterThan(E("Ah Kh 9h 7h 2h 3c 4d").score); // full > couleur
    // égalité exacte (le board joue)
    expect(E("2c 3d Ah Kh Qh Jh Th").score).toBe(E("4c 5d Ah Kh Qh Jh Th").score);
  });

  it("aide pédagogique : main courante et tirages", () => {
    expect(describeCurrent(["Kh", "Kd"], []).label).toBe("Paire de Rois");
    expect(describeCurrent(["Ah", "7h"], ["2h", "9h", "Kc"]).draws[0]).toMatch(/Tirage couleur/);
    expect(describeCurrent(["8c", "9d"], ["Th", "Js", "2c"]).draws[0]).toMatch(/deux bouts/);
  });
});

describe("pots annexes", () => {
  it("répartit correctement plusieurs tapis", () => {
    const pots = P.computePots([
      { seat: 0, total: 100, folded: false },
      { seat: 1, total: 300, folded: false },
      { seat: 2, total: 300, folded: false },
      { seat: 3, total: 50, folded: true },
    ]);
    expect(pots).toEqual([
      { amount: 350, eligible: [0, 1, 2] },
      { amount: 400, eligible: [1, 2] },
    ]);
  });
});

function table3() {
  const t = P.createTable({ sb: 5, bb: 10, maxSeats: 6 });
  t.minBuyIn = 10;
  ["a", "b", "c"].forEach((id, i) => P.sit(t, i, { userId: id, username: id.toUpperCase(), avatar: "", color: "" }, 200));
  return t;
}

describe("déroulement d'une main", () => {
  it("blinds, ordre de parole, et victoire sans abattage", () => {
    const t = table3();
    P.startHand(t);
    const h = t.hand!;
    expect(h.button).toBe(0);
    expect(h.sbSeat).toBe(1);
    expect(h.bbSeat).toBe(2);
    expect(h.toAct).toBe(0); // UTG = bouton à 3 joueurs
    expect(P.legalActions(t, 0)!.check).toBe(false);
    expect(P.legalActions(t, 0)!.raise!.min).toBe(20);
    expect(() => P.act(t, "b", "call")).toThrow(/pas votre tour/);
    P.act(t, "a", "raise", 30);
    P.act(t, "b", "fold");
    P.act(t, "c", "fold");
    expect(h.stage).toBe("done");
    expect(t.seats[0]!.stack).toBe(215);
    expect(P.chipsInPlay(t)).toBe(600);
  });

  it("la grosse blind garde l'option", () => {
    const t = table3();
    P.startHand(t);
    P.act(t, "a", "call");
    P.act(t, "b", "call");
    expect(t.hand!.toAct).toBe(2);
    expect(P.legalActions(t, 2)!.check).toBe(true);
    P.act(t, "c", "check");
    expect(t.hand!.stage).toBe("flop");
    expect(t.hand!.board).toHaveLength(3);
    expect(t.hand!.toAct).toBe(1); // premier après le bouton
  });

  it("heads-up : le bouton poste la petite blind et parle en premier préflop", () => {
    const t = P.createTable({ sb: 5, bb: 10 });
    P.sit(t, 0, { userId: "a", username: "A", avatar: "", color: "" }, 100);
    P.sit(t, 4, { userId: "b", username: "B", avatar: "", color: "" }, 100);
    P.startHand(t);
    expect(t.hand!.sbSeat).toBe(t.hand!.button);
    expect(t.hand!.toAct).toBe(t.hand!.button);
    P.act(t, t.seats[t.hand!.button]!.userId, "call");
    P.act(t, t.seats[t.hand!.bbSeat]!.userId, "check");
    expect(t.hand!.toAct).toBe(t.hand!.bbSeat); // postflop : la BB parle d'abord
  });

  it("un tapis court ne rouvre pas les relances", () => {
    const t = P.createTable({ sb: 5, bb: 10 });
    t.minBuyIn = 10;
    P.sit(t, 0, { userId: "a", username: "A", avatar: "", color: "" }, 500);
    P.sit(t, 1, { userId: "b", username: "B", avatar: "", color: "" }, 500);
    P.sit(t, 2, { userId: "c", username: "C", avatar: "", color: "" }, 45);
    P.startHand(t); // bouton 0, SB 1, BB 2
    P.act(t, "a", "raise", 30); // relance de 20
    P.act(t, "b", "call");
    P.act(t, "c", "allin"); // 45 : relance de 15 < 20 → incomplète
    expect(t.hand!.toAct).toBe(0);
    const la = P.legalActions(t, 0)!;
    expect(la.call).toBe(15);
    expect(la.raise).toBeNull(); // A a déjà agi, pas de relance complète depuis
  });

  it("tapis multiples et pots annexes jusqu'à l'abattage", () => {
    const t = P.createTable({ sb: 5, bb: 10 });
    t.minBuyIn = 10;
    P.sit(t, 0, { userId: "a", username: "A", avatar: "", color: "" }, 50);
    P.sit(t, 1, { userId: "b", username: "B", avatar: "", color: "" }, 150);
    P.sit(t, 2, { userId: "c", username: "C", avatar: "", color: "" }, 300);
    P.startHand(t);
    P.act(t, "a", "allin");
    P.act(t, "b", "allin");
    P.act(t, "c", "call");
    const h = t.hand!;
    expect(h.stage).toBe("done");
    expect(h.board).toHaveLength(5);
    expect(h.result!.pots.length).toBe(2);
    expect(h.result!.pots[0].amount).toBe(150);
    expect(h.result!.pots[1].amount).toBe(200);
    expect(P.chipsInPlay(t)).toBe(500);
    expect(t.seats[2]!.stack).toBeGreaterThanOrEqual(150); // C récupère au moins ses 150 non suivis
  });

  it("départ en cours de main : le joueur se couche, ses jetons sont rendus ensuite", () => {
    const t = table3();
    P.startHand(t);
    const r = P.leave(t, "b"); // b n'a pas la parole
    expect(r.deferred).toBe(true);
    expect(t.hand!.players[1].folded).toBe(true);
    P.act(t, "a", "fold");
    expect(t.hand!.stage).toBe("done");
    const out = P.collectLeavers(t);
    expect(out).toEqual([{ userId: "b", amount: 195 }]);
    expect(t.seats[1]).toBeNull();
  });

  it("l'hôte peut faire jouer un absent (parole sinon couché)", () => {
    const t = table3();
    P.startHand(t);
    P.forceAbsentAction(t); // a doit 10 → couché
    expect(t.hand!.players[0].folded).toBe(true);
  });

  it("la vue ne révèle jamais les cartes adverses ni le paquet", () => {
    const t = table3();
    P.startHand(t);
    const v = P.viewFor(t, "a") as any;
    expect(v.hand.players[0].hole.every((c: string | null) => c)).toBe(true);
    expect(v.hand.players[1].hole).toEqual([null, null]);
    expect(JSON.stringify(v)).not.toContain('"deck"');
    expect(v.me.handInfo.label).toBeTruthy();
  });
});

describe("simulation : invariants sur 3 000 mains aléatoires", () => {
  it("aucun jeton créé ou perdu, aucune erreur", () => {
    const t = P.createTable({ sb: 1, bb: 2, maxSeats: 10 });
    t.minBuyIn = 1;
    t.maxBuyIn = 100000;
    const n = 7;
    for (let i = 0; i < n; i++) P.sit(t, i, { userId: "u" + i, username: "U" + i, avatar: "", color: "" }, 100 + i * 37);
    let total = P.chipsInPlay(t);
    let hands = 0;
    let splits = 0;
    for (let k = 0; k < 3000; k++) {
      // les joueurs éliminés recavent (le total de référence est ajusté)
      for (const s of t.seats) {
        if (s && s.stack === 0) {
          s.stack = 100;
          s.sittingOut = false;
          total += 100;
        }
      }
      P.startHand(t);
      hands++;
      let guard = 0;
      while (P.handInProgress(t)) {
        const seat = t.hand!.toAct!;
        const la = P.legalActions(t, seat)!;
        const uid = t.seats[seat]!.userId;
        const r = Math.random();
        if (r < 0.15) P.act(t, uid, "fold");
        else if (r < 0.55) P.act(t, uid, la.check ? "check" : "call");
        else if (r < 0.85 && la.raise) P.act(t, uid, "raise", la.raise.min + Math.floor(Math.random() * (la.raise.max - la.raise.min + 1)));
        else if (la.allIn) P.act(t, uid, "allin");
        else P.act(t, uid, la.check ? "check" : "call");
        if (++guard > 500) throw new Error("boucle infinie");
      }
      if (t.hand!.result!.pots.some((p) => p.winners.length > 1)) splits++;
      expect(P.chipsInPlay(t)).toBe(total);
      for (const s of t.seats) if (s) expect(s.stack).toBeGreaterThanOrEqual(0);
    }
    expect(hands).toBeGreaterThan(50);
    expect(splits).toBeGreaterThanOrEqual(0);
  });
});

describe("évaluateur rapide", () => {
  it("donne exactement le même score que l'évaluateur complet sur 20 000 mains", async () => {
    const { fastScore, encodeCard } = await import("../server/games/evaluator");
    const { newDeck, shuffle } = await import("../server/games/cards");
    for (let i = 0; i < 20000; i++) {
      const seven = shuffle(newDeck()).slice(0, 7);
      expect(fastScore(seven.map(encodeCard))).toBe(evaluateBest(seven).score);
    }
  });
});

describe("aide pédagogique enrichie", () => {
  it("double paire : les 4 cartes de la combinaison, sans la carte d'appoint", () => {
    const d = describeCurrent(["Kh", "7d"], ["Kc", "7s", "2h", "Jd"]);
    expect(d.label).toBe("Double paire Rois et Sept");
    expect(d.cards.sort()).toEqual(["7d", "7s", "Kc", "Kh"].sort());
    expect(d.explain).toMatch(/Deux paires/);
    expect(d.shared).toBe(false);
  });
  it("carte haute : explication et carte mise en avant", () => {
    const d = describeCurrent(["Ah", "9d"], ["Kc", "7s", "2h"]);
    expect(d.label).toBe("Carte haute As");
    expect(d.cards).toEqual(["Ah"]);
    expect(d.explain).toMatch(/Aucune combinaison/);
  });
  it("prévient quand la combinaison est entièrement sur la table", () => {
    const d = describeCurrent(["Ah", "9d"], ["Kc", "Ks", "2h"]);
    expect(d.label).toBe("Paire de Rois");
    expect(d.shared).toBe(true);
    expect(d.explain).toMatch(/tous les joueurs/);
  });
  it("avant le flop : conseils sur les cartes de départ", () => {
    expect(describeCurrent(["Qh", "Jh"], []).explain).toMatch(/même couleur.*se suivent/s);
    expect(describeCurrent(["8c", "8d"], []).explain).toMatch(/très bon départ/);
  });
  it("la vue du joueur donne ses chances et la cote du pot", () => {
    const t = table3();
    P.startHand(t);
    const me = (P.viewFor(t, "a") as any).me.handInfo;
    expect(me.equity).toBeGreaterThan(0);
    expect(me.equity).toBeLessThan(1);
    expect(me.potOdds).toBeCloseTo(10 / 25, 2); // 10 à payer pour un pot de 15
    expect(me.opponents).toBe(2);
  });
});
