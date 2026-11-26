import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../api";
import { useApp, fmt } from "../state";
import { TopBar, Help } from "../components/UI";
import { PlayingCard, ChipStack, useNarrow } from "../components/Cards";
import { AmountField, MAX_BET } from "../components/BetInput";
import { sound } from "../sound";
import { baccaratTotal } from "../../../server/games/tablegames";

type BetType = "joueur" | "banque" | "egalite" | "paire_joueur" | "paire_banque";
const SPOTS: { type: BetType; label: string; pays: string; cls: string }[] = [
  { type: "paire_joueur", label: "Paire Joueur", pays: "11 pour 1", cls: "border-sky-300/40" },
  { type: "joueur", label: "Joueur", pays: "1 pour 1", cls: "border-sky-300/70 bg-sky-900/20" },
  { type: "egalite", label: "Égalité", pays: "8 pour 1", cls: "border-emerald-300/60 bg-emerald-900/20" },
  { type: "banque", label: "Banque", pays: "0,95 pour 1", cls: "border-rose-300/70 bg-rose-900/20" },
  { type: "paire_banque", label: "Paire Banque", pays: "11 pour 1", cls: "border-rose-300/40" },
];
const STEP = 0.55; // secondes entre deux cartes

export function BaccaratPage() {
  const { balance, setBalance, toast } = useApp();
  const narrow = useNarrow();
  const [chip, setChip] = useState(10);
  const [bets, setBets] = useState<Partial<Record<BetType, number>>>({});
  const [last, setLast] = useState<Partial<Record<BetType, number>> | null>(null);
  const [res, setRes] = useState<any>(null);
  const [shown, setShown] = useState(0); // cartes distribuées à l'écran
  const [busy, setBusy] = useState(false);
  const [road, setRoad] = useState<string[]>([]);

  const total = Object.values(bets).reduce((a, b) => a + (b ?? 0), 0);
  const done = res && shown >= res.coup.order.length;

  const place = (t: BetType) => {
    if (busy) return;
    if (res && done) {
      setRes(null);
      setShown(0);
    }
    if (total + chip > balance) return toast("Solde insuffisant", "error");
    setBets((b) => ({ ...b, [t]: (b[t] ?? 0) + chip }));
    sound.chip();
  };

  const play = async () => {
    if (!total || busy) return;
    setBusy(true);
    try {
      const r = await api("/baccarat/play", { body: { bets: Object.entries(bets).map(([type, amount]) => ({ type, amount })) } });
      setBalance(r.balance - r.payout);
      setRes(r);
      setShown(0);
      setLast(bets);
      r.coup.order.forEach((_: unknown, i: number) =>
        setTimeout(() => {
          setShown(i + 1);
          sound.card();
        }, (i + 1) * STEP * 1000),
      );
      setTimeout(
        () => {
          setBalance(r.balance);
          setBets({});
          setBusy(false);
          setRoad((x) => [r.coup.winner, ...x].slice(0, 36));
          if (r.payout > r.total) sound.win();
          else if (r.payout < r.total) sound.lose();
        },
        (r.coup.order.length + 1) * STEP * 1000,
      );
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  };

  const visible = res ? res.coup.order.slice(0, shown) : [];
  const pCards = visible.filter((x: any) => x.to === "joueur").map((x: any) => x.card);
  const bCards = visible.filter((x: any) => x.to === "banque").map((x: any) => x.card);
  const size = narrow ? "md" : "lg";

  const Hand = ({ who, cards }: { who: "joueur" | "banque"; cards: string[] }) => {
    const win = done && res.coup.winner === who;
    return (
      <div className={`flex min-w-0 flex-1 flex-col items-center gap-2 rounded-2xl border-2 p-2 transition-colors sm:p-3 ${who === "joueur" ? "border-sky-300/40" : "border-rose-300/40"} ${win ? "bg-gold/15 shadow-[0_0_30px_rgba(217,180,90,.35)]" : "bg-black/20"}`}>
        <div className="flex items-center gap-2">
          <span className={`font-marquee text-lg sm:text-xl ${who === "joueur" ? "text-sky-200" : "text-rose-200"}`}>{who === "joueur" ? "Joueur" : "Banque"}</span>
          {cards.length > 0 && <span className="rounded-full bg-black/60 px-2.5 text-lg font-bold tabular-nums text-gold-pale">{baccaratTotal(cards)}</span>}
        </div>
        <div className="flex min-h-[4.2rem] -space-x-3 sm:min-h-[5.6rem] sm:space-x-1">
          {cards.map((c, i) => (
            <motion.div key={i + c} initial={{ y: -80, opacity: 0, rotate: i === 2 ? 90 : -10 }} animate={{ y: 0, opacity: 1, rotate: i === 2 ? 90 : 0 }} transition={{ duration: 0.35 }} className={i === 2 ? "!ml-1 sm:!ml-3" : ""}>
              <PlayingCard card={c} size={size} />
            </motion.div>
          ))}
        </div>
        {win && <span className="text-sm font-semibold text-gold">Gagne</span>}
      </div>
    );
  };

  return (
    <div className="min-h-dvh">
      <TopBar title="Baccara" />
      <main className="mx-auto max-w-4xl space-y-4 px-3 py-5">
        <div className="felt relative overflow-hidden rounded-[32px] border-4 border-[#3a2412] p-4 sm:p-6" style={{ ["--felt" as string]: "#0e5c46", ["--felt-hi" as string]: "#1c8064", ["--felt-lo" as string]: "#053425" }}>
          <div className="relative z-10 space-y-4">
            <div className="flex gap-2 sm:gap-3">
              <Hand who="joueur" cards={pCards} />
              <Hand who="banque" cards={bCards} />
            </div>
            <AnimatePresence>
              {done && (
                <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-center font-marquee text-2xl text-gold">
                  {res.coup.winner === "egalite" ? `Égalité ${res.coup.playerTotal} partout` : `${res.coup.winner === "joueur" ? "Joueur" : "Banque"} gagne ${Math.max(res.coup.playerTotal, res.coup.bankerTotal)} à ${Math.min(res.coup.playerTotal, res.coup.bankerTotal)}`}
                  {res.coup.natural ? " (naturel)" : ""}
                  <span className="block text-base text-gold-pale/80">{res.payout > 0 ? `Vous récupérez ${fmt(res.payout)} VC pour ${fmt(res.total)} misés` : `Mise de ${fmt(res.total)} VC perdue`}</span>
                </motion.p>
              )}
            </AnimatePresence>
            {/* cases de mise */}
            <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
              {SPOTS.map((s) => {
                const amount = bets[s.type] ?? (done ? res.results.find((r: any) => r.type === s.type)?.amount : 0);
                const outcome = done ? res.results.find((r: any) => r.type === s.type)?.outcome : null;
                return (
                  <button key={s.type} onClick={() => place(s.type)} disabled={busy} className={`relative flex min-h-[86px] flex-col items-center justify-center rounded-xl border-2 px-1 py-2 text-center ${s.cls} ${outcome === "gagné" ? "ring-2 ring-gold" : ""}`} aria-label={`Miser sur ${s.label}, payé ${s.pays}`}>
                    <span className={`font-semibold text-gold-pale ${s.type.startsWith("paire") ? "text-xs" : "text-sm sm:text-base"}`}>{s.label}</span>
                    <span className="text-[10px] text-gold-pale/60 sm:text-xs">{s.pays}</span>
                    {amount ? (
                      <span className="mt-1">
                        <ChipStack amount={amount} />
                      </span>
                    ) : null}
                    {outcome && outcome !== "perdu" && <span className="text-[10px] font-semibold text-gold">{outcome === "rendu" ? "Rendu" : "Gagné"}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="panel flex flex-wrap items-center gap-3 p-4">
          <div className="flex items-center gap-1.5">
            {[5, 25, 100, 500].map((v) => (
              <button key={v} onClick={() => setChip(v)} aria-pressed={chip === v} className={`grid h-11 w-11 place-items-center rounded-full border-4 border-dashed text-xs font-bold text-white ${chip === v ? "scale-110 border-gold" : "border-white/50"}`} style={{ background: v === 5 ? "#b3283d" : v === 25 ? "#16794a" : v === 100 ? "#151515" : "#6b2a8c" }}>
                {v}
              </button>
            ))}
          </div>
          <div className="flex w-44 items-center gap-1.5">
            <span className="text-xs text-gold-pale/60">Jeton</span>
            <AmountField value={chip} onChange={setChip} max={Math.max(1, Math.min(MAX_BET, balance))} label="Valeur du jeton" />
          </div>
          <span className="text-sm text-gold-pale/70">
            Total misé : <b className="text-gold-pale">{fmt(total)}</b>
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={() => setBets({})} disabled={busy || !total}>
              Effacer
            </button>
            <button className="btn-ghost" disabled={busy || !last} onClick={() => last && setBets(last)}>
              Remiser
            </button>
            <button className="btn-gold px-8" onClick={play} disabled={busy || !total}>
              Distribuer
            </button>
          </div>
        </div>

        {road.length > 0 && (
          <div className="panel p-4">
            <p className="mb-2 text-sm text-gold-pale/70">Derniers coups</p>
            <div className="flex flex-wrap gap-1">
              {road.map((w, i) => (
                <span key={i} className={`grid h-7 w-7 place-items-center rounded-full border-2 text-xs font-bold ${w === "joueur" ? "border-sky-300 text-sky-200" : w === "banque" ? "border-rose-300 text-rose-200" : "border-emerald-300 text-emerald-200"}`} title={w}>
                  {w === "joueur" ? "J" : w === "banque" ? "B" : "É"}
                </span>
              ))}
            </div>
          </div>
        )}

        <details className="panel p-4 text-sm text-gold-pale/80">
          <summary className="cursor-pointer font-semibold text-gold-pale">Comment se joue le baccara ?</summary>
          <div className="mt-2 space-y-2">
            <p>Pariez sur la main qui fera le total le plus proche de 9 : Joueur ou Banque, ou sur une égalité. Les figures et les 10 valent 0, l'As vaut 1, et on ne garde que le chiffre des unités (7 + 8 = 15 → 5).</p>
            <p>Vous ne prenez aucune décision : une troisième carte est tirée automatiquement selon le règlement officiel. Le Joueur tire sur 0 à 5. La Banque tire selon son total et la troisième carte du Joueur.</p>
            <p>En cas d'égalité, les mises sur Joueur et Banque sont rendues. La Banque gagne un peu plus souvent, c'est pourquoi une commission de 5 % est prélevée sur ses gains.</p>
            <Help>Taux de retour : Banque 98,9 %, Joueur 98,8 %, Égalité 85,6 %, Paires 89,6 %. Sabot de 8 jeux, cartes tirées par le serveur.</Help>
          </div>
        </details>
      </main>
    </div>
  );
}
