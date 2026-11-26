import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { api } from "../api";
import { useApp, fmt } from "../state";
import { TopBar } from "../components/UI";
import { BetInput } from "../components/BetInput";
import { sound } from "../sound";

export function KenoPage() {
  const { setBalance, toast, balance } = useApp();
  const [info, setInfo] = useState<any>(null);
  const [picks, setPicks] = useState<number[]>([]);
  const [bet, setBet] = useState(10);
  const [drawn, setDrawn] = useState<number[]>([]);
  const [shown, setShown] = useState(0);
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api("/tables/info").then((r) => setInfo(r.keno));
  }, []);

  const toggle = (n: number) => {
    if (busy) return;
    if (res) {
      setRes(null);
      setDrawn([]);
      setShown(0);
    }
    setPicks((p) => (p.includes(n) ? p.filter((x) => x !== n) : p.length >= 10 ? p : [...p, n]));
    sound.click();
  };
  const quick = (count: number) => {
    const all = Array.from({ length: 40 }, (_, i) => i + 1).sort(() => Math.random() - 0.5);
    setPicks(all.slice(0, count));
    setRes(null);
    setDrawn([]);
    setShown(0);
  };
  const play = async () => {
    if (!picks.length || busy) return;
    if (bet > balance) return toast("Solde insuffisant", "error");
    setBusy(true);
    setRes(null);
    setShown(0);
    try {
      const r = await api("/keno/play", { body: { bet, picks } });
      setBalance(r.balance - r.payout);
      setDrawn(r.drawn);
      r.drawn.forEach((n: number, i: number) =>
        setTimeout(() => {
          setShown(i + 1);
          if (picks.includes(n)) sound.chip();
          else sound.tick();
        }, (i + 1) * 260),
      );
      setTimeout(() => {
        setRes(r);
        setBalance(r.balance);
        setBusy(false);
        if (r.payout > 0) sound.win();
      }, 11 * 260 + 200);
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  };

  const visibleDrawn = drawn.slice(0, shown);
  const hits = picks.filter((n) => visibleDrawn.includes(n)).length;
  const table: Record<string, number> = info?.pays?.[picks.length] ?? {};

  return (
    <div className="min-h-dvh">
      <TopBar title="Keno" />
      <main className="mx-auto grid max-w-5xl gap-5 px-3 py-5 lg:grid-cols-[1fr_300px]">
        <section className="space-y-3">
          <div className="grid grid-cols-8 gap-1.5 rounded-2xl border border-gold/20 bg-black/40 p-3 sm:gap-2">
            {Array.from({ length: 40 }, (_, i) => i + 1).map((n) => {
              const picked = picks.includes(n);
              const out = visibleDrawn.includes(n);
              const hit = picked && out;
              return (
                <motion.button
                  key={n}
                  onClick={() => toggle(n)}
                  animate={out ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className={`relative grid aspect-square place-items-center rounded-lg text-sm font-bold sm:text-base ${
                    hit ? "bg-gold text-velvet shadow-[0_0_16px_rgba(217,180,90,.8)]" : picked ? "bg-felt-light text-white ring-2 ring-gold/70" : out ? "bg-ruby/80 text-white" : "bg-white/5 text-gold-pale/80 hover:bg-white/10"
                  }`}
                  aria-pressed={picked}
                  aria-label={`Numéro ${n}${picked ? ", choisi" : ""}${out ? ", tiré" : ""}`}
                >
                  {hit ? "💎" : n}
                  {hit && <span className="absolute bottom-0.5 text-[9px]">{n}</span>}
                </motion.button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gold-pale/70">
              {picks.length}/10 numéros choisis{drawn.length > 0 && ` · ${hits} trouvé${hits > 1 ? "s" : ""}`}
            </span>
            <button className="btn-ghost ml-auto px-3 py-1.5 text-sm" onClick={() => quick(5)} disabled={busy}>
              Choix rapide (5)
            </button>
            <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => quick(10)} disabled={busy}>
              Choix rapide (10)
            </button>
            <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => (setPicks([]), setRes(null), setDrawn([]))} disabled={busy || !picks.length}>
              Effacer
            </button>
          </div>
          {res && (
            <p className={`text-center font-marquee text-2xl ${res.payout ? "text-gold" : "text-gold-pale/60"}`}>
              {res.payout ? `${res.hits.length} sur ${picks.length} : ×${res.multiplier}, vous gagnez ${fmt(res.payout)} VC` : `${res.hits.length} sur ${picks.length} : pas de gain cette fois`}
            </p>
          )}
        </section>

        <aside className="panel h-fit space-y-4 p-4">
          <BetInput value={bet} onChange={setBet} disabled={busy} />
          <button className="btn-gold w-full py-3 text-lg" onClick={play} disabled={busy || !picks.length || bet > balance}>
            {picks.length ? "Lancer le tirage" : "Choisissez 1 à 10 numéros"}
          </button>
          <div>
            <p className="mb-1 text-sm font-semibold text-gold-pale">Gains pour {picks.length || "…"} numéro{picks.length > 1 ? "s" : ""}</p>
            {picks.length ? (
              <table className="w-full text-sm">
                <tbody>
                  {Object.entries(table)
                    .sort((a, b) => Number(b[0]) - Number(a[0]))
                    .map(([h, m]) => (
                      <tr key={h} className={`border-t border-gold/10 ${res && Number(h) === res.hits.length ? "text-gold" : "text-gold-pale/80"}`}>
                        <td className="py-1">{h} trouvé{Number(h) > 1 ? "s" : ""}</td>
                        <td className="py-1 text-right tabular-nums">×{m}</td>
                        <td className="py-1 text-right tabular-nums text-gold-pale/50">{fmt(Math.floor(bet * m))}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-gold-pale/55">Choisissez vos numéros sur la grille : la table des gains s'affiche ici.</p>
            )}
            {info && picks.length > 0 && <p className="mt-2 text-xs text-gold-pale/50">Taux de retour avec {picks.length} numéros : {(info.rtp[picks.length] * 100).toFixed(1)} %.</p>}
          </div>
          <p className="text-xs text-gold-pale/55">Le serveur tire 10 numéros sur 40. Plus vous en trouvez parmi les vôtres, plus vous gagnez.</p>
        </aside>
      </main>
    </div>
  );
}
