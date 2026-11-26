import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { api } from "../api";
import { useApp, fmt } from "../state";
import { TopBar, Help } from "../components/UI";
import { ChipStack } from "../components/Cards";
import { AmountField, MAX_BET } from "../components/BetInput";
import { sound } from "../sound";

const LOOK: Record<string, { label: string; color: string; text: string }> = {
  "1": { label: "1", color: "#e9c46a", text: "#1a1205" },
  "2": { label: "2", color: "#2a9d8f", text: "#fff" },
  "5": { label: "5", color: "#457b9d", text: "#fff" },
  "10": { label: "10", color: "#9b59d0", text: "#fff" },
  "20": { label: "20", color: "#e07b39", text: "#fff" },
  joker: { label: "🃏", color: "#c0334a", text: "#fff" },
  casino: { label: "🎰", color: "#151515", text: "#d9b45a" },
};
const ORDER = ["1", "2", "5", "10", "20", "joker", "casino"];

export function WheelPage() {
  const { balance, setBalance, toast } = useApp();
  const [info, setInfo] = useState<any>(null);
  const [chip, setChip] = useState(10);
  const [bets, setBets] = useState<Record<string, number>>({});
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [res, setRes] = useState<any>(null);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    api("/tables/info").then((r) => setInfo(r.wheel));
  }, []);
  const segs: string[] = info?.segments ?? [];
  const total = useMemo(() => Object.values(bets).reduce((a, b) => a + b, 0), [bets]);

  const place = (s: string) => {
    if (spinning) return;
    if (res) setRes(null);
    if (total + chip > balance) return toast("Solde insuffisant", "error");
    setBets((b) => ({ ...b, [s]: (b[s] ?? 0) + chip }));
    sound.chip();
  };

  const spin = async () => {
    if (!total || spinning) return;
    setSpinning(true);
    setRes(null);
    try {
      const r = await api("/wheel/play", { body: { bets: Object.entries(bets).map(([symbol, amount]) => ({ symbol, amount })) } });
      setBalance(r.balance - r.payout);
      const slot = 360 / segs.length;
      const target = 360 - r.index * slot;
      setRotation((cur) => cur - (cur % 360) + 360 * 5 + target);
      // clic de la languette pendant la rotation
      const ticks = setInterval(() => sound.tick(), 120);
      setTimeout(() => clearInterval(ticks), 3800);
      setTimeout(() => {
        setRes(r);
        setBalance(r.balance);
        setHistory((h) => [r.symbol, ...h].slice(0, 16));
        setBets({});
        setSpinning(false);
        if (r.payout > 0) sound.win();
        else sound.lose();
      }, 5200);
    } catch (e) {
      toast((e as Error).message, "error");
      setSpinning(false);
    }
  };

  return (
    <div className="min-h-dvh">
      <TopBar title="Roue de la fortune" />
      <main className="mx-auto max-w-5xl space-y-5 px-3 py-5">
        <div className="grid items-center gap-6 md:grid-cols-[minmax(0,380px)_1fr]">
          <div className="relative mx-auto aspect-square w-full max-w-[360px]">
            <div className="absolute left-1/2 top-[-8px] z-10 h-0 w-0 -translate-x-1/2 border-x-[12px] border-t-[22px] border-x-transparent border-t-gold drop-shadow-lg" aria-hidden />
            {segs.length > 0 && (
              <motion.svg viewBox="-110 -110 220 220" className="h-full w-full drop-shadow-[0_20px_40px_rgba(0,0,0,.6)]" animate={{ rotate: rotation }} transition={{ duration: 5, ease: [0.12, 0.6, 0.15, 1] }} aria-label="Roue de la fortune">
                <circle r="109" fill="#3a2412" />
                {segs.map((s, i) => {
                  const n = segs.length;
                  const a0 = ((i - 0.5) / n) * 2 * Math.PI - Math.PI / 2;
                  const a1 = ((i + 0.5) / n) * 2 * Math.PI - Math.PI / 2;
                  const R = 102;
                  const am = (a0 + a1) / 2;
                  return (
                    <g key={i}>
                      <path d={`M0 0 L${R * Math.cos(a0)} ${R * Math.sin(a0)} A${R} ${R} 0 0 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} Z`} fill={LOOK[s].color} stroke="#d9b45a" strokeWidth="0.5" />
                      <text x={86 * Math.cos(am)} y={86 * Math.sin(am)} fill={LOOK[s].text} fontSize={s.length > 2 ? 9 : 8} fontWeight="700" textAnchor="middle" dominantBaseline="central" transform={`rotate(${(am * 180) / Math.PI + 90} ${86 * Math.cos(am)} ${86 * Math.sin(am)})`}>
                        {LOOK[s].label}
                      </text>
                    </g>
                  );
                })}
                {Array.from({ length: segs.length }, (_, i) => {
                  const a = ((i + 0.5) / segs.length) * 2 * Math.PI - Math.PI / 2;
                  return <circle key={i} cx={104 * Math.cos(a)} cy={104 * Math.sin(a)} r={1.6} fill="#f3e6c4" />;
                })}
                <circle r="34" fill="url(#hub)" stroke="#d9b45a" strokeWidth="1.5" />
                <defs>
                  <radialGradient id="hub">
                    <stop offset="0" stopColor="#f3e6c4" />
                    <stop offset="1" stopColor="#7a5a1e" />
                  </radialGradient>
                </defs>
                <text y="4" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1a1205" fontFamily="Limelight, serif">
                  FORTUNE
                </text>
              </motion.svg>
            )}
          </div>

          <div className="space-y-3">
            {res ? (
              <div className="flex items-center gap-4">
                <span className="grid h-20 w-20 place-items-center rounded-2xl border-4 border-gold text-3xl font-bold" style={{ background: LOOK[res.symbol].color, color: LOOK[res.symbol].text }}>
                  {LOOK[res.symbol].label}
                </span>
                <p className="font-marquee text-2xl text-gold">{res.payout ? `Gagné : ${fmt(res.payout)} VC` : "Perdu cette fois"}</p>
              </div>
            ) : (
              <p className="text-gold-pale/75">{spinning ? "La roue tourne…" : "Misez sur une ou plusieurs cases, puis lancez la roue. La case qui s'arrête sous le repère gagne."}</p>
            )}
            {history.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {history.map((s, i) => (
                  <span key={i} className={`grid h-7 min-w-7 place-items-center rounded px-1 text-xs font-bold ${i === 0 ? "ring-2 ring-gold" : "opacity-80"}`} style={{ background: LOOK[s].color, color: LOOK[s].text }}>
                    {LOOK[s].label}
                  </span>
                ))}
              </div>
            )}
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {ORDER.map((s) => (
                <button key={s} onClick={() => place(s)} disabled={spinning} className={`relative flex min-h-[92px] flex-col items-center justify-center rounded-xl border-2 border-gold/30 p-1.5 ${res?.symbol === s ? "ring-2 ring-gold" : ""}`} style={{ background: `${LOOK[s].color}33` }} aria-label={`Miser sur ${LOOK[s].label}, payé ${info?.pays?.[s]} pour 1`}>
                  <span className="grid h-8 w-8 place-items-center rounded-md text-sm font-bold" style={{ background: LOOK[s].color, color: LOOK[s].text }}>
                    {LOOK[s].label}
                  </span>
                  <span className="mt-1 text-[11px] text-gold-pale/75">{info?.pays?.[s]} pour 1</span>
                  {bets[s] ? <ChipStack amount={bets[s]} /> : null}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex w-40 items-center gap-1.5">
                <span className="text-xs text-gold-pale/60">Jeton</span>
                <AmountField value={chip} onChange={setChip} max={Math.max(1, Math.min(MAX_BET, balance))} label="Valeur du jeton" />
              </div>
              <span className="text-sm text-gold-pale/70">
                Total : <b className="text-gold-pale">{fmt(total)}</b>
              </span>
              <button className="btn-ghost ml-auto" onClick={() => setBets({})} disabled={spinning || !total}>
                Effacer
              </button>
              <button className="btn-gold px-8" onClick={spin} disabled={spinning || !total}>
                Lancer la roue
              </button>
            </div>
            {info && (
              <Help>
                54 cases : vingt-quatre « 1 », quinze « 2 », sept « 5 », quatre « 10 », deux « 20 », un joker et un logo casino (40 pour 1). Taux de retour : de {Math.round(Math.min(...Object.values(info.rtp as Record<string, number>)) * 100)} à {Math.round(Math.max(...Object.values(info.rtp as Record<string, number>)) * 100)} % selon la case, la case « 1 » étant la plus favorable.
              </Help>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
