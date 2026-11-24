import { motion } from "framer-motion";
import { useEffect, useState } from "react";

/** Vrai sur petit écran (téléphone). */
export function useNarrow(max = 640) {
  const q = `(max-width: ${max}px)`;
  const [n, setN] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setN(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [q]);
  return n;
}
import { useApp } from "../state";

const SUITS: Record<string, { s: string; name: string; red: boolean; cb: string }> = {
  s: { s: "♠", name: "pique", red: false, cb: "#111" },
  h: { s: "♥", name: "cœur", red: true, cb: "#c0334a" },
  d: { s: "♦", name: "carreau", red: true, cb: "#1d5fd1" },
  c: { s: "♣", name: "trèfle", red: false, cb: "#16794a" },
};
const RANK_LABEL: Record<string, string> = { T: "10", J: "V", Q: "D", K: "R", A: "A" };
const RANK_NAME: Record<string, string> = { T: "10", J: "Valet", Q: "Dame", K: "Roi", A: "As" };

export const cardName = (c: string) => `${RANK_NAME[c[0]] ?? c[0]} de ${SUITS[c[1]].name}`;

const BACKS: Record<string, [string, string]> = {
  emerald: ["#0e5c46", "#073829"],
  ruby: ["#8e1d31", "#4a0d18"],
  midnight: ["#1b2a55", "#0a1129"],
  gold: ["#9a7a2c", "#4d3c12"],
};

const SIZES = {
  sm: "w-9 h-[3.15rem] text-[0.8rem] rounded-[5px]",
  md: "w-12 h-[4.2rem] text-base rounded-md",
  lg: "w-16 h-[5.6rem] text-xl rounded-lg",
  xl: "w-[4.6rem] h-[6.45rem] text-2xl rounded-lg",
};

export function PlayingCard({
  card,
  size = "md",
  delay = 0,
  highlight = false,
  dim = false,
  back,
}: {
  card: string | null;
  size?: keyof typeof SIZES;
  delay?: number;
  highlight?: boolean;
  dim?: boolean;
  back?: string;
}) {
  const { prefs } = useApp();
  const fx = !(prefs.lowPower || prefs.reducedFx);
  const base = `${SIZES[size]} relative select-none shrink-0 shadow-[0_3px_8px_rgba(0,0,0,.45)]`;
  if (!card) {
    const [a, b] = BACKS[back ?? prefs.cardBack] ?? BACKS.emerald;
    return (
      <motion.div
        aria-label="Carte face cachée"
        className={`${base} border border-gold/50`}
        initial={fx ? { y: -40, opacity: 0, rotate: -8 } : false}
        animate={{ y: 0, opacity: 1, rotate: 0 }}
        transition={{ delay, duration: 0.35 }}
        style={{
          background: `repeating-linear-gradient(45deg, ${a} 0 4px, ${b} 4px 8px)`,
        }}
      >
        <div className="absolute inset-[3px] rounded-[inherit] border border-gold/40 grid place-items-center">
          <span className="text-gold/70 font-marquee" style={{ fontSize: "0.9em" }}>
            VC
          </span>
        </div>
      </motion.div>
    );
  }
  const suit = SUITS[card[1]];
  const color = prefs.colorblind ? suit.cb : suit.red ? "#c0334a" : "#111";
  const rank = RANK_LABEL[card[0]] ?? card[0];
  return (
    <motion.div
      role="img"
      aria-label={cardName(card)}
      className={`${base} bg-[#fbf8ef] ${highlight ? "ring-2 ring-gold ring-offset-1 ring-offset-transparent -translate-y-1" : ""} ${dim ? "opacity-45 saturate-50" : ""}`}
      initial={fx ? { rotateY: 90, y: -30, opacity: 0 } : false}
      animate={{ rotateY: 0, y: highlight ? -4 : 0, opacity: 1 }}
      transition={{ delay, duration: 0.4, ease: "easeOut" }}
      style={{ color }}
    >
      <div className="absolute left-[8%] top-[4%] leading-none font-semibold text-center" style={{ fontSize: "0.85em" }}>
        <div>{rank}</div>
        <div style={{ fontSize: "0.9em" }}>{suit.s}</div>
      </div>
      <div className="absolute inset-0 grid place-items-center" style={{ fontSize: "1.55em" }}>
        {suit.s}
      </div>
      <div className="absolute right-[8%] bottom-[4%] leading-none font-semibold text-center rotate-180" style={{ fontSize: "0.85em" }}>
        <div>{rank}</div>
        <div style={{ fontSize: "0.9em" }}>{suit.s}</div>
      </div>
    </motion.div>
  );
}

const CHIP_COLORS = [
  { v: 500, c: "#6b2a8c" },
  { v: 100, c: "#151515" },
  { v: 25, c: "#16794a" },
  { v: 5, c: "#b3283d" },
  { v: 1, c: "#e9e3d3" },
];

/** Pile de jetons représentant un montant (purement visuel). */
export function ChipStack({ amount, label = true }: { amount: number; label?: boolean }) {
  if (amount <= 0) return null;
  const chips: string[] = [];
  let left = amount;
  for (const { v, c } of CHIP_COLORS) {
    while (left >= v && chips.length < 8) {
      chips.push(c);
      left -= v;
    }
  }
  return (
    <motion.div className="flex items-center gap-1" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} aria-label={`${amount} VC misés`}>
      <div className="relative w-5" style={{ height: 6 + chips.length * 3 }}>
        {chips.map((c, i) => (
          <span
            key={i}
            className="absolute left-0 w-5 h-[7px] rounded-[50%] border border-black/40"
            style={{ bottom: i * 3, background: c, boxShadow: "inset 0 0 0 1.5px rgba(255,255,255,.55)" }}
          />
        ))}
      </div>
      {label && <span className="text-xs font-semibold text-gold-pale tabular-nums">{amount}</span>}
    </motion.div>
  );
}
