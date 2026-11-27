import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api";
import { useApp, fmt } from "../state";
import { TopBar, Help } from "../components/UI";
import { BetInput } from "../components/BetInput";
import { sound } from "../sound";

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function MinesPage() {
  const { setBalance, toast, balance } = useApp();
  const [game, setGame] = useState<any>(null);
  const [bet, setBet] = useState(10);
  const [mines, setMines] = useState(3);
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState<boolean | null>(null);
  // cases touchées pendant qu'une réponse du serveur est en route : jouées ensuite dans l'ordre
  const [queued, setQueued] = useState<number[]>([]);
  const queueRef = useRef<number[]>([]);
  const runningRef = useRef(false);

  useEffect(() => {
    api("/mines").then((r) => {
      setGame(r.game);
      setBalance(r.balance);
      if (r.game?.stage === "playing") {
        setBet(r.game.bet);
        setMines(r.game.mines);
      }
    });
  }, [setBalance]);

  // preuve d'équité : la grille dévoilée correspond-elle à l'empreinte annoncée au départ ?
  useEffect(() => {
    setVerified(null);
    if (!game?.layout || !game.salt) return;
    sha256(`${[...game.layout].sort((a: number, b: number) => a - b).join(",")}:${game.salt}`).then((h) => setVerified(h === game.commitment)).catch(() => setVerified(null));
  }, [game?.layout, game?.salt, game?.commitment]);

  const call = async (path: string, body: object) => {
    setBusy(true);
    try {
      const r = await api(path, { body });
      setGame(r.game);
      setBalance(r.balance);
      return r.game;
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const start = async () => {
    const g = await call("/mines/start", { bet, mines });
    if (g) sound.chip();
  };
  const runQueue = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    setBusy(true);
    try {
      while (queueRef.current.length) {
        const cell = queueRef.current[0];
        let g: any = null;
        try {
          const r = await api("/mines/action", { body: { cell } });
          g = r.game;
          setGame(g);
          setBalance(r.balance);
        } catch (e) {
          toast((e as Error).message, "error");
        }
        queueRef.current = queueRef.current.slice(1);
        if (!g || g.stage !== "playing") {
          // partie finie (mine ou toutes les cases) : les touches en attente sont annulées
          queueRef.current = [];
          if (g?.stage === "lost") sound.lose();
          else if (g?.stage === "cashed") sound.win();
        } else sound.tick();
        setQueued([...queueRef.current]);
      }
    } finally {
      runningRef.current = false;
      setBusy(false);
    }
  };
  const reveal = (cell: number) => {
    if (game?.stage !== "playing" || game.revealed.includes(cell) || queueRef.current.includes(cell)) return;
    queueRef.current = [...queueRef.current, cell];
    setQueued([...queueRef.current]);
    runQueue();
  };
  const cashout = async () => {
    if (runningRef.current) return;
    const g = await call("/mines/action", { action: "cashout" });
    if (g) sound.win();
  };

  const playing = game?.stage === "playing";
  const over = game && !playing;

  return (
    <div className="min-h-dvh">
      <TopBar title="Mines" />
      <main className="mx-auto grid max-w-5xl gap-5 px-3 py-5 lg:grid-cols-[300px_1fr]">
        <aside className="panel order-2 flex h-fit flex-col gap-4 p-4 lg:order-1">
          <BetInput value={bet} onChange={setBet} disabled={playing} />
          <div>
            <div className="mb-1 flex justify-between text-sm text-gold-pale/70">
              <span>Nombre de mines</span>
              <b className="text-gold-pale">{mines}</b>
            </div>
            <input type="range" min={1} max={24} value={mines} disabled={playing} onChange={(e) => setMines(Number(e.target.value))} className="w-full" aria-label="Nombre de mines" />
            <div className="mt-1 flex gap-1.5">
              {[1, 3, 5, 10, 24].map((n) => (
                <button key={n} disabled={playing} onClick={() => setMines(n)} className={`flex-1 rounded-md border py-1 text-xs ${mines === n ? "border-gold bg-gold/15 text-gold" : "border-gold/20 text-gold-pale/70"}`}>
                  {n}
                </button>
              ))}
            </div>
            <Help>Plus il y a de mines, plus chaque case découverte rapporte, et plus le risque est grand.</Help>
          </div>

          {playing ? (
            <div className="order-first space-y-2 lg:order-none">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg bg-black/40 p-2">
                  <div className="text-xs text-gold-pale/60">Multiplicateur</div>
                  <div className="text-xl font-semibold tabular-nums text-gold">×{game.multiplier.toFixed(2)}</div>
                </div>
                <div className="rounded-lg bg-black/40 p-2">
                  <div className="text-xs text-gold-pale/60">Case suivante</div>
                  <div className="text-xl font-semibold tabular-nums text-gold-pale">{game.nextMultiplier ? `×${game.nextMultiplier.toFixed(2)}` : "—"}</div>
                </div>
              </div>
              <p className="text-center text-xs text-gold-pale/60">Chance que la prochaine case soit sûre : {Math.round(game.safeChance * 100)} %</p>
              <button className="btn-gold w-full py-3 text-lg" onClick={cashout} disabled={busy || game.revealed.length === 0}>
                {game.revealed.length ? `Encaisser ${fmt(game.cashoutValue)} VC` : "Découvrez une case"}
              </button>
            </div>
          ) : (
            <button className="btn-gold w-full py-3 text-lg" onClick={start} disabled={busy || bet > balance}>
              {bet > balance ? "Solde insuffisant" : `Jouer ${fmt(bet)} VC`}
            </button>
          )}
        </aside>

        <section className="order-1 flex flex-col items-center gap-3 lg:order-2">
          <div className="grid w-full max-w-[520px] grid-cols-5 gap-2 rounded-2xl border border-gold/20 bg-black/40 p-3 sm:gap-2.5 sm:p-4">
            {Array.from({ length: 25 }, (_, i) => {
              const isSafe = game?.revealed.includes(i);
              const isMine = over && game.layout?.includes(i);
              const isHit = game?.hit === i;
              const isPending = playing && queued.includes(i);
              // fin de partie : les diamants non trouvés apparaissent en transparence
              const missed = over && !!game.layout && !isSafe && !isMine;
              const shown = isSafe || isMine || missed;
              return (
                <motion.button
                  key={i}
                  whileTap={playing && !isSafe ? { scale: 0.92 } : undefined}
                  onClick={() => reveal(i)}
                  disabled={!playing || isSafe || isPending}
                  aria-label={isSafe ? "Diamant" : isMine ? "Mine" : `Case ${i + 1}`}
                  className={`relative grid aspect-square place-items-center rounded-xl text-3xl transition-colors sm:text-4xl ${
                    shown
                      ? isHit
                        ? "bg-ruby shadow-[0_0_24px_rgba(192,51,74,.8)]"
                        : isSafe
                          ? "bg-felt-light/70"
                          : "bg-black/50"
                      : isPending
                        ? "animate-pulse bg-gradient-to-b from-[#2f8a6c] to-[#17543f]"
                        : "bg-gradient-to-b from-[#1f5f4b] to-[#0d3a2c] shadow-[inset_0_-4px_0_rgba(0,0,0,.35)] hover:from-[#26735b] disabled:hover:from-[#1f5f4b]"
                  }`}
                >
                  <AnimatePresence>
                    {shown && (
                      <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 320, damping: 16 }} className={(isMine && !isHit) || missed ? "opacity-40" : ""}>
                        {isSafe || missed ? "💎" : "💣"}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.button>
              );
            })}
          </div>

          <AnimatePresence mode="wait">
            {over && (
              <motion.p key={game.stage + game.commitment} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`font-marquee text-2xl ${game.stage === "cashed" ? "text-gold" : "text-[#ff9aa9]"}`}>
                {game.stage === "cashed" ? `Encaissé : ${fmt(game.payout)} VC (×${game.multiplier.toFixed(2)})` : `Boum ! Mine touchée, mise de ${fmt(game.bet)} VC perdue`}
              </motion.p>
            )}
          </AnimatePresence>

          {game && (
            <details className="w-full max-w-[520px] text-xs text-gold-pale/60">
              <summary className="cursor-pointer text-gold/80">Preuve d'équité {verified === true && "✓ vérifiée"}</summary>
              <div className="mt-2 space-y-1 break-all rounded-lg bg-black/30 p-3">
                <p>Avant votre premier clic, le serveur publie l'empreinte (SHA-256) de la grille. Elle ne peut plus changer ensuite.</p>
                <p>
                  Empreinte : <code className="text-gold-pale/80">{game.commitment}</code>
                </p>
                {over ? (
                  <>
                    <p>
                      Grille dévoilée : mines en cases {game.layout.map((c: number) => c + 1).join(", ")} · sel <code>{game.salt}</code>
                    </p>
                    <p className={verified ? "text-emerald-300" : "text-[#ff9aa9]"}>{verified === null ? "Vérification…" : verified ? "Votre navigateur a recalculé l'empreinte : elle correspond, la grille n'a pas été modifiée." : "L'empreinte ne correspond pas."}</p>
                  </>
                ) : (
                  <p>La grille et le sel seront dévoilés à la fin de la partie pour que vous puissiez vérifier.</p>
                )}
              </div>
            </details>
          )}
          {!game && <p className="max-w-md text-center text-sm text-gold-pale/70">Des diamants et des mines sont cachés sous les 25 cases. Chaque diamant augmente vos gains ; encaissez quand vous voulez, mais une mine fait tout perdre.</p>}
        </section>
      </main>
    </div>
  );
}
