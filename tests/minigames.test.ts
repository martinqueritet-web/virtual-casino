import { describe, it, expect } from "vitest";
import * as G from "../server/games/minigames";

describe("Mines", () => {
  it("multiplicateurs : équitables × 97 %", () => {
    expect(G.minesMultiplier(3, 0)).toBe(1);
    // 3 mines, 1 case : 25/22 × 0,97 = 1,10
    expect(G.minesMultiplier(3, 1)).toBe(1.1);
    expect(G.minesMultiplier(24, 1)).toBe(24.25);
    expect(G.minesMultiplier(1, 24)).toBeGreaterThan(G.minesMultiplier(1, 23));
  });

  it("la vue ne révèle jamais la grille pendant la partie, et la preuve se vérifie après", () => {
    const g = G.minesStart(10, 5);
    expect(g.layout).toHaveLength(5);
    const v = G.minesView(g);
    expect(v.layout).toBeNull();
    expect(JSON.stringify(v)).not.toContain(g.salt);
    const safe = [...Array(25).keys()].find((c) => !g.layout.includes(c))!;
    G.minesReveal(g, safe);
    G.minesCashout(g);
    const end = G.minesView(g);
    expect(end.layout).toEqual(g.layout);
    expect(G.commitmentOf(end.layout!, end.salt!)).toBe(end.commitment);
    expect(end.payout).toBe(Math.floor(10 * G.minesMultiplier(5, 1)));
  });

  it("toucher une mine fait perdre la mise ; règles d'usage", () => {
    const g = G.minesStart(10, 24);
    expect(() => G.minesCashout(g)).toThrow(/au moins une case/);
    G.minesReveal(g, g.layout[0]);
    expect(g.stage).toBe("lost");
    expect(g.payout).toBe(0);
    expect(() => G.minesReveal(g, 0)).toThrow(/terminée/);
    expect(() => G.minesStart(10, 25)).toThrow();
  });

  it("simulation : le retour moyen reste proche de 97 %", () => {
    let bet = 0;
    let won = 0;
    for (let i = 0; i < 40000; i++) {
      const g = G.minesStart(100, 3);
      bet += 100;
      for (let k = 0; k < 4 && g.stage === "playing"; k++) {
        const cell = [...Array(25).keys()].find((c) => !g.revealed.includes(c) && (k > 0 || true) && !g.revealed.includes(c))!;
        // case choisie au hasard parmi les non découvertes
        const free = [...Array(25).keys()].filter((c) => !g.revealed.includes(c));
        G.minesReveal(g, free[Math.floor(Math.random() * free.length)] ?? cell);
      }
      if (g.stage === "playing") G.minesCashout(g);
      won += g.payout;
    }
    expect(won / bet).toBeGreaterThan(0.93);
    expect(won / bet).toBeLessThan(1.0);
  });
});

describe("Roulette européenne", () => {
  it("couleurs et ordre du cylindre", () => {
    expect(G.RED.size).toBe(18);
    expect(G.WHEEL).toHaveLength(37);
    expect(new Set(G.WHEEL).size).toBe(37);
  });

  it("paiements de chaque type de mise", () => {
    expect(G.rouletteWins({ type: "plein", value: 17, amount: 1 }, 17)).toBe(true);
    expect(G.rouletteWins({ type: "rouge", amount: 1 }, 0)).toBe(false); // le zéro fait perdre les chances simples
    expect(G.rouletteWins({ type: "douzaine", value: 2, amount: 1 }, 24)).toBe(true);
    expect(G.rouletteWins({ type: "colonne", value: 1, amount: 1 }, 34)).toBe(true);
    expect(G.rouletteWins({ type: "passe", amount: 1 }, 19)).toBe(true);
  });

  it("validation des mises", () => {
    expect(() => G.validateRouletteBets([])).toThrow();
    expect(() => G.validateRouletteBets([{ type: "plein", value: 37, amount: 5 }])).toThrow();
    expect(() => G.validateRouletteBets([{ type: "triche", amount: 5 }])).toThrow();
    expect(G.validateRouletteBets([{ type: "rouge", amount: 5, value: 99 }])).toEqual([{ type: "rouge", amount: 5 }]);
  });

  it("simulation : retour proche de 36/37 ≈ 97,3 %", () => {
    let bet = 0;
    let won = 0;
    for (let i = 0; i < 100000; i++) {
      const r = G.rouletteSpin([{ type: "plein", value: 7, amount: 1 }, { type: "rouge", amount: 1 }, { type: "douzaine", value: 3, amount: 1 }]);
      bet += r.total;
      won += r.payout;
    }
    expect(Math.abs(won / bet - 36 / 37)).toBeLessThan(0.02);
  });
});

describe("Plinko", () => {
  it("taux de retour théoriques ≈ 99 %", () => {
    for (const r of ["faible", "moyen", "eleve"] as const) {
      expect(G.plinkoRTP(r)).toBeGreaterThan(0.98);
      expect(G.plinkoRTP(r)).toBeLessThan(1);
    }
  });
  it("le chemin de la bille détermine la case", () => {
    for (let i = 0; i < 1000; i++) {
      const d = G.plinkoDrop(10, "moyen");
      expect(d.path).toHaveLength(12);
      expect(d.slot).toBe(d.path.filter((x) => x === 1).length);
      expect(d.payout).toBe(Math.floor(10 * G.PLINKO_TABLES.moyen[d.slot]));
    }
  });
});
