import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { api } from "../api";
import { useApp, fmt } from "../state";
import { TopBar, Help } from "../components/UI";
import { BetInput } from "../components/BetInput";
import { sound } from "../sound";

const ROWS = 12;
const W = 600;
const GAP = W / (ROWS + 3); // écart horizontal entre deux clous
const TOP = 40;
const ROW_H = 36;
const RISKS = [
  ["faible", "Faible"],
  ["moyen", "Moyen"],
  ["eleve", "Élevé"],
] as const;

interface Ball {
  id: number;
  xs: number[];
  ys: number[];
  slot: number;
  multiplier: number;
  payout: number;
  balance: number;
}

const slotColor = (m: number) => (m >= 10 ? "#c0334a" : m >= 3 ? "#e07b39" : m >= 1.4 ? "#d9b45a" : m >= 1 ? "#8fae5a" : "#3f6b5a");

export function PlinkoPage() {
  const { setBalance, toast, balance } = useApp();
  const [info, setInfo] = useState<any>(null);
  const [bet, setBet] = useState(10);
  const [risk, setRisk] = useState<"faible" | "moyen" | "eleve">("moyen");
  const [balls, setBalls] = useState<Ball[]>([]);
  const [lit, setLit] = useState<number | null>(null);
  const [last, setLast] = useState<{ m: number; p: number }[]>([]);
  const inFlight = useRef(0);
  const nextId = useRef(1);

  useEffect(() => {
    api("/casino/info").then((r) => setInfo(r.plinko));
  }, []);

  const table: number[] = info?.tables?.[risk] ?? [];
  const H = TOP + ROW_H * ROWS + 60;
  // clou j de la rangée r (r = 0..11) : r + 3 clous centrés
  const peg = (r: number, j: number) => ({ x: W / 2 + (j - (r + 2) / 2) * GAP, y: TOP + r * ROW_H });

  const drop = async () => {
    if (inFlight.current >= 5) return; // au plus 5 billes en même temps
    if (bet > balance) return toast("Solde insuffisant", "error");
    inFlight.current++;
    try {
      const r = await api("/plinko/drop", { body: { bet, risk } });
      setBalance(r.balance - r.payout);
      // trajectoire : entre les clous, décalée d'un demi-écart à chaque rebond
      const xs = [W / 2];
      const ys = [TOP - 26];
      let k = 0;
      for (let i = 0; i < ROWS; i++) {
        k += r.path[i];
        xs.push(W / 2 + (k - (i + 1) / 2) * GAP);
        ys.push(TOP + i * ROW_H + ROW_H * 0.55);
      }
      xs.push(xs[xs.length - 1]);
      ys.push(TOP + ROWS * ROW_H + 22);
      const ball: Ball = { id: nextId.current++, xs, ys, slot: r.slot, multiplier: r.multiplier, payout: r.payout, balance: r.balance };
      setBalls((b) => [...b, ball]);
    } catch (e) {
      toast((e as Error).message, "error");
      inFlight.current--;
    }
  };

  const landed = (b: Ball) => {
    inFlight.current--;
    setBalls((all) => all.filter((x) => x.id !== b.id));
    setBalance(b.balance);
    setLit(b.slot);
    setTimeout(() => setLit((s) => (s === b.slot ? null : s)), 500);
    setLast((l) => [{ m: b.multiplier, p: b.payout }, ...l].slice(0, 8));
    if (b.multiplier >= 3) sound.win();
    else sound.tick();
  };

  return (
    <div className="min-h-dvh">
      <TopBar title="Plinko" />
      <main className="mx-auto grid max-w-5xl gap-5 px-3 py-5 lg:grid-cols-[300px_1fr]">
        <aside className="panel order-2 h-fit space-y-4 p-4 lg:order-1">
          <BetInput value={bet} onChange={setBet} />
          <div>
            <p className="mb-1 text-sm text-gold-pale/70">Risque</p>
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Niveau de risque">
              {RISKS.map(([id, name]) => (
                <button key={id} role="radio" aria-checked={risk === id} onClick={() => setRisk(id)} className={`rounded-lg border py-2 text-sm ${risk === id ? "border-gold bg-gold/15 text-gold" : "border-gold/20"}`}>
                  {name}
                </button>
              ))}
            </div>
            <Help>Risque élevé : les bords paient beaucoup plus, mais le centre presque rien.</Help>
          </div>
          <button className="btn-gold w-full py-3 text-lg" onClick={drop} disabled={bet > balance}>
            Lâcher la bille
          </button>
          {info && (
            <p className="text-xs text-gold-pale/55">
              La bille rebondit sur 12 rangées de clous, à gauche ou à droite avec une chance sur deux (tirage du serveur). Taux de retour théorique : {(info.rtp[risk] * 100).toFixed(1)} %.
            </p>
          )}
          {last.length > 0 && (
            <div className="flex flex-wrap gap-1" aria-label="Derniers résultats">
              {last.map((x, i) => (
                <span key={i} className="rounded px-1.5 py-0.5 text-xs font-semibold text-white" style={{ background: slotColor(x.m) }}>
                  ×{x.m}
                </span>
              ))}
            </div>
          )}
        </aside>

        <section className="order-1 lg:order-2">
          <div className="rounded-2xl border border-gold/20 bg-gradient-to-b from-[#0a1f18] to-black p-2">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="Plateau de Plinko">
              {Array.from({ length: ROWS }, (_, r) =>
                Array.from({ length: r + 3 }, (_, j) => {
                  const p = peg(r, j);
                  return <circle key={`${r}-${j}`} cx={p.x} cy={p.y} r={4} fill="#f3e6c4" opacity={0.85} />;
                }),
              )}
              {table.map((m, i) => {
                const x = W / 2 + (i - ROWS / 2) * GAP;
                const y = TOP + ROWS * ROW_H + 8;
                return (
                  <motion.g key={i} animate={{ y: lit === i ? 6 : 0 }} transition={{ duration: 0.15 }}>
                    <rect x={x - GAP / 2 + 2} y={y} width={GAP - 4} height={30} rx={6} fill={slotColor(m)} opacity={lit === i ? 1 : 0.88} />
                    <text x={x} y={y + 19} textAnchor="middle" fontSize={m >= 100 ? 10 : 12} fontWeight="700" fill="#fff" pointerEvents="none">
                      {m}×
                    </text>
                  </motion.g>
                );
              })}
              {balls.map((b) => (
                <motion.circle
                  key={b.id}
                  r={7}
                  fill="#e8c46c"
                  stroke="#fff6d8"
                  strokeWidth={1.5}
                  initial={{ cx: b.xs[0], cy: b.ys[0] }}
                  animate={{ cx: b.xs, cy: b.ys }}
                  transition={{ duration: 2.2, ease: "linear", times: b.xs.map((_, i) => i / (b.xs.length - 1)) }}
                  onAnimationComplete={() => landed(b)}
                  style={{ filter: "drop-shadow(0 0 6px rgba(232,196,108,.8))" }}
                />
              ))}
            </svg>
          </div>
        </section>
      </main>
    </div>
  );
}
