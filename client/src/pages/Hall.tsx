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
  symbols: { icon: string }[];
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
        </section>

        {/* Jouer avec mes amis : l'action principale du casino */}
        <section className="felt relative overflow-hidden rounded-[28px] border-4 border-[#3a2412] p-6 shadow-[0_20px_60px_rgba(0,0,0,.6)] sm:p-8" style={{ ["--felt" as string]: "#0e5c46", ["--felt-hi" as string]: "#1c8064", ["--felt-lo" as string]: "#053425" }}>
          <div className="relative z-10 grid gap-8 md:grid-cols-[1.3fr_1fr] md:items-center">
            <div>
              <h1 className="font-marquee text-4xl text-gold-pale sm:text-5xl">Jouer avec mes amis</h1>
              <p className="mt-3 max-w-md text-gold-pale/80">
                Ouvrez un salon privé de poker Texas Hold'em, partagez le code ou le QR code, et jouez ensemble de 2 à 9 joueurs.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <button className="btn-gold px-6 py-3 text-base" onClick={create} disabled={busy}>
                  Créer un salon
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

        <section className="mt-10">
          <h2 className="mb-4 font-marquee text-3xl text-gold">Machines à sous</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {machines.map((m) => (
              <button
                key={m.id}
                onClick={() => go("slots/" + m.id)}
                className="group rounded-xl border p-4 text-left transition-transform hover:-translate-y-0.5"
                style={{ background: `linear-gradient(160deg, ${m.palette.from}, ${m.palette.to})`, borderColor: m.palette.accent + "55" }}
              >
                <div className="mb-3 flex gap-1 text-3xl" aria-hidden>
                  {m.symbols.slice(0, 3).map((s, i) => (
                    <span key={i}>{s.icon}</span>
                  ))}
                </div>
                <div className="font-semibold" style={{ color: m.palette.accent }}>
                  {m.name}
                </div>
                <div className="text-xs text-gold-pale/60">{m.tagline}</div>
              </button>
            ))}
          </div>
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
