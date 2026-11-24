import { describe, it, expect } from "vitest";
import * as P from "../server/games/poker";
import { BOTS, decide, estimateEquity } from "../server/games/pokerbot";

describe("IA des bots", () => {
  it("estime correctement l'équité", () => {
    const aa = estimateEquity(["As", "Ah"], [], 1, 1500);
    expect(aa).toBeGreaterThan(0.8);
    expect(aa).toBeLessThan(0.9);
    const weak = estimateEquity(["7c", "2d"], [], 1, 1500);
    expect(weak).toBeLessThan(0.4);
    const nuts = estimateEquity(["Ah", "Kh"], ["Qh", "Jh", "Th"], 3, 200);
    expect(nuts).toBe(1);
  });

  it("une main imbattable ne se couche jamais", () => {
    for (let k = 0; k < 30; k++) {
      const t = P.createTable({ sb: 5, bb: 10, maxSeats: 2 });
      P.sit(t, 0, { userId: "bot:1", username: "A", avatar: "", color: "" }, 500);
      P.sit(t, 1, { userId: "bot:2", username: "B", avatar: "", color: "" }, 500);
      P.startHand(t);
      const s = t.hand!.toAct!;
      t.hand!.players[s].hole = ["As", "Ah"];
      const other = s === 0 ? 1 : 0;
      t.hand!.players[other].hole = ["7c", "2d"];
      const d = decide(t, s, BOTS[k % BOTS.length], "difficile");
      expect(d.type).not.toBe("fold");
    }
  });

  it("400 mains entre bots : décisions toujours légales, jetons conservés", () => {
    const t = P.createTable({ sb: 5, bb: 10, maxSeats: 6 });
    for (let i = 0; i < 6; i++) P.sit(t, i, { userId: "bot:" + i, username: BOTS[i].name, avatar: "", color: "" }, 500);
    let total = P.chipsInPlay(t);
    const folds: Record<string, number> = {};
    for (let n = 0; n < 400; n++) {
      for (const s of t.seats)
        if (s && s.stack === 0) {
          s.stack = 500;
          s.sittingOut = false;
          total += 500;
        }
      P.startHand(t);
      let guard = 0;
      while (P.handInProgress(t)) {
        const seat = t.hand!.toAct!;
        const level = (["facile", "normal", "difficile"] as const)[n % 3];
        const d = decide(t, seat, BOTS[seat], level);
        P.act(t, t.seats[seat]!.userId, d.type, d.amount); // lève une erreur si illégal
        if (d.type === "fold") folds[seat] = (folds[seat] ?? 0) + 1;
        if (++guard > 300) throw new Error("boucle");
      }
      expect(P.chipsInPlay(t)).toBe(total);
    }
    // Papy Roger (très serré) se couche plus souvent que Lucky Lou (très large)
    expect(folds[3]).toBeGreaterThan(folds[0]);
  }, 60000);
});
