import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api";
import { useApp, fmt } from "../state";
import { TopBar, Help } from "../components/UI";
import { PlayingCard, ChipStack, useNarrow } from "../components/Cards";
import { sound } from "../sound";
import { handValue } from "../../../server/games/blackjack";

const ACTIONS = [
  { id: "hit", label: "Tirer", hint: "Une carte de plus (T)", key: "t", cls: "btn-felt" },
  { id: "stand", label: "Rester", hint: "Garder ce total (R)", key: "r", cls: "btn-gold" },
  { id: "double", label: "Doubler", hint: "Mise ×2, une seule carte (D)", key: "d", cls: "btn-ghost" },
  { id: "split", label: "Séparer", hint: "Jouer la paire en 2 mains (S)", key: "s", cls: "btn-ghost" },
  { id: "surrender", label: "Abandonner", hint: "Récupérer la moitié (A)", key: "a", cls: "btn-ghost" },
] as const;
const ACTION_FR: Record<string, string> = { hit: "Tirer", stand: "Rester", double: "Doubler", split: "Séparer", surrender: "Abandonner", insurance: "Prendre l'assurance", "no-insurance": "Refuser l'assurance" };
const RESULT_FR: Record<string, string> = { blackjack: "Blackjack !", win: "Gagné", push: "Égalité", lose: "Perdu", bust: "Dépassé", surrender: "Abandon" };
const CHIPS = [
  { v: 1, c: "#e9e3d3", t: "#222" },
  { v: 5, c: "#b3283d", t: "#fff" },
  { v: 25, c: "#16794a", t: "#fff" },
  { v: 100, c: "#151515", t: "#fff" },
  { v: 500, c: "#6b2a8c", t: "#fff" },
];
const MAX_BET = 500;

