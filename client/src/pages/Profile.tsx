import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp, fmt } from "../state";
import { TopBar, Avatar } from "../components/UI";
import { SettingsModal } from "../components/Settings";
import { BalanceChart } from "../components/BalanceChart";

const COLORS = ["#d9b45a", "#c0334a", "#1c8064", "#4f7bd9", "#9b59d0", "#e07b39", "#3fb6b0", "#e8e2d0"];
const GAME_FR: Record<string, string> = { poker: "Poker", blackjack: "Blackjack", slots: "Machines à sous", mines: "Mines", roulette: "Roulette", plinko: "Plinko", baccara: "Baccara", videopoker: "Vidéo poker", keno: "Keno", roue: "Roue de la fortune" };

export function ProfilePage() {
  const { user, avatars, updateUser, toast, signOut, setBalance } = useApp();
  const [data, setData] = useState<any>(null);
  const [settings, setSettings] = useState(false);
  const [tables, setTables] = useState<{ code: string; stack: number; inHand: number; member: boolean }[]>([]);

  const load = () => {
    api("/me/tables").then((r) => setTables(r.tables)).catch(() => {});
    return api("/stats").then((r) => (setData(r), setBalance(r.balance)));
  };
  const reclaim = async () => {
    try {
      const r = await api("/me/tables/reclaim", { method: "POST" });
      setTables(r.tables);
      setBalance(r.balance);
      toast(r.pending.length ? `Une main est encore en cours au salon ${r.pending.join(", ")} : vos jetons reviendront dès qu'elle se termine.` : "Vos jetons sont revenus dans votre portefeuille", r.pending.length ? "info" : "win");
      load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  useEffect(() => {
    load();
  }, []); // eslint-disable-line

  const patch = async (body: object) => {
    try {
      const r = await api("/me", { method: "PATCH", body });
      updateUser(r.user);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };
  const reset = async () => {
    if (!confirm("Remettre votre portefeuille à 500 VC ? Cette action est gratuite.")) return;
    try {
      const r = await api("/wallet/reset", { method: "POST" });
      setBalance(r.balance);
      toast("Portefeuille réinitialisé à 500 VC");
      load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const s = data?.stats;
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : "—");

  return (
    <div className="min-h-dvh">
      <TopBar title="Profil" />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <section className="panel flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
          <Avatar emoji={user!.avatar} color={user!.avatar_color} size={88} />
          <div className="flex-1">
            <h1 className="font-marquee text-4xl text-gold">{user!.username}</h1>
            <p className="text-sm text-gold-pale/60">Membre depuis le {new Date(user!.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-ghost px-3 py-1.5 text-sm" onClick={() => setSettings(true)}>
                Préférences
              </button>
              <button className="btn-ghost px-3 py-1.5 text-sm" onClick={reset}>
                Réinitialiser à 500 VC
              </button>
              <button className="btn-ghost px-3 py-1.5 text-sm" onClick={signOut}>
                Se déconnecter
              </button>
            </div>
          </div>
        </section>

        {tables.length > 0 && (
          <section className="rounded-xl border border-gold/50 bg-gold/10 p-5">
            <h2 className="font-semibold text-gold">Vous avez des jetons sur une table de poker</h2>
            <ul className="mt-2 space-y-1 text-sm text-gold-pale/85">
              {tables.map((t) => (
                <li key={t.code} className="flex flex-wrap items-center gap-x-3">
                  <span>
                    Salon {t.code} : <b>{fmt(t.stack)} VC</b> sur votre tapis{t.inHand ? ` (et ${fmt(t.inHand)} VC misés dans la main en cours)` : ""}
                  </span>
                  {t.member && (
                    <button className="text-gold underline-offset-2 hover:underline" onClick={() => (location.hash = "#/room/" + t.code)}>
                      Ouvrir la table
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <button className="btn-gold mt-3" onClick={reclaim}>
              Récupérer mes jetons
            </button>
            <p className="mt-2 text-xs text-gold-pale/60">Si une main est en cours, vous vous couchez et vos jetons reviennent dès qu'elle se termine. Les joueurs absents jouent automatiquement.</p>
          </section>
        )}

        <section className="panel p-5">
          <h2 className="mb-3 font-semibold text-gold-pale">Avatar</h2>
          <div className="flex flex-wrap gap-2">
            {avatars.map((a) => (
              <button key={a} onClick={() => patch({ avatar: a })} className={`grid h-11 w-11 place-items-center rounded-full text-2xl ${user!.avatar === a ? "bg-gold/25 ring-2 ring-gold" : "bg-black/40 hover:bg-white/10"}`} aria-label={`Choisir l'avatar ${a}`} aria-pressed={user!.avatar === a}>
                {a}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button key={c} onClick={() => patch({ avatarColor: c })} className={`h-8 w-8 rounded-full ${user!.avatar_color === c ? "ring-2 ring-white ring-offset-2 ring-offset-lounge" : ""}`} style={{ background: c }} aria-label={`Couleur ${c}`} />
            ))}
          </div>
        </section>

        {s && (
          <>
            <BalanceChart refreshKey={data.balance} />

            <section className="grid gap-4 md:grid-cols-3">
              <StatCard
                title="Poker"
                rows={[
                  ["Mains jouées", fmt(s.poker_hands)],
                  ["Mains gagnées", `${fmt(s.poker_won)} (${pct(s.poker_won, s.poker_hands)})`],
                  ["Abattages gagnés", `${fmt(s.poker_showdowns_won)} / ${fmt(s.poker_showdowns)}`],
                  ["Mains jouées volontairement", pct(s.poker_vpip, s.poker_hands)],
                  ["Plus gros pot", `${fmt(s.poker_biggest_pot)} VC`],
                  ["Meilleure main", s.poker_best_label ?? "—"],
                  ["Bilan", `${s.poker_net > 0 ? "+" : ""}${fmt(s.poker_net)} VC`],
                ]}
              />
              <StatCard
                title="Blackjack"
                rows={[
                  ["Manches", fmt(s.bj_rounds)],
                  ["Victoires", fmt(s.bj_wins)],
                  ["Défaites", fmt(s.bj_losses)],
                  ["Égalités", fmt(s.bj_pushes)],
                  ["Blackjacks", fmt(s.bj_blackjacks)],
                  ["Bilan", `${s.bj_net > 0 ? "+" : ""}${fmt(s.bj_net)} VC`],
                  ["Entraînement : bonnes décisions", pct(s.bj_practice_correct, s.bj_practice_decisions)],
                ]}
              />
              <StatCard
                title="Mines"
                rows={[
                  ["Parties", fmt(s.mines_rounds ?? 0)],
                  ["Meilleur multiplicateur", `×${Number(s.mines_best_mult ?? 0).toFixed(2)}`],
                  ["Bilan", `${s.mines_net > 0 ? "+" : ""}${fmt(s.mines_net ?? 0)} VC`],
                ]}
              />
              <StatCard
                title="Roulette"
                rows={[
                  ["Tours", fmt(s.roulette_spins ?? 0)],
                  ["Bilan", `${s.roulette_net > 0 ? "+" : ""}${fmt(s.roulette_net ?? 0)} VC`],
                ]}
              />
              <StatCard
                title="Plinko"
                rows={[
                  ["Billes lâchées", fmt(s.plinko_drops ?? 0)],
                  ["Meilleur multiplicateur", `×${Number(s.plinko_best_mult ?? 0)}`],
                  ["Bilan", `${s.plinko_net > 0 ? "+" : ""}${fmt(s.plinko_net ?? 0)} VC`],
                ]}
              />
              <StatCard
                title="Baccara"
                rows={[
                  ["Coups", fmt(s.baccarat_coups ?? 0)],
                  ["Bilan", `${s.baccarat_net > 0 ? "+" : ""}${fmt(s.baccarat_net ?? 0)} VC`],
                ]}
              />
              <StatCard
                title="Vidéo poker"
                rows={[
                  ["Mains", fmt(s.vp_hands ?? 0)],
                  ["Meilleure main", s.vp_best ?? "—"],
                  ["Bilan", `${s.vp_net > 0 ? "+" : ""}${fmt(s.vp_net ?? 0)} VC`],
                ]}
              />
              <StatCard
                title="Keno"
                rows={[
                  ["Tirages", fmt(s.keno_draws ?? 0)],
                  ["Record de numéros trouvés", fmt(s.keno_best_hits ?? 0)],
                  ["Bilan", `${s.keno_net > 0 ? "+" : ""}${fmt(s.keno_net ?? 0)} VC`],
                ]}
              />
              <StatCard
                title="Roue de la fortune"
                rows={[
                  ["Tours", fmt(s.wheel_spins ?? 0)],
                  ["Bilan", `${s.wheel_net > 0 ? "+" : ""}${fmt(s.wheel_net ?? 0)} VC`],
                ]}
              />
              <StatCard
                title="Machines à sous"
                rows={[
                  ["Tours joués", fmt(s.slots_spins)],
                  ["Plus gros gain", `${fmt(s.slots_biggest_win)} VC`],
                  ["Bilan", `${s.slots_net > 0 ? "+" : ""}${fmt(s.slots_net)} VC`],
                ]}
              />
            </section>

            <section className="panel p-5">
              <h2 className="mb-3 font-semibold text-gold-pale">Historique des parties</h2>
              {data.history.length === 0 ? (
                <p className="text-sm text-gold-pale/60">Aucune partie pour l'instant. Une main de poker ou de blackjack apparaîtra ici.</p>
              ) : (
                <ul className="divide-y divide-gold/10 text-sm">
                  {data.history.map((h: any, i: number) => (
                    <li key={i} className="flex items-center gap-3 py-2">
                      <span className="w-28 shrink-0 text-gold-pale/50">{new Date(h.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="w-32 shrink-0">{GAME_FR[h.game] ?? h.game}</span>
                      <span className="flex-1 truncate text-gold-pale/70">{h.detail?.label ?? h.detail?.message ?? h.detail?.machine ?? h.result}</span>
                      <span className={`tabular-nums ${h.net > 0 ? "text-gold" : h.net < 0 ? "text-[#ff9aa9]" : "text-gold-pale/60"}`}>
                        {h.net > 0 ? "+" : ""}
                        {fmt(h.net)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
        <p className="text-center text-xs text-gold-pale/45">Les VC sont des crédits fictifs, sans valeur monétaire.</p>
      </main>
      <SettingsModal open={settings} onClose={() => setSettings(false)} />
    </div>
  );
}

function StatCard({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div className="panel p-5">
      <h2 className="mb-3 font-marquee text-2xl text-gold">{title}</h2>
      <dl className="space-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3">
            <dt className="text-gold-pale/60">{k}</dt>
            <dd className="text-right tabular-nums text-gold-pale">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
