import { describe, it, expect } from "vitest";
import * as T from "../server/games/tablegames";
import { newDeck, shuffle } from "../server/games/cards";

describe("Baccara", () => {
  it("valeurs des cartes et totaux (modulo 10)", () => {
    expect(T.baccaratTotal(["As", "9d"])).toBe(0);
    expect(T.baccaratTotal(["Ks", "7d"])).toBe(7);
    expect(T.baccaratTotal(["8s", "7d", "Ah"])).toBe(6);
  });
  it("tableau officiel de tirage du banquier", () => {
    expect(T.bankerDraws(3, "8c")).toBe(false);
    expect(T.bankerDraws(3, "9c")).toBe(true);
    expect(T.bankerDraws(4, "Ac")).toBe(false);
    expect(T.bankerDraws(4, "2c")).toBe(true);
    expect(T.bankerDraws(6, "7c")).toBe(true);
    expect(T.bankerDraws(6, null)).toBe(false);
    expect(T.bankerDraws(5, null)).toBe(true);
  });
  it("égalité : mises Joueur/Banque rendues ; Banque payée 0,95", () => {
    const tie = { winner: "egalite", playerPair: false, bankerPair: false } as any;
    expect(T.baccaratSettle([{ type: "joueur", amount: 100 }], tie)[0].payout).toBe(100);
    expect(T.baccaratSettle([{ type: "egalite", amount: 10 }], tie)[0].payout).toBe(90);
    const bank = { winner: "banque", playerPair: false, bankerPair: false } as any;
    expect(T.baccaratSettle([{ type: "banque", amount: 100 }], bank)[0].payout).toBe(195);
  });
  it("simulation : avantage maison conforme (Banque ≈ 98,9 %, Joueur ≈ 98,8 %)", () => {
    let pb = 0;
    let bb = 0;
    const n = 150000;
    let shoe: string[] = [];
    for (let i = 0; i < n; i++) {
      if (shoe.length < 20) shoe = shuffle(newDeck(8));
      const c = T.baccaratCoup(shoe);
      const r = T.baccaratSettle([{ type: "joueur", amount: 100 }, { type: "banque", amount: 100 }], c);
      pb += r[0].payout;
      bb += r[1].payout;
      expect(c.player.length + c.banker.length).toBe(c.order.length);
    }
    expect(Math.abs(pb / (n * 100) - 0.9876)).toBeLessThan(0.012);
    expect(Math.abs(bb / (n * 100) - 0.9894)).toBeLessThan(0.012);
  }, 60000);
});

describe("Vidéo poker", () => {
  it("combinaisons payantes", () => {
    expect(T.vpHand(["Th", "Jh", "Qh", "Kh", "Ah"])!.pays).toBe(800);
    expect(T.vpHand(["Jh", "Jd", "2c", "5s", "9d"])!.id).toBe("jacks");
    expect(T.vpHand(["Th", "Td", "2c", "5s", "9d"])).toBeNull(); // paire de 10 : ne paie pas
    expect(T.vpHand(["Ah", "2d", "3c", "4s", "5d"])!.id).toBe("straight");
  });
  it("partie : les cartes gardées restent, les autres sont remplacées", () => {
    const g = T.vpDeal(10);
    const before = g.hand.slice();
    T.vpDraw(g, [true, false, true, false, false]);
    expect(g.hand[0]).toBe(before[0]);
    expect(g.hand[2]).toBe(before[2]);
    expect(new Set(g.hand).size).toBe(5);
    expect(g.stage).toBe("done");
    expect(() => T.vpDraw(g, [true, true, true, true, true])).toThrow();
  });
  it("conseils de stratégie", () => {
    expect(T.vpAdvice(["Th", "Jh", "Qh", "Kh", "2c"]).hold).toEqual([true, true, true, true, false]);
    expect(T.vpAdvice(["Qh", "Qd", "2c", "5s", "9d"]).hold).toEqual([true, true, false, false, false]);
    expect(T.vpAdvice(["2h", "7d", "4c", "9s", "3d"]).hold).toEqual([false, false, false, false, false]);
  });
  it("simulation avec les conseils : retour élevé (≈ 97-99 %)", () => {
    let paid = 0;
    const n = 30000;
    for (let i = 0; i < n; i++) {
      const g = T.vpDeal(1);
      T.vpDraw(g, T.vpAdvice(g.hand).hold);
      paid += g.payout;
    }
    expect(paid / n).toBeGreaterThan(0.9);
    expect(paid / n).toBeLessThan(1.06);
  }, 60000);
});

describe("Keno", () => {
  it("taux de retour entre 93 et 98 % pour chaque nombre de numéros", () => {
    for (let n = 1; n <= 10; n++) {
      expect(T.kenoRTP(n)).toBeGreaterThan(0.92);
      expect(T.kenoRTP(n)).toBeLessThan(0.98);
    }
  });
  it("tirage de 10 numéros distincts et validation", () => {
    const r = T.kenoDraw([1, 2, 3], 10);
    expect(new Set(r.drawn).size).toBe(10);
    expect(() => T.kenoValidate([])).toThrow();
    expect(() => T.kenoValidate([41])).toThrow();
    expect(T.kenoValidate([5, 5, 3])).toEqual([3, 5]);
  });
});

describe("Roue de la fortune", () => {
  it("54 cases réparties comme une vraie roue", () => {
    expect(T.WHEEL_SEGMENTS).toHaveLength(54);
    const count = (s: string) => T.WHEEL_SEGMENTS.filter((x) => x === s).length;
    expect([count("1"), count("2"), count("5"), count("10"), count("20"), count("joker"), count("casino")]).toEqual([24, 15, 7, 4, 2, 1, 1]);
  });
  it("paiements", () => {
    const r = T.wheelSpin([{ symbol: "1", amount: 10 }]);
    expect(r.payout).toBe(r.symbol === "1" ? 20 : 0);
    expect(() => T.wheelValidate([{ symbol: "1", amount: 5 }, { symbol: "1", amount: 5 }])).toThrow();
  });
});
