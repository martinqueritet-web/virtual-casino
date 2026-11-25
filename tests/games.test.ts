import { describe, it, expect } from "vitest";
import * as BJ from "../server/games/blackjack";
import * as SL from "../server/games/slots";

describe("blackjack", () => {
  it("valeur des mains et gestion des As", () => {
    expect(BJ.handValue(["As", "Kd"])).toEqual({ total: 21, soft: true });
    expect(BJ.handValue(["As", "Ad", "9c"])).toEqual({ total: 21, soft: true });
    expect(BJ.handValue(["As", "Ad", "9c", "5h"])).toEqual({ total: 16, soft: false });
    expect(BJ.handValue(["Ts", "6d", "8c"]).total).toBe(24);
  });

  it("stratégie de base", () => {
    expect(BJ.recommend(["8s", "8d"], "Ts", true, true).action).toBe("split");
    expect(BJ.recommend(["As", "Ad"], "6s", true, true).action).toBe("split");
    expect(BJ.recommend(["Ts", "Td"], "6s", true, true).action).toBe("stand");
    expect(BJ.recommend(["6s", "5d"], "6s", true, false).action).toBe("double");
    expect(BJ.recommend(["6s", "5d", "2c"], "6s", false, false).action).toBe("stand"); // 13 vs 6
    expect(BJ.recommend(["Ts", "6d"], "Ts", true, false).action).toBe("hit");
    expect(BJ.recommend(["As", "7d"], "9s", true, false).action).toBe("hit");
    expect(BJ.recommend(["As", "7d"], "4s", true, false).action).toBe("double");
    expect(BJ.recommend(["Ts", "2d"], "4s", true, false).action).toBe("stand");
  });

  it("parties aléatoires sur un même sabot : gains cohérents, carte cachée, assurance, abandon", () => {
    let prev: { shoe: string[]; discards: number } | undefined;
    let reshuffles = 0;
    let insurances = 0;
    let surrenders = 0;
    for (let i = 0; i < 3000; i++) {
      const g = BJ.newGame(10, false, prev);
      if (g.reshuffled) reshuffles++;
      if (g.stage !== "done") expect(BJ.bjView(g).dealer[1]).toBeNull();
      if (g.stage === "insurance") {
        expect(g.dealer[0][0]).toBe("A");
        const take = i % 2 === 0;
        BJ.decideInsurance(g, take);
        if (take) insurances++;
      }
      let guard = 0;
      while (g.stage === "player") {
        const l = BJ.legal(g);
        const h = g.hands[g.active];
        const rec = BJ.recommend(h.cards, g.dealer[0], l.double, l.split, l.surrender);
        if (rec.action === "surrender") surrenders++;
        BJ.play(g, l[rec.action] ? rec.action : "stand");
        if (++guard > 50) throw new Error("boucle");
      }
      for (const h of g.hands) {
        const expected = { blackjack: h.bet * 2.5, win: h.bet * 2, push: h.bet, lose: 0, bust: 0, surrender: h.bet / 2 }[h.result!];
        expect(expected).toBeDefined();
        expect(h.payout).toBe(Math.floor(expected!));
      }
      if (g.insurance) expect(g.insurancePayout).toBe(g.dealerBlackjack ? g.insurance * 3 : 0);
      expect(g.totalBet).toBe(g.hands.reduce((a, h) => a + h.bet, 0) + g.insurance);
      expect(g.totalPayout).toBe(g.hands.reduce((a, h) => a + h.payout!, 0) + g.insurancePayout);
      const dv = BJ.handValue(g.dealer).total;
      if (g.hands.some((h) => !h.surrendered && BJ.handValue(h.cards).total <= 21) && g.dealer.length > 2) expect(dv).toBeGreaterThanOrEqual(17);
      prev = { shoe: g.shoe, discards: g.discards };
    }
    // 3 000 manches ≈ 15 000 cartes : le sabot de 312 cartes est remélangé régulièrement
    expect(reshuffles).toBeGreaterThan(30);
    expect(insurances).toBeGreaterThan(0);
    expect(surrenders).toBeGreaterThan(0);
  });

  it("le sabot est conservé jusqu'à la carte de coupe", () => {
    const g1 = BJ.newGame(10, false);
    expect(g1.reshuffled).toBe(true);
    while (g1.stage === "insurance" || g1.stage === "player") g1.stage === "insurance" ? BJ.decideInsurance(g1, false) : BJ.play(g1, "stand");
    const before = g1.shoe.length;
    const g2 = BJ.newGame(10, false, { shoe: g1.shoe.slice(), discards: g1.discards });
    expect(g2.reshuffled).toBe(false);
    expect(g2.shoe.length).toBeLessThanOrEqual(before - 4);
    expect(g2.discards).toBeGreaterThanOrEqual(4);
    const g3 = BJ.newGame(10, false, { shoe: g1.shoe.slice(0, BJ.CUT_CARD), discards: 200 });
    expect(g3.reshuffled).toBe(true);
    expect(g3.shoe.length).toBe(BJ.SHOE_SIZE - 4);
  });

  it("stratégie : abandon de 16 contre un 10, assurance refusée", () => {
    expect(BJ.recommend(["Ts", "6d"], "Th", true, false, true).action).toBe("surrender");
    expect(BJ.recommend(["8s", "8d"], "Th", true, true, true).action).toBe("split");
    expect(BJ.recommend(["Ts", "6d"], "Th", false, false, false).action).toBe("hit");
  });
});

describe("machines à sous", () => {
  it("taux de retour théorique autour de 96 %", () => {
    expect(SL.theoreticalRTP()).toBeGreaterThan(0.9);
    expect(SL.theoreticalRTP()).toBeLessThan(1);
  });
  it("la simulation confirme le taux théorique", () => {
    let bet = 0;
    let won = 0;
    for (let i = 0; i < 200_000; i++) {
      const r = SL.spin(1);
      bet += 1;
      won += r.win;
      expect(r.line).toEqual(r.grid.map((c) => c[1]));
    }
    expect(Math.abs(won / bet - SL.theoreticalRTP())).toBeLessThan(0.03);
  });
  it("5 machines à thème", () => {
    expect(SL.MACHINES.map((m) => m.id)).toEqual(["classique", "egypte", "olympe", "espace", "neon"]);
    for (const m of SL.MACHINES) expect(m.symbols).toHaveLength(SL.WEIGHTS.length);
  });
});
