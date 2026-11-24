import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp, go, fmt } from "../state";
import { Marquee } from "../components/Marquee";
import { Avatar, Balance } from "../components/UI";
import { SettingsModal } from "../components/Settings";
import { PlayingCard } from "../components/Cards";

interface MachineInfo {
  id: string;
  name: string;
  tagline: string;
  symbols: { icon: string; name: string }[];
  palette: { from: string; to: string; accent: string };
}

export function Hall() {
  const { user, toast } = useApp();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  const [rooms, setRooms] = useState<{ code: string; members: number }[]>([]);
  const [machines, setMachines] = useState<MachineInfo[]>([]);

  useEffect(() => {
    api("/me").then((r) => setRooms(r.rooms)).catch(() => {});
    api("/slots/machines").then((r) => setMachines(r.machines)).catch(() => {});
  }, []);

  const create = async () => {
    setBusy(true);
    try {
      const r = await api("/rooms", { method: "POST" });
      go("room/" + r.code);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api("/rooms/join", { body: { code } });
      go("room/" + r.code);
    } catch (err) {
      toast((err as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="deco-bg min-h-dvh">
      <header className="sticky top-0 z-40 border-b border-gold/10 bg-velvet/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
          <span className="font-marquee text-xl text-gold">Virtual Casino</span>
          <nav className="ml-auto flex items-center gap-2">
            <Balance />
            <button className="btn-ghost hidden px-3 py-1.5 text-sm sm:inline-flex" onClick={() => go("rules")}>
              Règles
            </button>
            <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setSettings(true)} aria-label="Paramètres">
              ⚙
            </button>
            <button onClick={() => go("profile")} className="flex items-center gap-2 rounded-full pr-1" aria-label="Profil et statistiques">
              <Avatar emoji={user!.avatar} color={user!.avatar_color} size={34} />
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16">
        <section className="py-8 sm:py-10">
          <Marquee compact />
          <p className="mt-4 text-center text-gold-pale/70">
            Bonsoir {user!.username}. Votre portefeuille contient {fmt(useApp().balance)} VC.
          </p>
          <div className="mx-auto mt-6 grid max-w-3xl grid-cols-3 gap-2 sm:gap-3">
            {[
              ["🃏", "Poker", () => document.getElementById("poker")?.scrollIntoView({ behavior: "smooth" })],
              ["🎰", "Machines à sous", () => document.getElementById("machines")?.scrollIntoView({ behavior: "smooth" })],
              ["♠️", "Blackjack", () => go("blackjack")],
            ].map(([icon, label, fn]) => (
              <button key={label as string} onClick={fn as () => void} className="panel flex flex-col items-center gap-1 px-2 py-3 hover:border-gold/50 sm:flex-row sm:justify-center sm:gap-3 sm:py-4">
                <span className="text-3xl">{icon as string}</span>
                <span className="text-sm font-medium text-gold-pale sm:text-base">{label as string}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Jouer avec mes amis : l'action principale du casino */}
        <section id="poker" className="felt relative scroll-mt-20 overflow-hidden rounded-[28px] border-4 border-[#3a2412] p-6 shadow-[0_20px_60px_rgba(0,0,0,.6)] sm:p-8" style={{ ["--felt" as string]: "#0e5c46", ["--felt-hi" as string]: "#1c8064", ["--felt-lo" as string]: "#053425" }}>
          <div className="relative z-10 grid gap-8 md:grid-cols-[1.3fr_1fr] md:items-center">
            <div>
              <h1 className="font-marquee text-4xl text-gold-pale sm:text-5xl">Poker Texas Hold'em</h1>
              <p className="mt-3 max-w-md text-gold-pale/80">
                Ouvrez un salon privé, partagez le code ou le QR code, et jouez entre amis de 2 à 9 joueurs. Vous êtes seul ? Affrontez des bots.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button className="btn-gold px-6 py-3 text-base" onClick={create} disabled={busy}>
                  Créer un salon entre amis
                </button>
                <button className="btn-felt px-6 py-3 text-base" onClick={() => go("poker-solo")}>
                  🤖 Jouer seul contre des bots
                </button>
              </div>
            </div>
            <form onSubmit={join} className="rounded-2xl bg-black/35 p-5">
              <label htmlFor="code" className="mb-2 block text-gold-pale/80">
                Rejoindre avec un code
              </label>
              <div className="flex gap-2">
                <input id="code" className="input font-semibold tracking-wider uppercase" placeholder="CASINO-7K42" value={code} onChange={(e) => setCode(e.target.value)} maxLength={12} />
                <button className="btn-felt shrink-0" disabled={busy || code.trim().length < 4}>
                  Entrer
                </button>
              </div>
              {rooms.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-sm text-gold-pale/60">Mes salons</p>
                  <div className="flex flex-wrap gap-2">
                    {rooms.map((r) => (
                      <button key={r.code} type="button" onClick={() => go("room/" + r.code)} className="rounded-md border border-gold/30 px-2.5 py-1 text-sm hover:bg-gold/10">
                        {r.code} · {r.members} {r.members > 1 ? "joueurs" : "joueur"}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </form>
          </div>
          <div className="pointer-events-none absolute -right-6 -top-4 hidden rotate-12 gap-1 opacity-80 lg:flex" aria-hidden>
            <PlayingCard card="Ah" size="lg" />
            <PlayingCard card="Ad" size="lg" />
          </div>
        </section>

        {/* Machines à sous : section dédiée, juste après le poker */}
        <section id="machines" className="mt-12 scroll-mt-20">
          <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="font-marquee text-4xl text-gold">Machines à sous</h2>
              <p className="mt-1 max-w-xl text-gold-pale/75">5 machines à thème, gratuites, avec vos crédits virtuels. Les résultats sont tirés par le serveur.</p>
            </div>
            <ol className="grid gap-2 text-sm text-gold-pale/85 sm:grid-cols-3 md:max-w-2xl">
              {[
                "Choisissez une machine",
                "Choisissez votre mise, de 1 à 25 VC",
                "Lancez : 3 symboles identiques sur la ligne du milieu, c'est gagné",
              ].map((t, i) => (
                <li key={i} className="flex gap-2 rounded-lg border border-gold/15 bg-black/30 p-2.5">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gold text-xs font-bold text-velvet">{i + 1}</span>
                  <span>{t}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {machines.map((m) => (
              <button
                key={m.id}
                onClick={() => go("slots/" + m.id)}
                className="group flex flex-col rounded-2xl border-2 p-4 text-left transition-transform hover:-translate-y-1"
                style={{ background: `linear-gradient(170deg, ${m.palette.from}, ${m.palette.to})`, borderColor: m.palette.accent + "99" }}
              >
                <div className="relative mb-3 grid grid-cols-3 gap-1.5 rounded-xl bg-black p-1.5" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="grid h-14 place-items-center rounded-md bg-gradient-to-b from-[#e9e2cf] via-white to-[#e9e2cf] text-3xl">
                      {m.symbols[0].icon}
                    </span>
                  ))}
                  <span className="pointer-events-none absolute inset-x-1 top-1/2 h-[2px] -translate-y-1/2" style={{ background: m.palette.accent, boxShadow: `0 0 8px ${m.palette.accent}` }} />
                </div>
                <div className="text-lg font-semibold" style={{ color: m.palette.accent }}>
                  {m.name}
                </div>
                <div className="text-sm text-gold-pale/65">{m.tagline}</div>
                <div className="mt-1 text-xs text-gold-pale/55">
                  3 × {m.symbols[0].name} = mise × 200
                </div>
                <span className="mt-4 rounded-lg py-2 text-center font-semibold text-velvet" style={{ background: m.palette.accent }}>
                  Jouer
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-10 grid gap-5 md:grid-cols-2">
          <GameTile
            title="Blackjack"
            text="Affrontez le croupier. Le mode entraînement explique chaque décision et corrige vos erreurs, sans toucher à votre portefeuille."
            onClick={() => go("blackjack")}
            art={
              <div className="flex -space-x-5">
                <PlayingCard card="As" size="lg" />
                <PlayingCard card="Kh" size="lg" />
              </div>
            }
          />
          <GameTile
            title="Mes statistiques"
            text="Mains jouées, victoires, meilleure main, évolution de votre solde et historique des parties."
            onClick={() => go("stats")}
            art={<div className="font-marquee text-5xl text-gold">%</div>}
          />
        </section>

      </main>
      <SettingsModal open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}

function GameTile({ title, text, onClick, art }: { title: string; text: string; onClick: () => void; art: React.ReactNode }) {
  return (
    <button onClick={onClick} className="panel flex items-center gap-5 p-5 text-left hover:border-gold/40">
      <div className="grid w-24 shrink-0 place-items-center">{art}</div>
      <div>
        <h2 className="font-marquee text-2xl text-gold">{title}</h2>
        <p className="mt-1 text-sm text-gold-pale/70">{text}</p>
      </div>
    </button>
  );
}
