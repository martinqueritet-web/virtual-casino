import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "../api";
import { useApp, fmt } from "../state";
import { TopBar } from "../components/UI";
import { PlayingCard, useNarrow } from "../components/Cards";
import { BetInput } from "../components/BetInput";
import { sound } from "../sound";

const PAYTABLE = [
  ["Quinte flush royale", 800],
  ["Quinte flush", 50],
  ["Carré", 25],
  ["Full", 9],
  ["Couleur", 6],
  ["Quinte", 4],
  ["Brelan", 3],
  ["Double paire", 2],
  ["Paire de Valets ou mieux", 1],
] as const;

export function VideoPokerPage() {
  const { setBalance, toast, prefs } = useApp();
  const narrow = useNarrow();
  const [game, setGame] = useState<any>(null);
  const [bet, setBet] = useState(10);
  const [held, setHeld] = useState([false, false, false, false, false]);
  const [busy, setBusy] = useState(false);
  const [deal, setDeal] = useState(0);
  const [showAdvice, setShowAdvice] = useState(prefs.showHelp);

  useEffect(() => {
    api("/videopoker").then((r) => {
      setGame(r.game);
      setBalance(r.balance);
      if (r.game?.stage === "hold") setBet(r.game.bet);
    });
  }, [setBalance]);

  const start = async () => {
    setBusy(true);
    try {
      const r = await api("/videopoker/deal", { body: { bet } });
      setGame(r.game);
      setBalance(r.balance);
      setHeld([false, false, false, false, false]);
      setDeal((d) => d + 1);
      sound.card();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const draw = async () => {
    setBusy(true);
    try {
      const r = await api("/videopoker/draw", { body: { held } });
      setGame(r.game);
      setBalance(r.balance);
      setDeal((d) => d + 1);
      if (r.game.payout > 0) sound.win();
      else sound.lose();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const holding = game?.stage === "hold";
  const toggle = (i: number) => {
    if (!holding) return;
    setHeld((h) => h.map((x, k) => (k === i ? !x : x)));
    sound.click();
  };
  const activeRow = game ? (holding ? game.current : game.result) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (holding && /^[1-5]$/.test(e.key)) toggle(Number(e.key) - 1);
      if (e.key === "Enter" || e.code === "Space") {
        e.preventDefault();
        if (holding) draw();
        else if (!busy) start();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="min-h-dvh">
      <TopBar title="Vidéo poker" />
      <main className="mx-auto max-w-4xl space-y-4 px-3 py-5">
        <div className="rounded-[28px] border-4 border-[#1d4fa0] bg-gradient-to-b from-[#0a1a3d] to-[#02060f] p-3 shadow-[0_30px_80px_rgba(0,0,0,.6)] sm:p-5">
          {/* table des gains */}
          <div className="mb-4 grid grid-cols-[1fr_auto] gap-x-4 rounded-xl border border-[#e8c46c]/40 bg-black/60 px-3 py-2 text-xs sm:text-sm">
            {PAYTABLE.map(([name, pays]) => (
              <div key={name} className={`contents ${activeRow === name ? "text-[#fff36b]" : "text-[#e8c46c]/80"}`}>
                <span className={`py-0.5 font-semibold uppercase tracking-wide ${activeRow === name ? "animate-pulse" : ""}`}>{name}</span>
                <span className="py-0.5 text-right tabular-nums">{fmt(pays * bet)}</span>
              </div>
            ))}
          </div>

          <div className="flex justify-center gap-1.5 sm:gap-3">
            {(game?.hand ?? [null, null, null, null, null]).map((c: string | null, i: number) => {
              const adv = holding && showAdvice && game.advice?.hold[i];
              return (
                <button key={i} onClick={() => toggle(i)} disabled={!holding} className="flex flex-col items-center gap-1.5" aria-pressed={held[i]} aria-label={`Carte ${i + 1}${held[i] ? ", gardée" : ""}`}>
                  <span className={`h-5 rounded px-2 text-[11px] font-bold tracking-wider ${held[i] ? "bg-[#fff36b] text-black" : "text-transparent"}`}>GARDÉE</span>
                  <motion.div key={`${deal}-${i}-${c}`} initial={{ rotateY: 90 }} animate={{ rotateY: 0, y: held[i] ? -6 : 0 }} transition={{ delay: i * 0.08, duration: 0.3 }} className={`rounded-lg ${adv ? "ring-2 ring-emerald-300 ring-offset-2 ring-offset-[#0a1a3d]" : ""}`}>
                    <PlayingCard card={c} size={narrow ? "md" : "xl"} />
                  </motion.div>
                </button>
              );
            })}
          </div>

          <div className="mt-4 min-h-[3.5rem] text-center">
            {holding ? (
              <>
                <p className="text-sm text-[#e8c46c]">{game.current ? `Vous avez déjà : ${game.current}` : "Touchez les cartes à garder, puis tirez."}</p>
                {showAdvice && game.advice && <p className="mt-1 text-xs text-emerald-200/90">Conseil (cartes entourées en vert) : {game.advice.reason}</p>}
              </>
            ) : game ? (
              <p className={`font-marquee text-2xl ${game.payout ? "text-[#fff36b]" : "text-gold-pale/60"}`}>{game.payout ? `${game.result} : +${fmt(game.payout)} VC` : "Pas de combinaison payante"}</p>
            ) : (
              <p className="text-sm text-gold-pale/70">Jacks or Better : la plus petite main payante est une paire de Valets.</p>
            )}
          </div>
        </div>

        <div className="panel grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <BetInput value={bet} onChange={setBet} disabled={holding} />
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-gold-pale/70">
              <input type="checkbox" className="h-4 w-4 accent-[#d9b45a]" checked={showAdvice} onChange={(e) => setShowAdvice(e.target.checked)} />
              Afficher le conseil
            </label>
            {holding ? (
              <button className="btn-gold px-10 py-3 text-lg" onClick={draw} disabled={busy}>
                Tirer
              </button>
            ) : (
              <button className="btn-gold px-10 py-3 text-lg" onClick={start} disabled={busy}>
                Distribuer · {fmt(bet)} VC
              </button>
            )}
          </div>
        </div>
        <p className="text-center text-xs text-gold-pale/50">Raccourcis : 1 à 5 pour garder une carte, Entrée pour distribuer ou tirer. Table 9/6 : taux de retour de 99,5 % avec la stratégie optimale.</p>
      </main>
    </div>
  );
}
