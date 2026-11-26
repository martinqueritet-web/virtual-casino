import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { api } from "../api";
import { useApp, go, fmt } from "../state";
import { TopBar } from "../components/UI";
import { sound } from "../sound";
import { BetInput } from "../components/BetInput";

interface Info {
  machines: { id: string; name: string; tagline: string; symbols: { id: string; icon: string; name: string }[]; palette: { from: string; to: string; accent: string } }[];
  pay3: number[];
  pay2: number[];
  bets: number[];
  probabilities: number[];
  rtp: number;
}

const CELL = 84; // hauteur d'une case en px
const FILL = 18; // symboles défilants avant l'arrêt

export function SlotsPage({ machineId }: { machineId?: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  useEffect(() => {
    api("/slots/machines").then(setInfo);
  }, []);
  if (!info) return <div className="grid min-h-dvh place-items-center text-gold/70">Allumage des machines…</div>;
  const m = info.machines.find((x) => x.id === machineId);
  if (!m)
    return (
      <div className="min-h-dvh">
        <TopBar title="Machines à sous" />
        <main className="mx-auto grid max-w-5xl gap-4 px-4 py-8 sm:grid-cols-2 lg:grid-cols-3">
          {info.machines.map((x) => (
            <button key={x.id} onClick={() => go("slots/" + x.id)} className="rounded-xl border p-5 text-left" style={{ background: `linear-gradient(160deg, ${x.palette.from}, ${x.palette.to})`, borderColor: x.palette.accent + "55" }}>
              <div className="mb-3 text-4xl">{x.symbols.slice(0, 3).map((s) => s.icon).join(" ")}</div>
              <div className="text-lg font-semibold" style={{ color: x.palette.accent }}>
                {x.name}
              </div>
              <div className="text-sm text-gold-pale/60">{x.tagline}</div>
            </button>
          ))}
        </main>
      </div>
    );
  return <Machine info={info} m={m} />;
}

function Machine({ info, m }: { info: Info; m: Info["machines"][number] }) {
  const { balance, setBalance, toast, prefs } = useApp();
  const fx = !(prefs.lowPower || prefs.reducedFx);
  const [bet, setBet] = useState(2);
  const [spinning, setSpinning] = useState(false);
  const [reels, setReels] = useState<number[][]>(() => [0, 1, 2].map(() => [5, 3, 4]));
  const [columns, setColumns] = useState<number[][] | null>(null);
  const [spinId, setSpinId] = useState(0);
  const [result, setResult] = useState<{ win: number; kind: string | null; line: number[] } | null>(null);
  const tickTimer = useRef<number | undefined>(undefined);
  // ---- mode automatique
  type Auto = { total: number; left: number; net: number; lossLimit: number | null; stopWinX: number | null; fast: boolean };
  const [auto, setAuto] = useState<Auto | null>(null);
  const [setup, setSetup] = useState(false);
  const [autoCfg, setAutoCfg] = useState({ total: 25, loss: true, lossX: 20, stopWin: true, stopWinX: 20, fast: false });
  const lastWinX = useRef(0);
  const speed = auto?.fast ? 0.5 : 1;

  const autoRef = useRef<Auto | null>(null);
  autoRef.current = auto;
  const stopAuto = (reason: string) => {
    const a = autoRef.current;
    if (!a) return;
    autoRef.current = null;
    setAuto(null);
    const n = a.total - a.left;
    toast(`Mode automatique arrêté : ${reason}. ${n} tour${n > 1 ? "s" : ""} joué${n > 1 ? "s" : ""}, bilan ${a.net > 0 ? "+" : ""}${fmt(a.net)} VC.`, a.net > 0 ? "win" : "info");
  };

  const spin = async () => {
    if (spinning) return;
    setSpinning(true);
    setResult(null);
    try {
      const r = await api("/slots/spin", { body: { machine: m.id, bet } });
      const cols = r.grid.map((g: number[], i: number) => [
        ...reels[i],
        ...Array.from({ length: FILL + i * 5 }, () => Math.floor(Math.random() * m.symbols.length)),
        ...g,
      ]);
      setColumns(cols);
      setSpinId((x) => x + 1);
      setBalance(r.balance - r.win); // la mise part tout de suite, le gain arrive à l'arrêt
      if (fx) tickTimer.current = window.setInterval(() => sound.tick(), 70);
      const duration = fx ? 1700 * speed : 50;
      setTimeout(() => {
        clearInterval(tickTimer.current);
        setReels(r.grid);
        setColumns(null);
        setResult(r);
        setBalance(r.balance);
        setSpinning(false);
        if (r.win > 0) sound.win();
        lastWinX.current = r.win / bet;
        setAuto((a) => (a ? { ...a, left: a.left - 1, net: a.net + r.win - bet } : a));
      }, duration);
    } catch (e) {
      toast((e as Error).message, "error");
      setSpinning(false);
      setAuto(null);
    }
  };

  // enchaîne les tours automatiques et vérifie les limites entre chaque tour
  useEffect(() => {
    if (!auto || spinning) return;
    if (auto.left <= 0) return stopAuto("série terminée");
    if (auto.lossLimit !== null && -auto.net >= auto.lossLimit) return stopAuto("limite de perte atteinte");
    if (auto.stopWinX !== null && lastWinX.current >= auto.stopWinX) return stopAuto("gros gain");
    if (balance < bet) return stopAuto("solde insuffisant");
    const t = setTimeout(spin, auto.fast ? 250 : 600);
    return () => clearTimeout(t);
  }); // eslint-disable-line

  // jamais de tours automatiques en arrière-plan
  useEffect(() => {
    const onVis = () => document.hidden && stopAuto("page masquée");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []); // eslint-disable-line

  const startAuto = () => {
    lastWinX.current = 0;
    setSetup(false);
    setAuto({
      total: autoCfg.total,
      left: autoCfg.total,
      net: 0,
      lossLimit: autoCfg.loss ? autoCfg.lossX * bet : null,
      stopWinX: autoCfg.stopWin ? autoCfg.stopWinX : null,
      fast: autoCfg.fast,
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && (e.target as HTMLElement).tagName !== "BUTTON" && (e.target as HTMLElement).tagName !== "INPUT") {
        e.preventDefault();
        if (auto) stopAuto("arrêt demandé");
        else spin();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const sym = (i: number) => m.symbols[i];

  return (
    <div className="min-h-dvh" style={{ background: `radial-gradient(900px 600px at 50% 0%, ${m.palette.from}, #020504 75%)` }}>
      <TopBar title={m.name} back="slots" />
      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col items-center gap-5">
          <div className="rounded-[28px] border-4 p-4 shadow-[0_30px_80px_rgba(0,0,0,.7)] sm:p-6" style={{ borderColor: m.palette.accent, background: `linear-gradient(180deg, ${m.palette.to}, #000)` }}>
            <p className="mb-3 text-center font-marquee text-2xl" style={{ color: m.palette.accent }}>
              {m.name}
            </p>
            <div className="relative flex gap-2 rounded-xl bg-black p-2 sm:gap-3">
              {[0, 1, 2].map((ri) => (
                <div key={ri} className="relative overflow-hidden rounded-lg bg-gradient-to-b from-[#e9e2cf] via-white to-[#e9e2cf]" style={{ width: CELL, height: CELL * 3 }}>
                  {columns ? (
                    <motion.div
                      key={spinId}
                      initial={{ y: 0 }}
                      animate={{ y: -(columns[ri].length - 3) * CELL }}
                      transition={{ duration: (1.0 + ri * 0.3) * speed, ease: [0.2, 0.6, 0.3, 1] }}
                    >
                      {columns[ri].map((s, k) => (
                        <Cell key={k} icon={sym(s).icon} />
                      ))}
                    </motion.div>
                  ) : (
                    reels[ri].map((s, k) => <Cell key={k} icon={sym(s).icon} win={!!result?.kind && k === 1 && (result.kind === "3" || ri < 2)} />)
                  )}
                </div>
              ))}
              {/* ligne de gain */}
              <div className="pointer-events-none absolute inset-x-1 top-1/2 h-[2px] -translate-y-1/2" style={{ background: m.palette.accent, boxShadow: `0 0 10px ${m.palette.accent}` }} />
            </div>
            <div className="mt-4 h-8 text-center text-lg" aria-live="polite">
              {result && (result.win > 0 ? <span style={{ color: m.palette.accent }}>Gain : {fmt(result.win)} VC</span> : <span className="text-gold-pale/50">Pas de combinaison cette fois</span>)}
            </div>
          </div>

          <div className="w-full max-w-sm">
            <BetInput value={bet} onChange={setBet} disabled={spinning || !!auto} />
          </div>
          {auto ? (
            <div className="w-full max-w-sm rounded-xl border-2 p-3 text-center" style={{ borderColor: m.palette.accent }}>
              <p className="text-sm text-gold-pale">
                Mode automatique : tour <b>{auto.total - auto.left + (spinning ? 1 : 0)}</b> sur {auto.total} · bilan{" "}
                <b className={auto.net > 0 ? "text-emerald-300" : auto.net < 0 ? "text-[#ff9aa9]" : ""}>
                  {auto.net > 0 ? "+" : ""}
                  {fmt(auto.net)} VC
                </b>
              </p>
              <div className="mx-auto mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full transition-all" style={{ width: `${((auto.total - auto.left) / auto.total) * 100}%`, background: m.palette.accent }} />
              </div>
              <p className="mt-1 text-[11px] text-gold-pale/55">
                {auto.lossLimit !== null ? `Arrêt si la perte atteint ${fmt(auto.lossLimit)} VC` : "Sans limite de perte"}
                {auto.stopWinX !== null ? ` · arrêt sur un gain ×${auto.stopWinX} ou plus` : ""}
              </p>
              <button className="btn-ruby mt-2 w-full py-3 text-lg" onClick={() => stopAuto("arrêt demandé")}>
                Arrêter
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button className="btn-gold w-48 py-4 text-xl" onClick={spin} disabled={spinning || balance < bet}>
                {spinning ? "…" : "Lancer"}
              </button>
              <button className={`btn-ghost px-5 py-4 ${setup ? "border-gold bg-gold/10" : ""}`} onClick={() => setSetup(!setup)} disabled={spinning} aria-expanded={setup}>
                Auto
              </button>
            </div>
          )}
          {setup && !auto && (
            <div className="panel w-full max-w-sm space-y-3 p-4">
              <div>
                <p className="mb-1.5 text-sm text-gold-pale/80">Nombre de tours</p>
                <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label="Nombre de tours automatiques">
                  {[10, 25, 50, 100].map((n) => (
                    <button key={n} role="radio" aria-checked={autoCfg.total === n} onClick={() => setAutoCfg((c) => ({ ...c, total: n }))} className={`rounded-lg border py-2 text-sm ${autoCfg.total === n ? "border-gold bg-gold/15 text-gold" : "border-gold/20"}`}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>
                  Arrêter si je perds plus de <b className="text-gold-pale">{fmt(autoCfg.lossX * bet)} VC</b>
                </span>
                <input type="checkbox" className="h-5 w-5 accent-[#d9b45a]" checked={autoCfg.loss} onChange={(e) => setAutoCfg((c) => ({ ...c, loss: e.target.checked }))} />
              </label>
              {autoCfg.loss && <input type="range" min={5} max={100} step={5} value={autoCfg.lossX} onChange={(e) => setAutoCfg((c) => ({ ...c, lossX: Number(e.target.value) }))} className="w-full" aria-label="Limite de perte en nombre de mises" />}
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Arrêter après un gain de ×{autoCfg.stopWinX} ou plus</span>
                <input type="checkbox" className="h-5 w-5 accent-[#d9b45a]" checked={autoCfg.stopWin} onChange={(e) => setAutoCfg((c) => ({ ...c, stopWin: e.target.checked }))} />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Tours rapides</span>
                <input type="checkbox" className="h-5 w-5 accent-[#d9b45a]" checked={autoCfg.fast} onChange={(e) => setAutoCfg((c) => ({ ...c, fast: e.target.checked }))} />
              </label>
              <button className="btn-gold w-full py-3" onClick={startAuto} disabled={balance < bet}>
                Démarrer {autoCfg.total} tours à {fmt(bet)} VC
              </button>
              <p className="text-[11px] text-gold-pale/50">Le mode automatique s'arrête aussi si votre solde ne suffit plus ou si vous quittez la page. Barre d'espace ou « Arrêter » pour l'interrompre à tout moment.</p>
            </div>
          )}
          <p className="text-xs text-gold-pale/50">Barre d'espace pour lancer un tour.</p>
        </div>

        <aside className="panel h-fit p-4">
          <h2 className="mb-1 font-semibold text-gold-pale">Table des gains</h2>
          <p className="mb-3 text-xs text-gold-pale/55">Gains en multiple de la mise, sur la ligne centrale.</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gold-pale/50">
                <th className="py-1 font-normal">Symbole</th>
                <th className="py-1 font-normal">×3</th>
                <th className="py-1 font-normal">×2 à gauche</th>
              </tr>
            </thead>
            <tbody>
              {m.symbols.map((s, i) => (
                <tr key={s.id} className="border-t border-gold/10">
                  <td className="py-1.5">
                    <span className="mr-2 text-xl">{s.icon}</span>
                    <span className="text-gold-pale/75">{s.name}</span>
                  </td>
                  <td className="tabular-nums text-gold">×{info.pay3[i]}</td>
                  <td className="tabular-nums">×{info.pay2[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-sm text-gold-pale/75">
            Taux de retour théorique : <b className="text-gold">{(info.rtp * 100).toFixed(1)} %</b>. Sur un très grand nombre de tours, la machine rend en moyenne {(info.rtp * 100).toFixed(1)} VC pour 100 VC misés. Chaque tour est indépendant des précédents.
          </p>
          <p className="mt-2 text-xs text-gold-pale/50">Résultats tirés par le serveur avec un générateur aléatoire cryptographique.</p>
        </aside>
      </main>
    </div>
  );
}

function Cell({ icon, win = false }: { icon: string; win?: boolean }) {
  return (
    <div className="grid place-items-center" style={{ height: CELL, fontSize: CELL * 0.52 }}>
      <span className={win ? "drop-shadow-[0_0_10px_rgba(217,180,90,1)]" : ""} style={win ? { transform: "scale(1.12)" } : undefined}>
        {icon}
      </span>
    </div>
  );
}
