import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api";
import { useApp, fmt } from "../state";
import { TopBar, Help } from "../components/UI";
import { sound } from "../sound";

const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorOf = (n: number) => (n === 0 ? "#16794a" : RED.has(n) ? "#b3283d" : "#151515");
const CHIP_VALUES = [1, 5, 25, 100];
const CHIP_COLORS: Record<number, string> = { 1: "#e9e3d3", 5: "#b3283d", 25: "#16794a", 100: "#151515" };
const MAX_TOTAL = 500;

type BetKey = string; // "plein:17", "rouge", "douzaine:2"…
const label = (k: BetKey) => {
  const [t, v] = k.split(":");
  return { plein: `Plein ${v}`, rouge: "Rouge", noir: "Noir", pair: "Pair", impair: "Impair", manque: "1 à 18", passe: "19 à 36", douzaine: `${v}e douzaine`, colonne: `${v}e colonne` }[t] ?? k;
};

export function RoulettePage() {
  const { setBalance, toast, balance } = useApp();
  const [chip, setChip] = useState(5);
  const [bets, setBets] = useState<Record<BetKey, number>>({});
  const [lastBets, setLastBets] = useState<Record<BetKey, number> | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [history, setHistory] = useState<number[]>([]);

  const total = useMemo(() => Object.values(bets).reduce((a, b) => a + b, 0), [bets]);

  const place = (k: BetKey) => {
    if (spinning) return;
    if (result) setResult(null);
    if (total + chip > MAX_TOTAL) return toast(`Mise totale limitée à ${MAX_TOTAL} VC par tour`, "error");
    if (total + chip > balance) return toast("Solde insuffisant", "error");
    setBets((b) => ({ ...b, [k]: (b[k] ?? 0) + chip }));
    sound.chip();
  };

  const spin = async () => {
    if (!total || spinning) return;
    setSpinning(true);
    setResult(null);
    try {
      const body = Object.entries(bets).map(([k, amount]) => {
        const [type, v] = k.split(":");
        return v === undefined ? { type, amount } : { type, value: Number(v), amount };
      });
      const r = await api("/roulette/spin", { body: { bets: body } });
      setBalance(r.balance - r.payout);
      // la case gagnante s'arrête sous le repère, après plusieurs tours
      const slot = 360 / 37;
      const target = 360 - r.wheelIndex * slot;
      setRotation((cur) => cur - (cur % 360) + 360 * 6 + target);
      setTimeout(() => {
        setResult(r);
        setBalance(r.balance);
        setHistory((h) => [r.number, ...h].slice(0, 14));
        setLastBets(bets);
        setBets({});
        setSpinning(false);
        if (r.payout > 0) sound.win();
        else sound.lose();
      }, 4300);
    } catch (e) {
      toast((e as Error).message, "error");
      setSpinning(false);
    }
  };

  const Spot = ({ k, children, className = "", style }: { k: BetKey; children: React.ReactNode; className?: string; style?: React.CSSProperties }) => {
    const amount = bets[k];
    const won = result?.results?.find((x: any) => (x.value === undefined ? x.type : `${x.type}:${x.value}`) === k && x.won);
    return (
      <button onClick={() => place(k)} disabled={spinning} className={`relative grid place-items-center border border-gold/30 text-sm font-semibold transition-colors hover:bg-white/10 ${won ? "ring-2 ring-gold" : ""} ${className}`} style={style} aria-label={`Miser sur ${label(k)}${amount ? `, ${amount} VC déjà placés` : ""}`}>
        {children}
        {amount ? (
          <span className="absolute right-0.5 top-0.5 grid h-6 min-w-6 place-items-center rounded-full border-2 border-dashed border-white/70 px-1 text-[10px] font-bold text-white shadow" style={{ background: amount >= 100 ? "#151515" : amount >= 25 ? "#16794a" : amount >= 5 ? "#b3283d" : "#8a8270" }}>
            {amount}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <div className="min-h-dvh">
      <TopBar title="Roulette" />
      <main className="mx-auto max-w-5xl space-y-5 px-3 py-5">
        <div className="grid items-center gap-5 md:grid-cols-[minmax(0,340px)_1fr]">
          {/* cylindre */}
          <div className="relative mx-auto aspect-square w-full max-w-[320px]">
            <div className="absolute left-1/2 top-[-6px] z-10 h-0 w-0 -translate-x-1/2 border-x-[10px] border-t-[18px] border-x-transparent border-t-gold drop-shadow" aria-hidden />
            <motion.svg viewBox="-110 -110 220 220" className="h-full w-full drop-shadow-[0_20px_40px_rgba(0,0,0,.6)]" animate={{ rotate: rotation }} transition={{ duration: 4.2, ease: [0.15, 0.6, 0.2, 1] }} aria-label="Cylindre de roulette">
              <circle r="108" fill="#3a2412" />
              <circle r="100" fill="#1a0f06" stroke="#d9b45a" strokeWidth="1.5" />
              {WHEEL.map((n, i) => {
                const a0 = ((i * 360) / 37 - 90 - 180 / 37) * (Math.PI / 180);
                const a1 = (((i + 1) * 360) / 37 - 90 - 180 / 37) * (Math.PI / 180);
                const R = 98;
                const r = 66;
                const d = `M ${r * Math.cos(a0)} ${r * Math.sin(a0)} L ${R * Math.cos(a0)} ${R * Math.sin(a0)} A ${R} ${R} 0 0 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} L ${r * Math.cos(a1)} ${r * Math.sin(a1)} A ${r} ${r} 0 0 0 ${r * Math.cos(a0)} ${r * Math.sin(a0)} Z`;
                const am = (a0 + a1) / 2;
                return (
                  <g key={n}>
                    <path d={d} fill={colorOf(n)} stroke="#d9b45a" strokeWidth="0.4" />
                    <text x={86 * Math.cos(am)} y={86 * Math.sin(am)} fill="#fff" fontSize="7.5" fontWeight="600" textAnchor="middle" dominantBaseline="central" transform={`rotate(${(am * 180) / Math.PI + 90} ${86 * Math.cos(am)} ${86 * Math.sin(am)})`}>
                      {n}
                    </text>
                  </g>
                );
              })}
              <circle r="64" fill="url(#cone)" stroke="#d9b45a" strokeWidth="1" />
              <defs>
                <radialGradient id="cone">
                  <stop offset="0" stopColor="#e8c46c" />
                  <stop offset="0.35" stopColor="#7a5a1e" />
                  <stop offset="1" stopColor="#2a1a08" />
                </radialGradient>
              </defs>
              {[0, 45, 90, 135].map((r) => (
                <rect key={r} x="-3" y="-46" width="6" height="92" rx="3" fill="#d9b45a" transform={`rotate(${r})`} />
              ))}
              <circle r="10" fill="#f3e6c4" />
            </motion.svg>
            {/* bille : posée sous le repère une fois arrêtée */}
            {!spinning && result && <span className="absolute left-1/2 top-[7%] h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,.9)]" aria-hidden />}
          </div>

          <div className="space-y-3">
            <AnimatePresence mode="wait">
              {result ? (
                <motion.div key={result.number + "-" + history.length} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-4">
                  <span className="grid h-20 w-20 place-items-center rounded-full border-4 border-gold text-4xl font-bold text-white" style={{ background: colorOf(result.number) }}>
                    {result.number}
                  </span>
                  <div>
                    <p className="font-marquee text-2xl text-gold">{result.payout > 0 ? `Gagné : ${fmt(result.payout)} VC` : "Perdu cette fois"}</p>
                    <p className="text-sm text-gold-pale/70">
                      {result.number === 0 ? "Zéro" : `${result.color === "rouge" ? "Rouge" : "Noir"}, ${result.number % 2 ? "impair" : "pair"}, ${result.number <= 18 ? "manque" : "passe"}`} · misé {fmt(result.total)}
                    </p>
                  </div>
                </motion.div>
              ) : (
                <motion.p key="idle" className="text-gold-pale/75">
                  {spinning ? "Rien ne va plus…" : "Choisissez un jeton puis cliquez sur le tapis pour placer vos mises."}
                </motion.p>
              )}
            </AnimatePresence>
            {history.length > 0 && (
              <div className="flex flex-wrap gap-1" aria-label="Derniers numéros sortis">
                {history.map((n, i) => (
                  <span key={i} className={`grid h-7 w-7 place-items-center rounded-full text-xs font-semibold text-white ${i === 0 ? "ring-2 ring-gold" : "opacity-80"}`} style={{ background: colorOf(n) }}>
                    {n}
                  </span>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {CHIP_VALUES.map((v) => (
                <button key={v} onClick={() => setChip(v)} aria-pressed={chip === v} className={`grid h-12 w-12 place-items-center rounded-full border-4 border-dashed text-sm font-bold ${chip === v ? "scale-110 border-gold" : "border-white/50"}`} style={{ background: CHIP_COLORS[v], color: v === 1 ? "#222" : "#fff" }} aria-label={`Jeton de ${v} VC`}>
                  {v}
                </button>
              ))}
              <span className="ml-2 text-sm text-gold-pale/70">
                Total misé : <b className="text-gold-pale">{fmt(total)}</b> / {MAX_TOTAL}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-gold px-8 py-3 text-lg" onClick={spin} disabled={spinning || !total}>
                Lancer la bille
              </button>
              <button className="btn-ghost" onClick={() => setBets({})} disabled={spinning || !total}>
                Effacer
              </button>
              <button
                className="btn-ghost"
                disabled={spinning || !lastBets}
                onClick={() => {
                  const t = Object.values(lastBets!).reduce((a, b) => a + b, 0);
                  if (t > balance) return toast("Solde insuffisant", "error");
                  setBets(lastBets!);
                  setResult(null);
                }}
              >
                Remiser
              </button>
            </div>
          </div>
        </div>

        {/* tapis de mise */}
        <div className="felt relative overflow-x-auto rounded-2xl border-4 border-[#3a2412] p-3 scroll-thin" style={{ ["--felt" as string]: "#0e5c46", ["--felt-hi" as string]: "#1c8064", ["--felt-lo" as string]: "#053425" }}>
          <div className="relative z-10 grid min-w-[640px] grid-cols-[48px_repeat(12,1fr)_56px] text-gold-pale">
            <Spot k="plein:0" className="row-span-3 rounded-l-lg bg-felt-light/40" style={{ gridRow: "1 / span 3" }}>
              0
            </Spot>
            {[3, 2, 1].map((row) =>
              Array.from({ length: 12 }, (_, c) => {
                const n = c * 3 + row;
                return (
                  <Spot key={n} k={`plein:${n}`} className="h-12">
                    <span className="grid h-8 w-8 place-items-center rounded-full text-white" style={{ background: colorOf(n) }}>
                      {n}
                    </span>
                  </Spot>
                );
              }).concat(
                <Spot key={"col" + row} k={`colonne:${row}`} className="h-12 text-xs">
                  2 pour 1
                </Spot>,
              ),
            )}
            <div />
            {[1, 2, 3].map((d) => (
              <Spot key={d} k={`douzaine:${d}`} className="col-span-4 h-11 text-xs" style={{ gridColumn: `span 4` }}>
                {d === 1 ? "1 à 12" : d === 2 ? "13 à 24" : "25 à 36"}
              </Spot>
            ))}
            <div />
            <div />
            {[
              ["manque", "1 à 18"],
              ["pair", "Pair"],
              ["rouge", "◆ Rouge"],
              ["noir", "◆ Noir"],
              ["impair", "Impair"],
              ["passe", "19 à 36"],
            ].map(([k, t]) => (
              <Spot key={k} k={k} className={`col-span-2 h-11 text-xs ${k === "rouge" ? "text-[#ff6b80]" : ""}`} style={{ gridColumn: "span 2" }}>
                {t}
              </Spot>
            ))}
          </div>
        </div>

        <div className="panel grid gap-3 p-4 text-sm sm:grid-cols-2">
          <div>
            <h2 className="mb-1 font-semibold text-gold-pale">Paiements</h2>
            <ul className="space-y-0.5 text-gold-pale/75">
              <li>Plein (un numéro) : 35 pour 1</li>
              <li>Douzaine ou colonne : 2 pour 1</li>
              <li>Rouge/Noir, Pair/Impair, 1-18/19-36 : 1 pour 1</li>
            </ul>
          </div>
          <div>
            <h2 className="mb-1 font-semibold text-gold-pale">Roulette européenne</h2>
            <p className="text-gold-pale/75">37 cases, un seul zéro. Le zéro fait perdre les chances simples. Taux de retour théorique : 97,3 %. Numéro tiré par le serveur.</p>
            <Help>Astuce : miser sur plusieurs cases ne change pas le taux de retour, seulement la façon dont vous gagnez.</Help>
          </div>
        </div>
      </main>
    </div>
  );
}
