import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { useApp, fmt, go } from "../state";
import { TopBar, Avatar, Help } from "../components/UI";
import { PokerTable } from "./PokerTable";

const LEVELS = [
  ["facile", "Facile", "Les bots se trompent souvent. Idéal pour apprendre."],
  ["normal", "Normal", "Des adversaires corrects, avec chacun son style."],
  ["difficile", "Difficile", "Calculs plus précis, moins d'erreurs."],
] as const;

const BOT_PREVIEW = [
  ["🍀", "Lucky Lou", "joue beaucoup de mains"],
  ["👑", "La Comtesse", "sélective et solide"],
  ["🦈", "Max le Requin", "très agressif, bluffe"],
  ["🧓", "Papy Roger", "ne joue que les grosses mains"],
  ["🤖", "Neon Kid", "imprévisible"],
  ["🌹", "Señora Rosa", "équilibrée"],
];

export function SoloPokerPage() {
  const { setBalance, toast } = useApp();
  const [state, setState] = useState<any>(undefined);
  const busy = useRef(false);

  const apply = useCallback(
    (r: any) => {
      setBalance(r.balance);
      setState({ ...r, clockOffset: r.serverTime - Date.now() });
    },
    [setBalance],
  );

  useEffect(() => {
    api("/solo-poker").then(apply).catch((e) => toast(e.message, "error"));
  }, [apply, toast]);

  const run = useCallback(
    async (action: string, body: object = {}) => {
      const path = { act: "act", start: "next", rebuy: "rebuy", stand: "leave", step: "step" }[action];
      if (!path) return;
      busy.current = true;
      try {
        apply(await api("/solo-poker/" + path, { body }));
      } catch (e) {
        toast((e as Error).message, "error");
      } finally {
        busy.current = false;
      }
    },
    [apply, toast],
  );

  // les bots jouent une action à la fois, avec un temps de réflexion visible
  const t = state?.table;
  const h = t?.hand;
  const botTurn = h && h.stage !== "done" && h.toAct !== null && h.toAct !== t.me?.seat;
  useEffect(() => {
    if (!botTurn) return;
    const delay = 650 + Math.random() * 700;
    const id = setTimeout(() => {
      if (!busy.current) run("step");
    }, delay);
    return () => clearTimeout(id);
  }, [botTurn, h?.toAct, h?.stage, h?.number, t?.log?.length, run]);

  if (state === undefined) return <div className="grid min-h-dvh place-items-center text-gold/70">Préparation de la table…</div>;

  if (!t) return <Setup onStart={apply} />;

  const online = t.seats.filter(Boolean).map((s: any) => s.userId);
  return (
    <div className="min-h-dvh">
      <TopBar title="Poker contre les bots" />
      <main className="mx-auto max-w-5xl px-2 pb-24 pt-3 sm:px-4">
        <div className="mb-2 flex items-center justify-between gap-3 px-1 text-sm text-gold-pale/70">
          <span>
            Niveau {LEVELS.find((l) => l[0] === state.level)?.[1].toLowerCase()} · Blinds {t.sb}/{t.bb}
          </span>
          <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => run("stand")} title="Votre tapis revient dans votre portefeuille">
            Quitter la table
          </button>
        </div>
        <PokerTable data={{ poker: t, online, clockOffset: state.clockOffset }} run={run} isHost={false} solo />
      </main>
    </div>
  );
}

function Setup({ onStart }: { onStart: (r: any) => void }) {
  const { balance, toast } = useApp();
  const [bots, setBots] = useState(3);
  const [level, setLevel] = useState<string>("normal");
  const max = Math.min(1000, balance);
  const [buyIn, setBuyIn] = useState(Math.max(100, Math.min(max, 200)));
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      onStart(await api("/solo-poker/start", { body: { bots, level, buyIn } }));
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-dvh">
      <TopBar title="Poker contre les bots" />
      <main className="mx-auto max-w-2xl space-y-5 px-4 py-6">
        <div>
          <h1 className="font-marquee text-4xl text-gold">Une table rien que pour vous</h1>
          <p className="mt-2 text-gold-pale/75">Entraînez-vous au Texas Hold'em contre des adversaires virtuels, à votre rythme. Les règles sont les mêmes qu'entre amis.</p>
        </div>

        <section className="panel p-5">
          <h2 className="mb-3 font-semibold text-gold-pale">Nombre d'adversaires</h2>
          <div className="flex gap-2" role="radiogroup" aria-label="Nombre de bots">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} role="radio" aria-checked={bots === n} onClick={() => setBots(n)} className={`h-12 flex-1 rounded-lg border text-lg font-semibold ${bots === n ? "border-gold bg-gold text-velvet" : "border-gold/25"}`}>
                {n}
              </button>
            ))}
          </div>
          <Help>{bots === 1 ? "Face à face : beaucoup de mains jouées, idéal pour s'entraîner à relancer." : `Une table de ${bots + 1} joueurs.`}</Help>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {BOT_PREVIEW.map(([a, n, d]) => (
              <div key={n} className="flex items-center gap-2 rounded-lg bg-black/30 p-2">
                <Avatar emoji={a} color="#d9b45a" size={30} />
                <div className="leading-tight">
                  <div className="text-sm text-gold-pale">{n}</div>
                  <div className="text-xs text-gold-pale/50">{d}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-gold-pale/50">Les adversaires sont tirés au hasard parmi ces personnages.</p>
        </section>

        <section className="panel p-5">
          <h2 className="mb-3 font-semibold text-gold-pale">Niveau</h2>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Niveau des bots">
            {LEVELS.map(([id, name, desc]) => (
              <button key={id} role="radio" aria-checked={level === id} onClick={() => setLevel(id)} className={`rounded-lg border p-3 text-left ${level === id ? "border-gold bg-gold/15" : "border-gold/20"}`}>
                <div className="font-semibold text-gold">{name}</div>
                <div className="text-xs text-gold-pale/65">{desc}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="panel p-5">
          <h2 className="mb-1 font-semibold text-gold-pale">Votre cave</h2>
          <p className="text-sm text-gold-pale/60">Blinds 5/10. Ce qui reste sur votre tapis revient dans votre portefeuille quand vous quittez la table.</p>
          {max >= 100 ? (
            <>
              <div className="my-3 text-center font-marquee text-4xl text-gold">{fmt(buyIn)} VC</div>
              <input type="range" min={100} max={max} step={10} value={buyIn} onChange={(e) => setBuyIn(Number(e.target.value))} className="w-full" aria-label="Montant de la cave" />
              <div className="flex justify-between text-xs text-gold-pale/50">
                <span>100</span>
                <span>{fmt(max)}</span>
              </div>
            </>
          ) : (
            <p className="mt-3 text-gold-pale/80">
              Il faut au moins 100 VC.{" "}
              <button className="text-gold underline" onClick={() => go("profile")}>
                Réinitialisez votre portefeuille
              </button>{" "}
              gratuitement.
            </p>
          )}
        </section>

        <button className="btn-gold w-full py-4 text-lg" onClick={start} disabled={busy || max < 100}>
          S'asseoir à la table
        </button>
      </main>
    </div>
  );
}
