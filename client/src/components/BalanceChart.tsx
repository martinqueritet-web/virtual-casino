import { useEffect, useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts";
import { api } from "../api";
import { fmt } from "../state";

// Couleurs gain / perte validées (daltonisme, contraste) ; le signe + / − accompagne toujours la couleur.
const GAIN = "#2f9e8f";
const LOSS = "#e06a4f";
const LINE = "#d9b45a";

const RANGES = [
  ["1h", "1 h"],
  ["24h", "24 h"],
  ["7d", "7 jours"],
  ["30d", "30 jours"],
  ["all", "Depuis toujours"],
] as const;
type Range = (typeof RANGES)[number][0];

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n))}`;

function tickFormat(range: Range, span: number) {
  return (t: number) => {
    const d = new Date(t);
    if (range === "1h" || range === "24h" || (range === "all" && span < 2 * 8.64e7)) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  };
}

/** Graduations régulières sur la période (au plus `n`). */
function timeTicks(from: number, to: number, n: number) {
  if (to <= from) return [from];
  return Array.from({ length: n }, (_, i) => Math.round(from + ((to - from) * i) / (n - 1)));
}

export function BalanceChart({ refreshKey = 0 }: { refreshKey?: number }) {
  const [range, setRange] = useState<Range>(() => {
    try {
      return (localStorage.getItem("vc_balance_range") as Range) || "24h";
    } catch {
      return "24h";
    }
  });
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api(`/stats/balance?range=${range}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
    try {
      localStorage.setItem("vc_balance_range", range);
    } catch {
      /* ignoré */
    }
  }, [range, refreshKey]);

  // courbe en escalier : départ de la période, chaque mouvement, puis maintenant
  const series = useMemo(() => {
    if (!data) return [];
    return [{ t: data.from, balance: data.startBalance }, ...data.points.map((p: any) => ({ t: p.t, balance: p.balance })), { t: data.to, balance: data.balance }].filter((p) => p.t >= data.from);
  }, [data]);

  const s = data?.summary;
  const maxAbs = Math.max(1, ...(data?.byGame ?? []).map((g: any) => Math.abs(g.net)));
  const label = RANGES.find((r) => r[0] === range)![1];

  return (
    <section className="panel p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-gold-pale">Évolution du solde</h2>
        <div className="flex gap-1 rounded-lg bg-black/40 p-1" role="radiogroup" aria-label="Période">
          {RANGES.map(([id, name]) => (
            <button key={id} role="radio" aria-label={name} aria-checked={range === id} onClick={() => setRange(id)} className={`rounded-md px-2.5 py-1.5 text-xs sm:px-3 sm:text-sm ${range === id ? "bg-felt text-gold-pale" : "text-gold-pale/60 hover:text-gold-pale"}`}>
              <span className={id === "all" ? "hidden sm:inline" : ""}>{name}</span>
              {id === "all" && <span className="sm:hidden">Tout</span>}
            </button>
          ))}
        </div>
      </div>

      {data && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile title={`Variation (${range === "all" ? "depuis le début" : label})`}>
            <span style={{ color: s.change > 0 ? GAIN : s.change < 0 ? LOSS : undefined }}>
              {s.change > 0 ? "▲ " : s.change < 0 ? "▼ " : ""}
              {signed(s.change)} VC
            </span>
          </Tile>
          <Tile title="Plus haut">{fmt(s.high)} VC</Tile>
          <Tile title="Plus bas">{fmt(s.low)} VC</Tile>
          <Tile title="Mouvements">
            {fmt(s.moves)}
            {s.resets > 0 && <span className="ml-1 text-xs font-normal text-gold-pale/50">dont {s.resets} remise{s.resets > 1 ? "s" : ""} à 500</span>}
          </Tile>
        </div>
      )}

      <div className={`h-60 transition-opacity ${loading ? "opacity-40" : ""}`}>
        {data && (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="soldeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={LINE} stopOpacity={0.28} />
                  <stop offset="1" stopColor={LINE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(217,180,90,.08)" vertical={false} />
              <XAxis dataKey="t" type="number" domain={[data.from, data.to]} ticks={timeTicks(data.from, data.to, 5)} tickFormatter={tickFormat(range, data.to - data.from)} stroke="rgba(243,230,196,.4)" fontSize={11} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis stroke="rgba(243,230,196,.4)" fontSize={11} tickLine={false} axisLine={false} width={52} domain={["auto", "auto"]} tickFormatter={(v) => fmt(v)} />
              <ReferenceLine y={data.startBalance} stroke="rgba(243,230,196,.25)" strokeDasharray="4 4" />
              <Tooltip
                cursor={{ stroke: "rgba(243,230,196,.35)", strokeWidth: 1 }}
                contentStyle={{ background: "#04110c", border: "1px solid rgba(217,180,90,.3)", borderRadius: 8 }}
                labelStyle={{ color: "#f3e6c4" }}
                itemStyle={{ color: "#f3e6c4" }}
                labelFormatter={(t) => new Date(Number(t)).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                formatter={(v) => [`${fmt(Number(v))} VC`, "Solde"]}
              />
              <Area type="stepAfter" dataKey="balance" stroke={LINE} strokeWidth={2} fill="url(#soldeFill)" isAnimationActive={false} activeDot={{ r: 4, stroke: "#04110c", strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      {data && data.points.length === 0 && <p className="mt-1 text-center text-sm text-gold-pale/60">Aucun mouvement sur cette période : votre solde est resté à {fmt(data.balance)} VC.</p>}
      <p className="mt-1 text-[11px] text-gold-pale/45">La ligne pointillée marque votre solde au début de la période.</p>

      {data?.byGame?.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold text-gold-pale">Bilan par jeu ({range === "all" ? "depuis le début" : `sur ${label}`})</h3>
          <ul className="space-y-1.5" aria-label="Gains et pertes par jeu">
            {data.byGame.map((g: any) => {
              const w = (Math.abs(g.net) / maxAbs) * 50;
              return (
                <li key={g.game} className="grid grid-cols-[7.5rem_1fr_5.5rem] items-center gap-2 text-sm sm:grid-cols-[10rem_1fr_6rem]" title={`${g.game} : ${signed(g.net)} VC`}>
                  <span className="truncate text-gold-pale/80">{g.game}</span>
                  <span className="relative h-3 rounded bg-white/5">
                    <span className="absolute inset-y-0 left-1/2 w-px bg-gold-pale/30" />
                    {g.net !== 0 && <span className="absolute inset-y-0 rounded-[4px]" style={{ background: g.net > 0 ? GAIN : LOSS, width: `${w}%`, left: g.net > 0 ? "50%" : `${50 - w}%` }} />}
                  </span>
                  <span className="text-right font-semibold tabular-nums" style={{ color: g.net > 0 ? GAIN : g.net < 0 ? LOSS : undefined }}>
                    {signed(g.net)} VC
                  </span>
                </li>
              );
            })}
          </ul>
          {data.byGame.some((g: any) => g.game === "Poker") && <p className="mt-2 text-[11px] text-gold-pale/45">Poker : les jetons encore posés sur une table comptent comme misés tant que vous ne les avez pas récupérés.</p>}
        </div>
      )}
    </section>
  );
}

function Tile({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-black/35 px-3 py-2">
      <div className="text-[11px] text-gold-pale/55">{title}</div>
      <div className="text-lg font-semibold tabular-nums text-gold-pale">{children}</div>
    </div>
  );
}
