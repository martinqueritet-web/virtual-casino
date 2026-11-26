import { useEffect, useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { api } from "../api";
import { fmt } from "../state";

// Couleurs hausse / baisse validées (daltonisme, contraste) ; le signe + / − et la flèche accompagnent toujours la couleur.
const UP = "#2f9e8f";
const DOWN = "#e06a4f";
const FLAT = "#d9b45a";

const RANGES = [
  ["1h", "1H", "sur 1 heure"],
  ["24h", "24H", "sur 24 heures"],
  ["7d", "7J", "sur 7 jours"],
  ["30d", "1M", "sur 30 jours"],
  ["all", "Tout", "depuis le début"],
] as const;
type Range = (typeof RANGES)[number][0];

const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${fmt(Math.abs(n))}`;
const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

/** Solde façon appli de bourse : gros chiffre, variation, courbe épurée, périodes. */
export function BalanceChart({ refreshKey = 0 }: { refreshKey?: number }) {
  const [range, setRange] = useState<Range>(() => {
    try {
      return (localStorage.getItem("vc_balance_range") as Range) || "24h";
    } catch {
      return "24h";
    }
  });
  const [data, setData] = useState<any>(null);
  const [hover, setHover] = useState<{ t: number; balance: number } | null>(null);

  useEffect(() => {
    api(`/stats/balance?range=${range}`)
      .then(setData)
      .catch(() => setData(null));
    try {
      localStorage.setItem("vc_balance_range", range);
    } catch {
      /* ignoré */
    }
  }, [range, refreshKey]);

  const series = useMemo(() => {
    if (!data) return [];
    return [{ t: data.from, balance: data.startBalance }, ...data.points.map((p: any) => ({ t: p.t, balance: p.balance })), { t: data.to, balance: data.balance }].filter((p) => p.t >= data.from);
  }, [data]);

  if (!data) return <section className="panel h-[340px] p-5" aria-busy="true" />;

  // valeur affichée : le point survolé, sinon le solde actuel
  const shown = hover?.balance ?? data.balance;
  const change = shown - data.startBalance;
  const changePct = data.startBalance > 0 ? (change / data.startBalance) * 100 : 0;
  const trend = data.balance - data.startBalance;
  const color = trend > 0 ? UP : trend < 0 ? DOWN : FLAT;
  const label = RANGES.find((r) => r[0] === range)!;
  const moveColor = change > 0 ? UP : change < 0 ? DOWN : undefined;
  const maxAbs = Math.max(1, ...(data.byGame ?? []).map((g: any) => Math.abs(g.net)));

  return (
    <section className="panel p-5">
      <p className="text-sm text-gold-pale/60">Mon solde</p>
      <p className="font-marquee text-4xl tabular-nums text-gold-pale sm:text-5xl" aria-live="polite">
        {fmt(shown)} <span className="text-2xl text-gold/70">VC</span>
      </p>
      <p className="mt-1 text-sm font-semibold tabular-nums" style={{ color: moveColor }}>
        {change > 0 ? "▲" : change < 0 ? "▼" : "■"} {signed(change)} VC ({pct(changePct)})
        <span className="ml-1.5 font-normal text-gold-pale/55">
          {hover ? `le ${new Date(hover.t).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}` : label[2]}
        </span>
      </p>

      <div className="-mx-2 mt-4 h-52 sm:h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={series}
            margin={{ left: 0, right: 0, top: 6, bottom: 0 }}
            onMouseMove={(e: any) => {
              // recharts 3 : on reçoit l'index du point survolé (souris ou doigt)
              const i = e?.activeIndex ?? e?.activeTooltipIndex;
              const p = i !== undefined && i !== null ? series[Number(i)] : e?.activePayload?.[0]?.payload;
              if (p) setHover(p);
            }}
            onMouseLeave={() => setHover(null)}
            onTouchEnd={() => setHover(null)}
          >
            <defs>
              <linearGradient id="bourseFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity={0.3} />
                <stop offset="1" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" type="number" domain={[data.from, data.to]} hide />
            <YAxis domain={["dataMin - 5", "dataMax + 5"]} hide />
            {/* le niveau de départ, comme la « clôture précédente » en bourse */}
            <ReferenceLine y={data.startBalance} stroke="rgba(243,230,196,.3)" strokeDasharray="2 4" />
            <Tooltip content={() => null} cursor={{ stroke: "rgba(243,230,196,.45)", strokeWidth: 1 }} />
            <Area type="monotone" dataKey="balance" stroke={color} strokeWidth={2.5} fill="url(#bourseFill)" isAnimationActive={false} dot={false} activeDot={{ r: 5, fill: color, stroke: "#04110c", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-3 flex justify-between gap-1" role="radiogroup" aria-label="Période">
        {RANGES.map(([id, short, long]) => (
          <button
            key={id}
            role="radio"
            aria-checked={range === id}
            aria-label={long}
            onClick={() => (setRange(id), setHover(null))}
            className={`flex-1 rounded-full py-1.5 text-sm font-semibold transition-colors ${range === id ? "text-velvet" : "text-gold-pale/60 hover:text-gold-pale"}`}
            style={range === id ? { background: color } : undefined}
          >
            {short}
          </button>
        ))}
      </div>

      {data.byGame?.length > 0 && (
        <details className="mt-4 border-t border-gold/10 pt-3">
          <summary className="cursor-pointer text-sm text-gold/80 hover:text-gold">Détail par jeu {label[2]}</summary>
          <ul className="mt-3 space-y-1.5" aria-label="Gains et pertes par jeu">
            {data.byGame.map((g: any) => (
              <li key={g.game} className="grid grid-cols-[7.5rem_1fr_5.5rem] items-center gap-2 text-sm sm:grid-cols-[10rem_1fr_6rem]">
                <span className="truncate text-gold-pale/80">{g.game}</span>
                <span className="relative h-2.5 rounded bg-white/5">
                  <span className="absolute inset-y-0 left-1/2 w-px bg-gold-pale/30" />
                  {g.net !== 0 && <span className="absolute inset-y-0 rounded-[4px]" style={{ background: g.net > 0 ? UP : DOWN, width: `${(Math.abs(g.net) / maxAbs) * 50}%`, left: g.net > 0 ? "50%" : `${50 - (Math.abs(g.net) / maxAbs) * 50}%` }} />}
                </span>
                <span className="text-right font-semibold tabular-nums" style={{ color: g.net > 0 ? UP : g.net < 0 ? DOWN : undefined }}>
                  {signed(g.net)} VC
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
