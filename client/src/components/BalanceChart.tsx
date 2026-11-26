import { useEffect, useMemo, useRef, useState } from "react";
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
type Win = { from: number; to: number };
const MIN_WINDOW = 10_000; // on ne zoome pas en dessous de 10 secondes

const fmtWhen = (t: number, w: number) => {
  const d = new Date(t);
  const today = d.toDateString() === new Date().toDateString();
  return d.toLocaleString("fr-FR", { ...(today ? {} : { day: "2-digit", month: "short" }), hour: "2-digit", minute: "2-digit", ...(w < 15 * 60_000 ? { second: "2-digit" } : {}) });
};

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
  // zoom : fenêtre affichée (null = toute la période) et bornes de la période complète
  const [zoom, setZoom] = useState<Win | null>(null);
  const [outer, setOuter] = useState<Win | null>(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<{ a: number; b: number } | null>(null);
  const [pinch, setPinch] = useState<{ scale: number; origin: number } | null>(null);
  const pinchRef = useRef<{ d0: number; mid: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    // petite attente : la molette ou les boutons enchaînés ne font qu'une requête
    const timer = setTimeout(() => {
      api(`/stats/balance?range=${range}${zoom ? `&from=${Math.round(zoom.from)}&to=${Math.round(zoom.to)}` : ""}`)
        .then((d) => {
          if (!alive) return;
          setData(d);
          if (!zoom) setOuter({ from: d.from, to: d.to });
        })
        .catch(() => alive && !zoom && setData(null))
        .finally(() => alive && setLoading(false));
    }, zoom ? 150 : 0);
    try {
      localStorage.setItem("vc_balance_range", range);
    } catch {
      /* ignoré */
    }
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [range, refreshKey, zoom]);

  // fenêtre visible tout de suite (même avant la réponse du serveur)
  const view: Win | null = zoom ?? outer ?? (data ? { from: data.from, to: data.to } : null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const applyZoom = (from: number, to: number) => {
    const o = outer;
    if (!o) return;
    let w = Math.max(to - from, MIN_WINDOW);
    if (w >= (o.to - o.from) * 0.98) return setZoom(null), setHover(null);
    from = Math.min(Math.max(from, o.from), o.to - w);
    setZoom({ from, to: from + w });
    setHover(null);
  };
  const zoomBy = (factor: number, center?: number) => {
    const v = viewRef.current;
    if (!v) return;
    const c = center ?? hover?.t ?? (v.from + v.to) / 2;
    const rel = (c - v.from) / (v.to - v.from);
    const w = (v.to - v.from) * factor;
    applyZoom(c - rel * w, c - rel * w + w);
  };
  const pan = (dir: number) => {
    const v = viewRef.current;
    if (v) applyZoom(v.from + dir * (v.to - v.from) * 0.5, v.to + dir * (v.to - v.from) * 0.5);
  };
  const fracAt = (clientX: number) => {
    const r = boxRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };
  const timeAt = (f: number) => (view ? view.from + f * (view.to - view.from) : 0);

  // ordinateur : Ctrl + molette, ou pincement sur le pavé tactile du Mac
  const zoomByRef = useRef(zoomBy);
  zoomByRef.current = zoomBy;
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const v = viewRef.current;
      if (!v) return;
      const r = el.getBoundingClientRect();
      const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      zoomByRef.current(Math.exp(Math.max(-0.5, Math.min(0.5, e.deltaY * 0.01))), v.from + f * (v.to - v.from));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [data !== null]);

  const changeRange = (id: Range) => {
    setRange(id);
    setZoom(null);
    setOuter(null);
    setHover(null);
  };

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
  const win = view ? view.to - view.from : 3.6e6;
  const touch = typeof window !== "undefined" && "ontouchstart" in window;
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
          {hover ? `${new Date(hover.t).toDateString() === new Date().toDateString() ? "à" : "le"} ${fmtWhen(hover.t, win)}` : zoom ? `de ${fmtWhen(zoom.from, win)} à ${fmtWhen(zoom.to, win)}` : label[2]}
        </span>
      </p>

      <div className="mt-3 flex items-center gap-1.5">
        <p className="mr-auto text-xs text-gold-pale/45">{zoom ? "Zoom actif" : touch ? "Pincez la courbe pour zoomer" : "Sélectionnez une zone de la courbe pour zoomer"}</p>
        {zoom && (
          <>
            <ZoomBtn label="Reculer dans le temps" onClick={() => pan(-1)} disabled={!!outer && zoom.from <= outer.from + 1}>◀</ZoomBtn>
            <ZoomBtn label="Avancer dans le temps" onClick={() => pan(1)} disabled={!!outer && zoom.to >= outer.to - 1}>▶</ZoomBtn>
          </>
        )}
        <ZoomBtn label="Dézoomer" onClick={() => zoomBy(2)} disabled={!zoom}>−</ZoomBtn>
        <ZoomBtn label="Zoomer" onClick={() => zoomBy(0.5)} disabled={win <= MIN_WINDOW * 1.05}>+</ZoomBtn>
        {zoom && (
          <button onClick={() => (setZoom(null), setHover(null))} className="ml-1 rounded-full border border-gold/25 px-3 py-1 text-xs font-semibold text-gold-pale/80 hover:border-gold/60 hover:text-gold-pale">
            Tout voir
          </button>
        )}
      </div>

      <div
        ref={boxRef}
        className={`relative -mx-2 mt-2 h-52 select-none overflow-hidden transition-opacity sm:h-64 ${loading && zoom ? "opacity-70" : ""}`}
        style={{ touchAction: "pan-y", cursor: sel ? "col-resize" : "crosshair" }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button === 0) {
            const f = fracAt(e.clientX);
            setSel({ a: f, b: f });
          }
        }}
        onPointerMove={(e) => sel && setSel({ ...sel, b: fracAt(e.clientX) })}
        onPointerUp={() => {
          if (sel && Math.abs(sel.a - sel.b) > 0.02) applyZoom(timeAt(Math.min(sel.a, sel.b)), timeAt(Math.max(sel.a, sel.b)));
          setSel(null);
        }}
        onPointerLeave={() => setSel(null)}
        onDoubleClick={(e) => zoomBy(0.5, timeAt(fracAt(e.clientX)))}
        onTouchStart={(e) => {
          if (e.touches.length === 2) {
            const [a, b] = [e.touches[0], e.touches[1]];
            const mid = fracAt((a.clientX + b.clientX) / 2);
            pinchRef.current = { d0: Math.max(20, Math.abs(a.clientX - b.clientX)), mid };
            setPinch({ scale: 1, origin: mid });
            setHover(null);
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 2 && pinchRef.current) {
            const d = Math.max(20, Math.abs(e.touches[0].clientX - e.touches[1].clientX));
            setPinch({ scale: Math.min(20, Math.max(0.1, d / pinchRef.current.d0)), origin: pinchRef.current.mid });
          }
        }}
        onTouchEnd={(e) => {
          if (pinchRef.current && e.touches.length < 2) {
            const scale = pinch?.scale ?? 1;
            if (Math.abs(scale - 1) > 0.08) zoomBy(1 / scale, timeAt(pinchRef.current.mid));
            pinchRef.current = null;
            setPinch(null);
          }
        }}
      >
        {sel && Math.abs(sel.a - sel.b) > 0.005 && (
          <div className="pointer-events-none absolute inset-y-0 z-10 border-x border-gold-pale/50 bg-gold-pale/10" style={{ left: `${Math.min(sel.a, sel.b) * 100}%`, width: `${Math.abs(sel.a - sel.b) * 100}%` }} />
        )}
        <div className="h-full w-full" style={pinch ? { transform: `scaleX(${pinch.scale})`, transformOrigin: `${pinch.origin * 100}% 50%` } : undefined}>
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
            <XAxis dataKey="t" type="number" domain={[view!.from, view!.to]} allowDataOverflow hide />
            <YAxis domain={["dataMin - 5", "dataMax + 5"]} hide />
            {/* le niveau de départ, comme la « clôture précédente » en bourse */}
            <ReferenceLine y={data.startBalance} stroke="rgba(243,230,196,.3)" strokeDasharray="2 4" />
            <Tooltip content={() => null} cursor={{ stroke: "rgba(243,230,196,.45)", strokeWidth: 1 }} />
            <Area type="monotone" dataKey="balance" stroke={color} strokeWidth={2.5} fill="url(#bourseFill)" isAnimationActive={false} dot={false} activeDot={{ r: 5, fill: color, stroke: "#04110c", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-3 flex justify-between gap-1" role="radiogroup" aria-label="Période">
        {RANGES.map(([id, short, long]) => (
          <button
            key={id}
            role="radio"
            aria-checked={range === id && !zoom}
            aria-label={long}
            onClick={() => changeRange(id)}
            className={`flex-1 rounded-full py-1.5 text-sm font-semibold transition-colors ${range === id ? (zoom ? "text-gold-pale" : "text-velvet") : "text-gold-pale/60 hover:text-gold-pale"}`}
            style={range === id ? (zoom ? { boxShadow: `inset 0 0 0 1.5px ${color}` } : { background: color }) : undefined}
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

function ZoomBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="grid h-8 w-8 place-items-center rounded-full border border-gold/25 text-base font-semibold text-gold-pale/85 transition-colors hover:border-gold/60 hover:text-gold-pale disabled:opacity-30 disabled:hover:border-gold/25"
    >
      {children}
    </button>
  );
}
