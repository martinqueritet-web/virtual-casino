import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api";
import { useApp, fmt } from "../state";
import { TopBar, Help } from "../components/UI";
import { PlayingCard } from "../components/Cards";
import { sound } from "../sound";

const ACTION_FR: Record<string, string> = { hit: "Tirer", stand: "Rester", double: "Doubler", split: "Séparer" };
const RESULT_FR: Record<string, string> = { blackjack: "Blackjack !", win: "Gagné", push: "Égalité", lose: "Perdu", bust: "Dépassé" };
const CHIPS = [5, 10, 25, 50, 100];

export function BlackjackPage() {
  const { setBalance, toast, balance } = useApp();
  const [game, setGame] = useState<any>(null);
  const [practice, setPractice] = useState(false);
  const [bet, setBet] = useState(10);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/blackjack").then((r) => {
      setGame(r.game);
      setBalance(r.balance);
      if (r.game) setPractice(r.game.practice);
    });
  }, [setBalance]);

  const apply = (r: any) => {
    setGame(r.game);
    setBalance(r.balance);
    sound.card();
    if (r.game.stage === "done") {
      const net = r.game.totalPayout - r.game.totalBet;
      if (net > 0) sound.win();
      else if (net < 0) sound.lose();
    }
  };
  const start = async () => {
    setBusy(true);
    try {
      apply(await api("/blackjack/start", { body: { bet, practice } }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const act = async (action: string) => {
    setBusy(true);
    try {
      apply(await api("/blackjack/action", { body: { action } }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const playing = game?.stage === "player";
  const lastFb = game?.feedback?.[game.feedback.length - 1];

  return (
    <div className="min-h-dvh">
      <TopBar title="Blackjack" />
      <main className="mx-auto max-w-4xl px-3 pb-16 pt-4">
        <div className="mb-4 flex items-center justify-center">
          <div className="grid grid-cols-2 rounded-lg bg-black/40 p-1" role="tablist">
            {[false, true].map((pr) => (
              <button key={String(pr)} role="tab" aria-selected={practice === pr} disabled={playing} onClick={() => setPractice(pr)} className={`rounded-md px-4 py-2 text-sm ${practice === pr ? "bg-felt text-gold-pale" : "text-gold-pale/60"}`}>
                {pr ? "Entraînement gratuit" : "Partie avec mes VC"}
              </button>
            ))}
          </div>
        </div>

        <div className="felt relative overflow-hidden rounded-t-[50%_30%] rounded-b-3xl border-4 border-[#3a2412] px-4 pb-6 pt-8 shadow-[0_30px_80px_rgba(0,0,0,.6)]" style={{ ["--felt" as string]: "#0e5c46", ["--felt-hi" as string]: "#1c8064", ["--felt-lo" as string]: "#053425" }}>
          <div className="relative z-10 flex min-h-[420px] flex-col items-center justify-between gap-6">
            {/* croupier */}
            <div className="flex flex-col items-center gap-2">
              <div className="flex items-center gap-2 text-sm text-gold-pale/80">
                <span className="grid h-8 w-8 place-items-center rounded-full border border-gold/50 bg-black/50">🤵</span> Croupier {game && <span className="rounded bg-black/40 px-2 tabular-nums">{game.dealerValue}</span>}
              </div>
              <div className="flex gap-1.5">
                {game?.dealer.map((c: string | null, i: number) => (
                  <PlayingCard key={i + String(c)} card={c} size="lg" delay={i * 0.15} />
                ))}
              </div>
            </div>
            <p className="font-marquee text-center text-lg text-gold/50">Le croupier reste sur 17 · Blackjack payé 3 pour 2</p>

            {/* mains du joueur */}
            <div className="flex flex-wrap justify-center gap-6">
              {game?.hands.map((h: any, i: number) => (
                <div key={i} className={`flex flex-col items-center gap-2 rounded-xl p-2 ${playing && game.active === i && game.hands.length > 1 ? "bg-gold/10 ring-1 ring-gold/60" : ""}`}>
                  <div className="flex -space-x-6">
                    {h.cards.map((c: string, k: number) => (
                      <PlayingCard key={k + c} card={c} size="lg" delay={k * 0.12} />
                    ))}
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="rounded bg-black/50 px-2 tabular-nums">{h.value.soft && h.value.total < 21 ? `${h.value.total - 10} / ${h.value.total}` : h.value.total}</span>
                    <span className="text-gold-pale/70">Mise {h.bet}</span>
                    {h.result && <span className={`font-semibold ${["win", "blackjack"].includes(h.result) ? "text-gold" : h.result === "push" ? "text-gold-pale" : "text-[#ff9aa9]"}`}>{RESULT_FR[h.result]}</span>}
                  </div>
                </div>
              ))}
              {!game && <p className="text-gold-pale/70">Choisissez votre mise et distribuez.</p>}
            </div>
          </div>
        </div>

        <div className="panel mt-4 p-4">
          {playing ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(["hit", "stand", "double", "split"] as const).map((a) => (
                  <button key={a} className={a === "stand" ? "btn-gold" : a === "hit" ? "btn-felt" : "btn-ghost"} disabled={busy || !game.legal[a] || ((a === "double" || a === "split") && !game.practice && balance < game.nextCost)} onClick={() => act(a)}>
                    {ACTION_FR[a]}
                  </button>
                ))}
              </div>
              <Help>Tirer : une carte de plus. Rester : garder votre total. Doubler : mise ×2 et une seule carte. Séparer : une paire devient deux mains.</Help>
              {game.practice && game.hint && (
                <p className="mt-3 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2 text-sm">
                  <b className="text-gold">Conseil : {ACTION_FR[game.hint.action]}.</b> {game.hint.explanation}
                </p>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-3">
              {game?.message && <p className="font-marquee text-2xl text-gold">{game.message}</p>}
              {game?.stage === "done" && !game.practice && (
                <p className="text-sm text-gold-pale/70">
                  Misé {fmt(game.totalBet)} · Récupéré {fmt(game.totalPayout)}
                </p>
              )}
              <div className="flex flex-wrap justify-center gap-2" role="radiogroup" aria-label="Mise">
                {CHIPS.map((c) => (
                  <button key={c} role="radio" aria-checked={bet === c} onClick={() => (setBet(c), sound.chip())} className={`grid h-14 w-14 place-items-center rounded-full border-4 border-dashed text-sm font-bold ${bet === c ? "scale-110 border-gold bg-ruby text-white" : "border-white/40 bg-black/50"}`}>
                    {c}
                  </button>
                ))}
              </div>
              <button className="btn-gold px-8" onClick={start} disabled={busy || (!practice && balance < bet)}>
                Distribuer ({bet} {practice ? "VC d'entraînement" : "VC"})
              </button>
            </div>
          )}
        </div>

        {game?.practice && game.feedback.length > 0 && (
          <div className="panel mt-4 p-4">
            <h2 className="mb-2 font-semibold text-gold-pale">Vos décisions</h2>
            <AnimatePresence>
              {lastFb && (
                <motion.p key={game.feedback.length} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`mb-2 text-sm ${lastFb.correct ? "text-emerald-300" : "text-[#ff9aa9]"}`}>
                  {lastFb.correct ? `✓ « ${ACTION_FR[lastFb.action]} » était le bon choix.` : `✗ Vous avez choisi « ${ACTION_FR[lastFb.action]} », la stratégie de base conseille « ${ACTION_FR[lastFb.recommended]} ».`} {lastFb.explanation}
                </motion.p>
              )}
            </AnimatePresence>
            <p className="text-xs text-gold-pale/55">
              {game.feedback.filter((f: any) => f.correct).length} bonne(s) décision(s) sur {game.feedback.length} dans cette manche.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
