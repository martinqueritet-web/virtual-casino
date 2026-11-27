import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useApp, fmt } from "../state";
import { PlayingCard, ChipStack, useNarrow } from "../components/Cards";
import { Avatar, Modal, Help } from "../components/UI";
import { TABLE_THEMES } from "../components/Settings";
import { HandRankings } from "./Rules";
import { sound } from "../sound";
import type { RoomData } from "./useRoom";

const STAGE: Record<string, string> = { preflop: "Préflop", flop: "Flop", turn: "Turn", river: "River", showdown: "Abattage", done: "Main terminée" };

export function PokerTable({ data, run, isHost, solo = false }: { data: Pick<RoomData, "poker" | "online" | "clockOffset">; run: (a: string, b?: object) => Promise<void>; isHost: boolean; solo?: boolean }) {
  const { user, prefs, balance } = useApp();
  const p = data.poker;
  const h = p.hand;
  const me = p.me;
  const mySeat: number | null = me ? me.seat : null;
  const n = p.seats.length;
  const theme = TABLE_THEMES[prefs.tableTheme] ?? TABLE_THEMES.classic;
  const [buyInSeat, setBuyInSeat] = useState<number | null>(null);
  const [rankings, setRankings] = useState(false);
  const [rebuy, setRebuy] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const narrow = useNarrow();
  const showCombo = prefs.showHelp || h?.stage === "done";

  const live = h && h.stage !== "done";
  const myTurn = !!me?.legal;
  const winners = useMemo(() => new Set<number>((h?.result?.pots ?? []).flatMap((x: any) => x.winners)), [h?.result]);

  // sons : mon tour, nouvelles cartes, résultat
  const prev = useRef({ myTurn: false, board: 0, done: false, hand: 0 });
  useEffect(() => {
    const pr = prev.current;
    if (myTurn && !pr.myTurn) sound.turn();
    if ((h?.board?.length ?? 0) > pr.board) sound.card();
    const done = h?.stage === "done";
    if (done && !pr.done && pr.hand === h?.number && mySeat !== null) {
      if (winners.has(mySeat)) sound.win();
    }
    prev.current = { myTurn, board: h?.board?.length ?? 0, done, hand: h?.number ?? 0 };
  }, [myTurn, h?.board?.length, h?.stage, h?.number, mySeat, winners]);

  // main suivante automatique, 5 s après la fin de la précédente
  const seated = mySeat !== null && !p.seats[mySeat]?.sittingOut;
  const eligible = p.seats.filter((s: any) => s && s.stack > 0 && !s.sittingOut && !s.leaveAfterHand).length;
  useEffect(() => {
    if (!seated || !h || h.stage !== "done" || !h.endedAt || eligible < 2) return;
    const wait = Math.max(0, h.endedAt + 5000 - (Date.now() + data.clockOffset));
    const t = setTimeout(() => run("start").catch(() => {}), wait + Math.random() * 300);
    return () => clearTimeout(t);
  }, [seated, h?.stage, h?.endedAt, h?.number, eligible, data.clockOffset]); // eslint-disable-line

  // le siège du joueur est toujours affiché en bas
  const ref = mySeat ?? 0;
  const pos = (i: number, rx = narrow ? 34 : 44, ry = 40) => {
    const a = ((90 + ((i - ref + n) % n) * (360 / n)) * Math.PI) / 180;
    return { left: `${50 + rx * Math.cos(a)}%`, top: `${50 + ry * Math.sin(a)}%` };
  };

  const toActSeat = h?.toAct ?? null;
  const toActPlayer = toActSeat !== null ? p.seats[toActSeat] : null;
  const toActOffline = toActPlayer && !data.online.includes(toActPlayer.userId);

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative mx-auto w-full max-w-[980px] aspect-[3/4] sm:aspect-[16/10]"
        style={{ ["--felt" as string]: theme.felt, ["--felt-hi" as string]: theme.hi, ["--felt-lo" as string]: theme.lo }}
      >
        {/* rebord + tapis */}
        <div className="absolute inset-[6%] rounded-[50%] p-[2.2%] shadow-[0_30px_80px_rgba(0,0,0,.7)]" style={{ background: `linear-gradient(180deg, ${theme.rail}, #120a04)` }}>
          <div className="felt relative h-full w-full rounded-[50%] border-2 border-gold/30 shadow-[inset_0_0_60px_rgba(0,0,0,.55)]">
            <div className="absolute inset-[9%] rounded-[50%] border border-gold/15" />
          </div>
        </div>

        {/* centre : cartes communes et pot */}
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
          {h ? (
            <>
              <div className="text-xs text-gold-pale/70">
                Main n°{h.number} · {STAGE[h.stage]}
              </div>
              <div className="flex gap-1 sm:gap-1.5" aria-label="Cartes communes">
                {[0, 1, 2, 3, 4].map((i) =>
                  h.board[i] ? (
                    <PlayingCard key={h.number + "-" + i} card={h.board[i]} size={narrow ? "md" : "lg"} delay={i < 3 ? i * 0.12 : 0} highlight={showCombo && isInBest(h, mySeat, h.board[i], me?.handInfo?.cards)} />
                  ) : (
                    <div key={i} className={`${narrow ? "h-[4.2rem] w-12" : "h-[5.6rem] w-16"} rounded-lg border border-dashed border-gold/20`} />
                  ),
                )}
              </div>
              <div className="flex items-center gap-2 rounded-full bg-black/45 px-3 py-1">
                <ChipStack amount={h.pot} label={false} />
                <span className="text-sm text-gold-pale">Pot : {fmt(h.pot)}</span>
              </div>
            </>
          ) : (
            <div className="max-w-[16rem] text-center text-sm text-gold-pale/80">
              {p.seats.filter(Boolean).length < 2 ? "Choisissez un siège libre. Il faut au moins 2 joueurs assis pour distribuer." : "Tout le monde est prêt ? Lancez la première main."}
            </div>
          )}
          <AnimatePresence>
            {h?.stage === "done" && h.result && (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="rounded-lg border border-gold/50 bg-black/70 px-4 py-2 text-center text-sm text-gold-pale">
                {h.result.summary}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* sièges */}
        {p.seats.map((s: any, i: number) => {
          const ph = h?.players?.[i];
          const style = pos(i);
          const betPos = pos(i, narrow ? 20 : 27, 22);
          if (!s)
            return mySeat === null ? (
              <button
                key={i}
                style={style}
                className="absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-gold/40 bg-black/40 px-3 py-2 text-xs text-gold-pale/80 hover:bg-gold/15"
                onClick={() => setBuyInSeat(i)}
              >
                S'asseoir
              </button>
            ) : (
              <span key={i} style={style} className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/30" />
            );
          const isMe = i === mySeat;
          const offline = !data.online.includes(s.userId);
          return (
            <div key={i}>
              {ph && ph.bet > 0 && (
                <div className="absolute z-10 -translate-x-1/2 -translate-y-1/2" style={betPos}>
                  <ChipStack amount={ph.bet} />
                </div>
              )}
              <div style={style} className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
                {ph && (
                  <div className={`mb-[-10px] flex ${isMe ? "gap-1" : "-space-x-3"} ${ph.folded ? "opacity-40" : ""}`}>
                    {ph.hole.map((c: string | null, k: number) => (
                      <PlayingCard key={h.number + "-" + k} card={c} size={isMe ? (narrow ? "md" : "lg") : "sm"} delay={k * 0.15} highlight={isMe && showCombo && isInBest(h, mySeat, c, me?.handInfo?.cards)} />
                    ))}
                  </div>
                )}
                <div
                  className={`relative flex min-w-[6.5rem] items-center gap-2 rounded-full border bg-black/75 py-1 pl-1 pr-3 ${toActSeat === i ? "border-gold turn-ring" : winners.has(i) && h?.stage === "done" ? "border-gold shadow-[0_0_24px_rgba(217,180,90,.6)]" : "border-gold/25"}`}
                >
                  <Avatar emoji={s.avatar} color={s.color} size={32} />
                  <div className="min-w-0 leading-tight">
                    <div className={`max-w-[6rem] truncate text-xs ${isMe ? "text-gold" : "text-gold-pale"}`}>
                      {s.username}
                      {offline && <span title="Hors ligne"> 📵</span>}
                    </div>
                    <div className="text-sm font-semibold tabular-nums text-gold-pale">{fmt(s.stack)}</div>
                  </div>
                  {h && h.button === i && (
                    <span className="absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-bold text-black" title="Bouton (donneur)">
                      D
                    </span>
                  )}
                </div>
                <div className="mt-0.5 h-4 text-[11px] text-gold-pale/80">
                  {s.sittingOut ? "Absent" : s.leaveAfterHand ? "Part après la main" : ph?.lastAction ?? (h && (h.sbSeat === i ? "Petite blind" : h.bbSeat === i ? "Grosse blind" : ""))}
                  {h?.stage === "done" && h.result?.shown?.[i] && <span className="text-gold"> · {h.result.shown[i].label}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* panneau d'action */}
      <ActionPanel
        data={data}
        run={run}
        isHost={isHost}
        solo={solo}
        onRankings={() => setRankings(true)}
        onRebuy={() => setRebuy(true)}
        onLog={() => setShowLog(true)}
        toActName={toActPlayer?.username}
        toActOffline={!!toActOffline && toActPlayer?.userId !== user!.id}
        canStart={!live && eligible >= 2 && (mySeat !== null || isHost)}
      />

      <BuyInModal
        open={buyInSeat !== null}
        onClose={() => setBuyInSeat(null)}
        min={p.minBuyIn}
        max={Math.min(p.maxBuyIn, balance)}
        bb={p.bb}
        title="Prendre place"
        cta="S'asseoir"
        onConfirm={async (amount) => {
          await run("sit", { seat: buyInSeat, buyIn: amount });
          setBuyInSeat(null);
        }}
      />
      {mySeat !== null && (
        <BuyInModal
          open={rebuy}
          onClose={() => setRebuy(false)}
          min={1}
          max={Math.min(p.maxBuyIn - p.seats[mySeat].stack, balance)}
          bb={p.bb}
          title="Recaver"
          cta="Ajouter ces jetons"
          onConfirm={async (amount) => {
            await run("rebuy", { amount });
            setRebuy(false);
          }}
        />
      )}
      <Modal open={rankings} onClose={() => setRankings(false)} title="Les combinaisons" wide>
        <HandRankings />
      </Modal>
      <Modal open={showLog} onClose={() => setShowLog(false)} title="Historique des actions" wide>
        <HandLog poker={p} />
      </Modal>
    </div>
  );
}

function isInBest(h: any, mySeat: number | null, card: string | null, combo?: string[]) {
  if (!card || mySeat === null) return false;
  if (h.stage !== "done") return !!combo?.includes(card) && !h.players?.[mySeat]?.folded;
  return !!h.result?.shown?.[mySeat]?.best?.includes(card) && h.result.pots.some((x: any) => x.winners.includes(mySeat));
}

function ActionPanel({
  data,
  run,
  isHost,
  solo,
  onRankings,
  onRebuy,
  onLog,
  toActName,
  toActOffline,
  canStart,
}: {
  data: Pick<RoomData, "poker" | "online" | "clockOffset">;
  run: (a: string, b?: object) => Promise<void>;
  isHost: boolean;
  solo?: boolean;
  onRankings: () => void;
  onRebuy: () => void;
  onLog: () => void;
  toActName?: string;
  toActOffline: boolean;
  canStart: boolean;
}) {
  const p = data.poker;
  const h = p.hand;
  const me = p.me;
  const legal = me?.legal;
  const [raise, setRaise] = useState(0);
  const [raising, setRaising] = useState(false);
  const [helpOpen, setHelpOpen] = useState(() => {
    try {
      return localStorage.getItem("vc_poker_help") === "1";
    } catch {
      return false;
    }
  });
  const setHelp = (v: boolean) => {
    setHelpOpen(v);
    try {
      localStorage.setItem("vc_poker_help", v ? "1" : "0");
    } catch {
      /* ignoré */
    }
  };
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (legal?.raise) setRaise(legal.raise.min);
    setRaising(false);
  }, [legal?.raise?.min, h?.number, h?.stage]); // eslint-disable-line

  const act = async (type: string, amount?: number) => {
    if (busy) return;
    setBusy(true);
    sound.chip();
    try {
      await run("act", { type, amount });
    } finally {
      setBusy(false);
    }
  };

  // raccourcis clavier
  useEffect(() => {
    if (!legal) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT" && (e.target as HTMLInputElement).type !== "range") return;
      const k = e.key.toLowerCase();
      if (k === "f") act("fold");
      else if (k === "c") act(legal.check ? "check" : "call");
      else if (k === "r" && legal.raise) setRaising(true);
      else if (k === "a" && legal.allIn) act("allin");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line

  const seat = me ? p.seats[me.seat] : null;
  const pot = h?.pot ?? 0;

  return (
    <div className="panel sticky bottom-2 z-30 mx-auto w-full max-w-[980px] p-2 sm:p-3">
      {/* détails de l'aide : s'ouvrent au-dessus de la barre, sans la faire grandir */}
      <AnimatePresence>
        {helpOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="absolute inset-x-0 bottom-full mb-2 max-h-[55dvh] overflow-y-auto rounded-xl border border-gold/30 bg-[#04110c]/95 p-4 shadow-2xl backdrop-blur scroll-thin"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-gold-pale">Aide</span>
              <button className="px-1 text-xl leading-none text-gold-pale/60 hover:text-gold" onClick={() => setHelp(false)} aria-label="Fermer l'aide">
                ×
              </button>
            </div>
            {me?.handInfo ? (
              <HandDetails info={me.handInfo} legal={legal} pot={h?.pot ?? 0} live={!!h && h.stage !== "done" && !h.players?.[me.seat]?.folded} />
            ) : (
              <p className="text-sm text-gold-pale/70">L'aide s'affiche ici pendant que vous jouez une main.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-gold/10 pt-2 text-xs">
              <button className="text-gold hover:underline" onClick={onRankings}>
                Les combinaisons
              </button>
              <button className="text-gold hover:underline" onClick={onLog}>
                Historique des actions
              </button>
              <span className="text-gold-pale/50">
                Blinds {p.sb}/{p.bb}
              </span>
              <span className="text-gold-pale/50">Raccourcis : F coucher · C parole/suivre · R relancer · A tapis</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          {me?.handInfo ? (
            <HandSummary info={me.handInfo} legal={legal} live={!!h && h.stage !== "done" && !h.players?.[me.seat]?.folded} helpOpen={helpOpen} onHelp={() => setHelp(!helpOpen)} />
          ) : (
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-gold-pale/70">
                {seat ? (h && h.stage !== "done" ? "Vous attendez la prochaine main." : "La main suivante démarre automatiquement.") : "Cliquez sur « S'asseoir » autour de la table pour jouer."}
              </p>
              <button className="shrink-0 rounded-full border border-gold/30 px-2.5 py-1 text-xs text-gold" onClick={() => setHelp(!helpOpen)} aria-expanded={helpOpen}>
                Aide
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-col items-stretch gap-2">
          {legal ? (
            raising && legal.raise ? (
              <div className="flex flex-col gap-2 sm:min-w-[22rem]">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={legal.raise.min}
                    max={legal.raise.max}
                    step={1}
                    value={raise}
                    onChange={(e) => setRaise(Number(e.target.value))}
                    className="flex-1"
                    aria-label="Montant de la relance"
                  />
                  <input type="number" className="input w-24 py-1.5" min={legal.raise.min} max={legal.raise.max} value={raise} onChange={(e) => setRaise(Number(e.target.value))} aria-label="Relancer à" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    ["Min", legal.raise.min],
                    ["½ pot", h.currentBet + Math.round(pot / 2)],
                    ["Pot", h.currentBet + pot],
                    ["Max", legal.raise.max],
                  ].map(([l, v]) => (
                    <button key={l as string} className="btn-ghost px-2.5 py-1 text-xs" onClick={() => setRaise(Math.max(legal.raise.min, Math.min(legal.raise.max, v as number)))}>
                      {l}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button className="btn-ghost flex-1" onClick={() => setRaising(false)}>
                    Annuler
                  </button>
                  <button className="btn-gold flex-1" disabled={busy} onClick={() => act(raise >= legal.raise.max ? "allin" : "raise", raise)}>
                    {h.currentBet === 0 ? "Miser" : "Relancer à"} {fmt(raise)}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-1.5 sm:flex sm:gap-2">
                  <ActBtn label="Coucher" hint="Abandonner la main (F)" onClick={() => act("fold")} disabled={busy} kind="ruby" />
                  {legal.check ? (
                    <ActBtn label="Parole" hint="Passer sans miser (C)" onClick={() => act("check")} disabled={busy} kind="felt" />
                  ) : (
                    <ActBtn label={`Suivre ${fmt(legal.call)}`} hint="Égaler la mise (C)" onClick={() => act("call")} disabled={busy || !legal.call} kind="felt" />
                  )}
                  <ActBtn label={h.currentBet === 0 ? "Miser" : "Relancer"} hint="Augmenter la mise (R)" onClick={() => setRaising(true)} disabled={busy || !legal.raise} kind="gold" />
                  <ActBtn label={`Tapis ${fmt(legal.allIn)}`} hint="Miser tous vos jetons (A)" onClick={() => act("allin")} disabled={busy || !legal.allIn} kind="ghost" />
                </div>
              </>
            )
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {h && h.stage !== "done" && toActName && <span className="text-sm text-gold-pale/70">{toActName} réfléchit…</span>}
              {isHost && toActOffline && h?.stage !== "done" && (
                <button className="btn-ghost text-sm" onClick={() => run("forceAbsent")} title="Parole si possible, sinon couché">
                  Faire jouer {toActName} (absent)
                </button>
              )}
              {canStart && (
                <button className="btn-gold" onClick={() => run("start")}>
                  {h ? "Main suivante" : "Distribuer les cartes"}
                </button>
              )}
              {seat && (
                <>
                  {!solo && <button className="btn-ghost px-3 py-2 text-sm" onClick={() => run("sitOut", { value: !seat.sittingOut })}>
                    {seat.sittingOut ? "Revenir en jeu" : "Faire une pause"}
                  </button>}
                  <button className="btn-ghost px-3 py-2 text-sm" onClick={onRebuy}>
                    Recaver
                  </button>
                  <button className="btn-ghost px-3 py-2 text-sm" onClick={() => run("stand")}>
                    Quitter la table
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ActBtn({ label, hint, onClick, disabled, kind }: { label: string; hint: string; onClick: () => void; disabled?: boolean; kind: "gold" | "felt" | "ruby" | "ghost" }) {
  const { prefs } = useApp();
  return (
    <button className={`btn-${kind} flex-col gap-0 px-1.5 py-2 text-sm sm:px-3 sm:text-base xl:px-4`} onClick={onClick} disabled={disabled} title={hint}>
      <span className="leading-tight">{label}</span>
      {prefs.showHelp && <span className="hidden text-[10px] font-normal opacity-70 2xl:block">{hint}</span>}
    </button>
  );
}

function BuyInModal({ open, onClose, min, max, bb, title, cta, onConfirm }: { open: boolean; onClose: () => void; min: number; max: number; bb: number; title: string; cta: string; onConfirm: (n: number) => Promise<void> }) {
  const [v, setV] = useState(min);
  useEffect(() => {
    if (open) setV(Math.max(min, Math.min(max, bb * 20)));
  }, [open, min, max, bb]);
  const ok = max >= min;
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {ok ? (
        <>
          <p className="text-sm text-gold-pale/70">Combien de crédits apportez-vous à la table ? Ce qui reste sur votre tapis revient dans votre portefeuille quand vous partez.</p>
          <div className="my-5 text-center font-marquee text-4xl text-gold">{fmt(v)} VC</div>
          <input type="range" min={min} max={max} value={v} onChange={(e) => setV(Number(e.target.value))} className="w-full" aria-label="Montant de la cave" />
          <div className="mt-1 flex justify-between text-xs text-gold-pale/50">
            <span>{fmt(min)}</span>
            <span>{fmt(max)}</span>
          </div>
          <button className="btn-gold mt-5 w-full" onClick={() => onConfirm(v).catch(() => {})}>
            {cta}
          </button>
        </>
      ) : (
        <p className="text-gold-pale/80">
          Il vous faut au moins {fmt(min)} VC. Vous pouvez réinitialiser gratuitement votre portefeuille depuis votre profil (après avoir quitté la table).
        </p>
      )}
    </Modal>
  );
}

function HandLog({ poker }: { poker: any }) {
  const [sel, setSel] = useState<number>(-1);
  const lines: string[] = sel === -1 ? poker.log : poker.history[sel]?.lines ?? [];
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button className={`rounded px-2.5 py-1 text-sm ${sel === -1 ? "bg-felt" : "border border-gold/20"}`} onClick={() => setSel(-1)}>
          Main en cours
        </button>
        {poker.history.map((x: any, i: number) => (
          <button key={x.number} className={`rounded px-2.5 py-1 text-sm ${sel === i ? "bg-felt" : "border border-gold/20"}`} onClick={() => setSel(i)}>
            Main {x.number}
          </button>
        ))}
      </div>
      <ol className="scroll-thin max-h-[50dvh] space-y-1 overflow-y-auto text-sm">
        {lines.map((l, i) => (
          <li key={i} className={l.startsWith("—") || /^(Flop|Turn|River)/.test(l) ? "pt-2 font-semibold text-gold" : "text-gold-pale/85"}>
            {l}
          </li>
        ))}
        {!lines.length && <li className="text-gold-pale/50">Aucune action pour l'instant.</li>}
      </ol>
    </div>
  );
}

/** Une seule ligne : le nom de la main, rien de plus. */
function HandSummary({ info, helpOpen, onHelp }: { info: any; legal?: any; live?: boolean; helpOpen: boolean; onHelp: () => void }) {
  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <button className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border text-sm font-semibold ${helpOpen ? "border-gold bg-gold text-velvet" : "border-gold/40 text-gold"}`} onClick={onHelp} aria-expanded={helpOpen} aria-label="Aide : votre main et les règles" title="Aide">
        ?
      </button>
      <span className="min-w-0 truncate font-marquee text-lg text-gold sm:text-xl" title={info.label}>
        {info.label}
      </span>
    </div>
  );
}

/** À la demande : ce qu'est la main, sans chances ni conseils. */
function HandDetails({ info }: { info: any; legal?: any; pot?: number; live?: boolean }) {
  return (
    <div className="space-y-1.5">
      <p className="font-marquee text-2xl text-gold">{info.label}</p>
      <p className="text-sm leading-snug text-gold-pale/80">{info.explain}</p>
    </div>
  );
}