export function BlackjackPage() {
  const { setBalance, toast, balance } = useApp();
  const narrow = useNarrow();
  const [game, setGame] = useState<any>(null);
  const [practice, setPractice] = useState(false);
  const [bet, setBet] = useState(0);
  const [lastBet, setLastBet] = useState(10);
  const [busy, setBusy] = useState(false);
  // révélation progressive du croupier : nombre de cartes visibles face ouverte
  const [revealed, setRevealed] = useState(1);
  const pendingBalance = useRef<number | null>(null);
  const dealtAt = useRef(0); // pour l'ordre de distribution

  const size = narrow ? "md" : "lg";

  useEffect(() => {
    api("/blackjack").then((r) => {
      setGame(r.game);
      setBalance(r.balance);
      if (r.game) {
        setPractice(r.game.practice);
        setRevealed(r.game.stage === "done" ? r.game.dealer.length : 1);
      }
    });
  }, [setBalance]);

  // le croupier retourne sa carte cachée puis tire, une carte à la fois
  const done = game?.stage === "done";
  const dealerLen = game?.dealer?.length ?? 0;
  useEffect(() => {
    if (!done || revealed >= dealerLen) return;
    const t = setTimeout(() => {
      setRevealed((n) => n + 1);
      sound.card();
    }, revealed === 1 ? 650 : 750);
    return () => clearTimeout(t);
  }, [done, revealed, dealerLen]);
  const settled = done && revealed >= dealerLen;
  useEffect(() => {
    if (!settled || pendingBalance.current === null) return;
    setBalance(pendingBalance.current);
    pendingBalance.current = null;
    const net = game.totalPayout - game.totalBet;
    if (net > 0) sound.win();
    else if (net < 0) sound.lose();
  }, [settled]); // eslint-disable-line

  const apply = (r: any, fresh = false) => {
    if (fresh) {
      dealtAt.current = Date.now();
      setRevealed(1);
      if (r.game.shoe.reshuffled) toast("Nouveau sabot : le croupier mélange 6 jeux de cartes");
    }
    setGame(r.game);
    if (r.game.stage === "done") {
      // le gain n'est crédité à l'écran qu'une fois les cartes du croupier dévoilées
      pendingBalance.current = r.balance;
      setBalance(r.game.practice ? r.balance : r.balance - r.game.totalPayout);
    } else setBalance(r.balance);
    sound.card();
  };

  const start = async () => {
    if (!bet) return;
    setBusy(true);
    try {
      apply(await api("/blackjack/start", { body: { bet, practice } }), true);
      setLastBet(bet);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const act = async (action: string) => {
    if (busy) return;
    setBusy(true);
    try {
      apply(await api("/blackjack/action", { body: { action } }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const insurance = async (take: boolean) => {
    setBusy(true);
    try {
      apply(await api("/blackjack/insurance", { body: { take } }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const playing = game?.stage === "player";
  const canAfford = (n: number) => practice || n <= balance;
  const addChip = (v: number) => {
    const next = Math.min(MAX_BET, bet + v);
    if (!canAfford(next)) return toast("Solde insuffisant pour cette mise", "error");
    setBet(next);
    sound.chip();
  };

  // raccourcis clavier
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      const a = ACTIONS.find((x) => x.key === e.key.toLowerCase());
      if (a && game.legal[a.id]) act(a.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line

  // si l'on arrive avec une manche terminée, la mise affichée reprend la dernière
  useEffect(() => {
    if (!game || game.stage === "done") setBet((b) => b || Math.min(lastBet, practice ? MAX_BET : balance));
  }, [game?.stage]); // eslint-disable-line

  const lastFb = game?.feedback?.[game.feedback.length - 1];
  const initialDeal = Date.now() - dealtAt.current < 1500;
  // ordre réel : joueur, croupier, joueur, croupier
  const dealDelay = (who: "p" | "d", i: number) => (initialDeal && i < 2 ? (who === "p" ? i * 0.5 : 0.25 + i * 0.5) : 0.05);
  const dealerCards: (string | null)[] = game ? game.dealer.map((c: string | null, i: number) => (i < revealed ? c : i === 1 ? null : undefined)).filter((c: any) => c !== undefined) : [];
  const visibleTotal = handValue(dealerCards.filter((c): c is string => !!c)).total;
  const round = dealtAt.current;

  return (
    <div className="min-h-dvh">
      <TopBar title="Blackjack" />
      <main className="mx-auto max-w-5xl px-2 pb-16 pt-3 sm:px-4">
        <div className="mb-3 flex items-center justify-center">
          <div className="grid grid-cols-2 rounded-lg bg-black/40 p-1" role="tablist">
            {[false, true].map((pr) => (
              <button key={String(pr)} role="tab" aria-selected={practice === pr} disabled={!!game && game.stage !== "done"} onClick={() => (setPractice(pr), setBet(Math.min(lastBet, pr ? MAX_BET : balance)))} className={`rounded-md px-4 py-2 text-sm ${practice === pr ? "bg-felt text-gold-pale" : "text-gold-pale/60"}`}>
                {pr ? "Entraînement gratuit" : "Partie avec mes VC"}
              </button>
            ))}
          </div>
        </div>

        {/* ------------------------------------------------ la table */}
        <div className="relative">
          {/* rebord */}
          <div className="rounded-b-[50%_42%] rounded-t-2xl bg-gradient-to-b from-[#3a2412] to-[#1a0f06] p-2.5 shadow-[0_30px_80px_rgba(0,0,0,.65)] sm:p-3.5">
            <div
              className="felt relative min-h-[520px] overflow-hidden rounded-b-[50%_42%] rounded-t-xl border-2 border-gold/25 sm:min-h-[560px]"
              style={{ ["--felt" as string]: "#0e5c46", ["--felt-hi" as string]: "#1c8064", ["--felt-lo" as string]: "#053425" }}
            >
              <FeltPrint narrow={narrow} />

              {/* défausse */}
              <div className="absolute left-3 top-3 z-10 flex flex-col items-center gap-1 sm:left-6 sm:top-5" title="Défausse">
                <div className="relative h-14 w-11 rounded-md border border-gold/25 bg-black/35">
                  <div className="absolute inset-x-1 bottom-1 rounded-sm bg-[repeating-linear-gradient(0deg,#f3ecd9_0_1px,#c9c1ad_1px_2px)]" style={{ height: `${Math.min(100, ((game?.shoe?.discards ?? 0) / 234) * 100)}%`, maxHeight: "calc(100% - 8px)" }} />
                </div>
                <span className="text-[10px] text-gold-pale/50">Défausse</span>
              </div>

              {/* sabot */}
              <div className="absolute right-3 top-3 z-10 flex flex-col items-center gap-1 sm:right-6 sm:top-5" title="Sabot de 6 jeux">
                <div className="relative h-14 w-16 -skew-x-6 rounded-md border border-black/60 bg-gradient-to-b from-[#2b2b2b] to-[#0c0c0c] shadow-lg">
                  <div className="absolute -left-2 top-2 h-10 w-7 rounded-sm border border-gold/50" style={{ background: "repeating-linear-gradient(45deg,#0e5c46 0 3px,#073829 3px 6px)" }} />
                </div>
                <span className="text-[10px] text-gold-pale/60 tabular-nums">{game ? `${game.shoe.remaining} cartes` : "6 jeux"}</span>
                {game && (
                  <div className="h-1 w-16 overflow-hidden rounded-full bg-white/10" aria-label="Cartes restantes avant la carte de coupe">
                    <div className="h-full bg-gold/70" style={{ width: `${Math.max(0, ((game.shoe.remaining - game.shoe.cut) / (game.shoe.size - game.shoe.cut)) * 100)}%` }} />
                  </div>
                )}
              </div>

              {/* croupier */}
              <div className="relative z-10 flex flex-col items-center gap-2 pt-5">
                <div className="flex items-center gap-2 text-sm text-gold-pale/80">
                  <span className="grid h-9 w-9 place-items-center rounded-full border border-gold/50 bg-black/50 text-lg">🤵</span>
                  Croupier
                  {game && <span className="rounded bg-black/50 px-2 tabular-nums">{settled && game.dealerBlackjack ? "Blackjack" : visibleTotal > 21 ? `${visibleTotal} — dépassé` : visibleTotal}</span>}
                </div>
                <div className="flex min-h-[4.2rem] -space-x-3 sm:min-h-[5.6rem] sm:-space-x-4">
                  {dealerCards.map((c, i) => (
                    <motion.div key={`${round}-${i}`} initial={{ x: 260, y: -60, rotate: 20, opacity: 0 }} animate={{ x: 0, y: 0, rotate: 0, opacity: 1 }} transition={{ delay: dealDelay("d", i), duration: 0.45, ease: "easeOut" }}>
                      <PlayingCard key={c ?? "cachée"} card={c} size={size} />
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* assurance proposée */}
              <AnimatePresence>
                {game?.stage === "insurance" && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="relative z-20 mx-auto mt-4 w-[min(92%,26rem)] rounded-xl border border-gold/60 bg-black/80 p-4 text-center">
                    <p className="text-gold-pale">Le croupier montre un As. Voulez-vous une assurance ?</p>
                    <p className="mt-1 text-xs text-gold-pale/60">Elle coûte {game.insuranceCost} VC et paie 2 pour 1 si le croupier a blackjack.</p>
                    <div className="mt-3 flex justify-center gap-2">
                      <button className="btn-ghost" disabled={busy || (!game.practice && balance < game.insuranceCost) || game.insuranceCost === 0} onClick={() => insurance(true)}>
                        Prendre l'assurance
                      </button>
                      <button className="btn-gold" disabled={busy} onClick={() => insurance(false)}>
                        Non merci
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* mains du joueur */}
              <div className="absolute inset-x-0 bottom-6 z-10 flex flex-col items-center gap-3 sm:bottom-10">
                <div className="flex flex-wrap items-end justify-center gap-5 px-2">
                  {game?.hands.map((h: any, i: number) => {
                    const active = playing && game.active === i && game.hands.length > 1;
                    const res = settled && h.result;
                    return (
                      <div key={i} className={`flex flex-col items-center gap-1.5 rounded-xl p-1.5 ${active ? "bg-gold/10 ring-1 ring-gold/70" : ""}`}>
                        <AnimatePresence>
                          {res && (
                            <motion.span initial={{ opacity: 0, y: 6, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} className={`rounded-full px-3 py-0.5 text-sm font-semibold ${["win", "blackjack"].includes(h.result) ? "bg-gold text-velvet" : h.result === "push" ? "bg-white/80 text-velvet" : "bg-ruby/90 text-white"}`}>
                              {RESULT_FR[h.result]} {h.payout - h.bet > 0 ? `+${h.payout - h.bet}` : h.payout - h.bet < 0 ? h.payout - h.bet : ""}
                            </motion.span>
                          )}
                        </AnimatePresence>
                        <div className="flex -space-x-7 sm:-space-x-9">
                          {h.cards.map((c: string, k: number) => (
                            <motion.div
                              key={`${round}-${i}-${k}-${c}`}
                              initial={{ x: 300, y: -280, rotate: 25, opacity: 0 }}
                              animate={{ x: 0, y: -k * 4, rotate: h.doubled && k === 2 ? 90 : 0, opacity: 1 }}
                              transition={{ delay: dealDelay("p", k), duration: 0.5, ease: "easeOut" }}
                            >
                              <PlayingCard card={c} size={size} dim={settled && ["lose", "bust", "surrender"].includes(h.result)} />
                            </motion.div>
                          ))}
                        </div>
                        <span className="rounded bg-black/55 px-2 text-sm tabular-nums text-gold-pale">
                          {h.value.total > 21 ? `${h.value.total} — dépassé` : h.value.soft && h.value.total < 21 ? `${h.value.total - 10} ou ${h.value.total}` : h.value.total}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* cercle de mise + ligne d'assurance */}
                <div className="flex items-center gap-4">
                  {game?.insurance > 0 && (
                    <div className="flex flex-col items-center" title="Assurance">
                      <ChipStack amount={game.insurance} />
                      <span className="text-[10px] text-gold-pale/60">Assurance</span>
                    </div>
                  )}
                  <div className="grid h-20 w-20 place-items-center rounded-full border-2 border-gold/50 bg-black/15 shadow-[inset_0_0_14px_rgba(0,0,0,.4)]" aria-label={`Mise : ${!game || game.stage === "done" ? bet : game.totalBet} VC`}>
                    {(() => {
                      const amount = !game || settled ? bet : game.hands.reduce((a: number, h: any) => a + h.bet, 0);
                      return amount > 0 ? <ChipStack amount={amount} /> : <span className="text-center text-[10px] leading-tight text-gold-pale/50">Posez votre mise</span>;
                    })()}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------ commandes */}
        <div className="panel mt-4 p-4">
          {playing ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {ACTIONS.map((a) => {
                  const extra = (a.id === "double" || a.id === "split") && !game.practice && balance < game.nextCost;
                  return (
                    <button key={a.id} className={`${a.cls} flex-col gap-0 py-2`} disabled={busy || !game.legal[a.id] || extra} onClick={() => act(a.id)} title={a.hint}>
                      <span>{a.label}</span>
                      <span className="text-[10px] font-normal opacity-70">{a.hint}</span>
                    </button>
                  );
                })}
              </div>
              <Help>Abandonner n'est possible qu'avec vos 2 premières cartes : vous récupérez la moitié de votre mise.</Help>
              {game.practice && game.hint && (
                <p className="mt-3 rounded-lg border border-gold/30 bg-gold/5 px-3 py-2 text-sm">
                  <b className="text-gold">Conseil : {ACTION_FR[game.hint.action]}.</b> {game.hint.explanation}
                </p>
              )}
            </>
          ) : game?.stage === "insurance" ? (
            <p className="text-center text-sm text-gold-pale/70">
              Répondez à la proposition d'assurance sur la table.{game.practice && game.hint ? ` Conseil : ${game.hint.explanation}` : ""}
            </p>
          ) : !settled && game ? (
            <p className="text-center text-gold-pale/70">Le croupier joue…</p>
          ) : (
            <div className="flex flex-col items-center gap-3">
              {game?.message && <p className="text-center font-marquee text-2xl text-gold">{game.message}</p>}
              {settled && !game.practice && (
                <p className="text-sm text-gold-pale/70">
                  Misé {fmt(game.totalBet)} · Récupéré {fmt(game.totalPayout)}
                </p>
              )}
              <div className="flex flex-wrap justify-center gap-2" aria-label="Ajouter des jetons à la mise">
                {CHIPS.map((c) => (
                  <button
                    key={c.v}
                    onClick={() => addChip(c.v)}
                    disabled={bet >= MAX_BET}
                    className="grid h-14 w-14 place-items-center rounded-full text-sm font-bold shadow-[0_4px_10px_rgba(0,0,0,.5)] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 disabled:opacity-40"
                    style={{ background: c.c, color: c.t, border: "4px dashed rgba(255,255,255,.55)", boxShadow: `inset 0 0 0 3px ${c.c}, 0 4px 10px rgba(0,0,0,.5)` }}
                    aria-label={`Ajouter ${c.v} VC`}
                  >
                    {c.v}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <button className="btn-ghost px-3 py-2 text-sm" onClick={() => setBet(0)} disabled={!bet}>
                  Effacer
                </button>
                <button className="btn-ghost px-3 py-2 text-sm" onClick={() => canAfford(lastBet) && setBet(lastBet)} disabled={!canAfford(lastBet)}>
                  Remiser {lastBet}
                </button>
                <button className="btn-ghost px-3 py-2 text-sm" onClick={() => canAfford(Math.min(MAX_BET, bet * 2)) && setBet(Math.min(MAX_BET, bet * 2))} disabled={!bet || !canAfford(Math.min(MAX_BET, bet * 2))}>
                  Doubler la mise
                </button>
              </div>
              <button className="btn-gold px-10 py-3 text-lg" onClick={start} disabled={busy || !bet || !canAfford(bet)}>
                Distribuer · {bet} VC{practice ? " d'entraînement" : ""}
              </button>
              <p className="text-xs text-gold-pale/50">Mise de 1 à {MAX_BET} VC</p>
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

/** Inscriptions imprimées sur le tapis, comme sur une vraie table (entre le croupier et le joueur). */
function FeltPrint({ narrow }: { narrow: boolean }) {
  const g = narrow
    ? { w: 400, a1: "M 30 150 Q 200 240 370 150", a2: "M 40 178 Q 200 258 360 178", l1: "M 15 222 Q 200 316 385 222", l2: "M 10 250 Q 200 350 390 250", fs: [21, 10.5, 10], dy: 17 }
    : { w: 1000, a1: "M 140 145 Q 500 275 860 145", a2: "M 180 175 Q 500 293 820 175", l1: "M 110 203 Q 500 311 890 203", l2: "M 95 230 Q 500 334 905 230", fs: [32, 15, 13], dy: 18 };
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${g.w} 600`} preserveAspectRatio="xMidYMin slice" aria-hidden>
      <defs>
        <path id="bj-arc1" d={g.a1} />
        <path id="bj-arc2" d={g.a2} />
        <path id="bj-arc3" d={g.l1} />
      </defs>
      <text fill="#e8c46c" fillOpacity="0.55" fontFamily="Limelight, serif" fontSize={g.fs[0]} letterSpacing="2">
        <textPath href="#bj-arc1" startOffset="50%" textAnchor="middle">
          BLACKJACK PAYE 3 POUR 2
        </textPath>
      </text>
      <text fill="#f3e6c4" fillOpacity="0.35" fontFamily="Outfit, sans-serif" fontSize={g.fs[1]} letterSpacing="1">
        <textPath href="#bj-arc2" startOffset="50%" textAnchor="middle">
          Le croupier tire jusqu'à 16 et reste à 17
        </textPath>
      </text>
      <path d={g.l1} fill="none" stroke="#e8c46c" strokeOpacity="0.35" strokeWidth="1.5" />
      <path d={g.l2} fill="none" stroke="#e8c46c" strokeOpacity="0.35" strokeWidth="1.5" />
      <text fill="#e8c46c" fillOpacity="0.45" fontFamily="Outfit, sans-serif" fontSize={g.fs[2]} letterSpacing="3">
        <textPath href="#bj-arc3" startOffset="50%" textAnchor="middle">
          <tspan dy={g.dy}>ASSURANCE PAYE 2 POUR 1</tspan>
        </textPath>
      </text>
    </svg>
  );
}
