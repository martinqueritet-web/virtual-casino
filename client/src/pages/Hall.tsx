import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp, go, fmt } from "../state";
import { Marquee } from "../components/Marquee";
import { Avatar, Balance, LowBalanceBar } from "../components/UI";
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
        <LowBalanceBar />
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16">
        <section className="py-8 sm:py-10">
          <Marquee compact />
          <p className="mt-4 text-center text-gold-pale/70">
            Bonsoir {user!.username}. Votre portefeuille contient {fmt(useApp().balance)} VC.
          </p>
          <div className="mx-auto mt-6 grid max-w-5xl grid-cols-5 gap-1.5 sm:gap-2 lg:grid-cols-10">
            {[
              ["🃏", "Poker", () => document.getElementById("poker")?.scrollIntoView({ behavior: "smooth" })],
              ["♠️", "Blackjack", () => go("blackjack")],
              ["🎡", "Roulette", () => go("roulette")],
              ["🂡", "Baccara", () => go("baccara")],
              ["📺", "Vidéo poker", () => go("videopoker")],
              ["💎", "Mines", () => go("mines")],
              ["🔻", "Plinko", () => go("plinko")],
              ["🔢", "Keno", () => go("keno")],
              ["🎯", "Roue", () => go("roue")],
              ["🎰", "Machines", () => document.getElementById("machines")?.scrollIntoView({ behavior: "smooth" })],
            ].map(([icon, label, fn]) => (
              <button key={label as string} onClick={fn as () => void} className="panel flex flex-col items-center gap-1 px-0.5 py-2.5 hover:border-gold/50">
                <span className="text-2xl sm:text-3xl">{icon as string}</span>
                <span className="text-center text-[11px] font-medium leading-tight text-gold-pale sm:text-sm">{label as string}</span>
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

        <section id="jeux" className="mt-12 scroll-mt-20">
          <h2 className="font-marquee text-4xl text-gold">Jeux de casino</h2>
          <p className="mb-5 mt-1 text-gold-pale/75">Tous les résultats sont tirés par le serveur, chaque jeu affiche son taux de retour, et vous misez le montant que vous voulez.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <GameTile
              title="Blackjack"
              text="Battez le croupier sans dépasser 21. Sabot de 6 jeux, assurance, abandon, et un mode entraînement qui corrige vos erreurs."
              onClick={() => go("blackjack")}
              art={
                <div className="flex -space-x-5">
                  <PlayingCard card="As" size="lg" />
                  <PlayingCard card="Kh" size="lg" />
                </div>
              }
            />
            <GameTile
              title="Roulette"
              text="Roulette européenne à un zéro : misez sur un numéro, une couleur, une douzaine… puis lancez la bille."
              onClick={() => go("roulette")}
              art={<RouletteArt />}
            />
            <GameTile
              title="Mines"
              text="25 cases, des diamants et des mines. Chaque diamant fait grimper vos gains : encaissez avant de tomber sur une mine."
              onClick={() => go("mines")}
              art={
                <div className="grid grid-cols-3 gap-1 text-xl" aria-hidden>
                  {Array.from("💎·💎·💣·💎·💎").map((c, i) => (
                    <span key={i} className={`grid h-7 w-7 place-items-center rounded-md ${c === "·" ? "bg-felt-light/60" : "bg-black/40"}`}>
                      {c === "·" ? "" : c}
                    </span>
                  ))}
                </div>
              }
            />
            <GameTile
              title="Plinko"
              text="Lâchez la bille et regardez-la rebondir sur 12 rangées de clous jusqu'à une case de gain. Trois niveaux de risque."
              onClick={() => go("plinko")}
              art={
                <svg viewBox="0 0 80 70" className="w-20" aria-hidden>
                  {[0, 1, 2, 3].map((r) => Array.from({ length: r + 2 }, (_, j) => <circle key={r + "-" + j} cx={40 + (j - (r + 1) / 2) * 14} cy={10 + r * 13} r={2.5} fill="#f3e6c4" />))}
                  {["#c0334a", "#e07b39", "#3f6b5a", "#e07b39", "#c0334a"].map((c, i) => (
                    <rect key={i} x={7 + i * 14} y={60} width={12} height={8} rx={2} fill={c} />
                  ))}
                  <circle cx={47} cy={30} r={4} fill="#e8c46c" />
                </svg>
              }
            />
            <GameTile
              title="Baccara"
              text="Le jeu de cartes préféré des grands casinos : pariez sur le Joueur, la Banque ou l'égalité, le croupier fait le reste."
              onClick={() => go("baccara")}
              art={
                <div className="flex -space-x-5">
                  <PlayingCard card="9d" size="lg" />
                  <PlayingCard card="Kc" size="lg" />
                </div>
              }
            />
            <GameTile
              title="Vidéo poker"
              text="Jacks or Better : 5 cartes, gardez les meilleures, tirez une fois. Une paire de Valets suffit pour gagner. Conseils intégrés."
              onClick={() => go("videopoker")}
              art={<div className="rounded-lg border-2 border-[#1d4fa0] bg-[#0a1a3d] px-2 py-3 font-marquee text-sm text-[#fff36b]">JACKS<br />OR BETTER</div>}
            />
            <GameTile
              title="Keno"
              text="Choisissez de 1 à 10 numéros sur 40, le serveur en tire 10. Plus vous en trouvez, plus vous gagnez, jusqu'à ×22 400."
              onClick={() => go("keno")}
              art={
                <div className="grid grid-cols-4 gap-0.5" aria-hidden>
                  {[7, 12, 3, 21, 9, 33, 18, 40].map((n, i) => (
                    <span key={n} className={`grid h-6 w-6 place-items-center rounded text-[10px] font-bold ${i % 3 === 0 ? "bg-gold text-velvet" : "bg-white/10 text-gold-pale"}`}>
                      {n}
                    </span>
                  ))}
                </div>
              }
            />
            <GameTile
              title="Roue de la fortune"
              text="La grande roue des casinos : misez sur une ou plusieurs cases, de 1 pour 1 jusqu'au joker payé 40 pour 1."
              onClick={() => go("roue")}
              art={<div className="text-5xl">🎯</div>}
            />
          </div>
          <button onClick={() => go("stats")} className="mt-4 text-sm text-gold underline-offset-4 hover:underline">
            Voir mes statistiques
          </button>
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
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
            {machines.map((m) => (
              <button
                key={m.id}
                onClick={() => go("slots/" + m.id)}
                className="group flex flex-col rounded-2xl border-2 p-3 text-left transition-transform hover:-translate-y-1 sm:p-4"
                style={{ background: `linear-gradient(170deg, ${m.palette.from}, ${m.palette.to})`, borderColor: m.palette.accent + "99" }}
              >
                <div className="relative mb-3 grid grid-cols-3 gap-1.5 rounded-xl bg-black p-1.5" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="grid h-10 place-items-center rounded-md bg-gradient-to-b from-[#e9e2cf] via-white to-[#e9e2cf] text-2xl sm:h-14 sm:text-3xl">
                      {m.symbols[0].icon}
                    </span>
                  ))}
                  <span className="pointer-events-none absolute inset-x-1 top-1/2 h-[2px] -translate-y-1/2" style={{ background: m.palette.accent, boxShadow: `0 0 8px ${m.palette.accent}` }} />
                </div>
                <div className="text-base font-semibold leading-tight sm:text-lg" style={{ color: m.palette.accent }}>
                  {m.name}
                </div>
                <div className="text-sm text-gold-pale/65">{m.tagline}</div>
                <div className="mt-1 text-xs text-gold-pale/55">
                  3 × {m.symbols[0].name} = mise × 200
                </div>
                <span className="mt-3 rounded-lg py-1.5 text-center font-semibold text-velvet sm:mt-4 sm:py-2" style={{ background: m.palette.accent }}>
                  Jouer
                </span>
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

function RouletteArt() {
  const n = 18;
  return (
    <svg viewBox="-40 -40 80 80" className="w-20" aria-hidden>
      {Array.from({ length: n }, (_, i) => {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        return <path key={i} d={`M0 0 L${38 * Math.cos(a0)} ${38 * Math.sin(a0)} A38 38 0 0 1 ${38 * Math.cos(a1)} ${38 * Math.sin(a1)} Z`} fill={i === 0 ? "#16794a" : i % 2 ? "#b3283d" : "#151515"} stroke="#d9b45a" strokeWidth="0.5" />;
      })}
      <circle r="20" fill="#7a5a1e" stroke="#d9b45a" />
      <circle r="5" fill="#f3e6c4" />
    </svg>
  );
}
