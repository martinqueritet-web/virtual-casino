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

  it("parties aléatoires : gains cohérents, la vue cache la carte du croupier", () => {
    for (let i = 0; i < 2000; i++) {
      const g = BJ.newGame(10, false);
      if (g.stage === "player") expect(BJ.bjView(g).dealer[1]).toBeNull();
      let guard = 0;
      while (g.stage === "player") {
        const l = BJ.legal(g);
        const h = g.hands[g.active];
        const rec = BJ.recommend(h.cards, g.dealer[0], l.double, l.split);
        BJ.play(g, l[rec.action] ? rec.action : "stand");
        if (++guard > 50) throw new Error("boucle");
      }
      for (const h of g.hands) {
        expect(["blackjack", "win", "push", "lose", "bust"]).toContain(h.result);
        const expected = { blackjack: h.bet * 2.5, win: h.bet * 2, push: h.bet, lose: 0, bust: 0 }[h.result!];
        expect(h.payout).toBe(Math.floor(expected));
      }
      expect(g.totalBet).toBe(g.hands.reduce((a, h) => a + h.bet, 0));
      const dv = BJ.handValue(g.dealer).total;
      if (!g.hands.every((h) => BJ.handValue(h.cards).total > 21) && g.dealer.length > 2) expect(dv).toBeGreaterThanOrEqual(17);
    }
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
