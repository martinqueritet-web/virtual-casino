import { useEffect, useState } from "react";
import { useApp, fmt } from "../state";

export const MAX_BET = 100_000;

/**
 * Champ de montant libre : on tape le nombre qu'on veut, il n'est corrigé
 * (entre 1 et le plafond) qu'en quittant le champ.
 */
export function AmountField({ value, onChange, max, disabled = false, id, label }: { value: number; onChange: (n: number) => void; max: number; disabled?: boolean; id?: string; label?: string }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const cap = Math.max(1, max);
  const commit = (raw: string) => {
    const n = Math.floor(Number(raw.replace(/\s/g, "").replace(",", ".")));
    const v = Number.isFinite(n) && n >= 1 ? Math.min(cap, n) : value;
    setText(String(v));
    if (v !== value) onChange(v);
  };
  return (
    <div className="relative flex-1">
      <input
        id={id}
        aria-label={label}
        type="text"
        inputMode="numeric"
        className="input pr-10 font-semibold tabular-nums"
        value={text}
        disabled={disabled}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d\s]/g, "");
          setText(t);
          const n = Math.floor(Number(t.replace(/\s/g, "")));
          if (n >= 1 && n <= cap) onChange(n);
        }}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && commit((e.target as HTMLInputElement).value)}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gold/70">VC</span>
    </div>
  );
}

/** Saisie de mise commune : montant libre, ½, ×2, Max, raccourcis. */
export function BetInput({ value, onChange, max = MAX_BET, disabled = false }: { value: number; onChange: (n: number) => void; max?: number; disabled?: boolean }) {
  const { balance } = useApp();
  const cap = Math.max(1, Math.min(max, balance));
  const set = (n: number) => onChange(Math.max(1, Math.min(cap, Math.floor(n) || 1)));
  return (
    <div>
      <label className="mb-1 flex justify-between text-sm text-gold-pale/70" htmlFor="bet">
        <span>Mise (montant libre)</span>
        <span className="text-xs text-gold-pale/45">max {fmt(cap)}</span>
      </label>
      <div className="flex gap-1.5">
        <AmountField id="bet" value={value} onChange={onChange} max={cap} disabled={disabled} />
        <button className="btn-ghost px-3" disabled={disabled} onClick={() => set(value / 2)} aria-label="Diviser la mise par deux">
          ½
        </button>
        <button className="btn-ghost px-3" disabled={disabled} onClick={() => set(value * 2)} aria-label="Doubler la mise">
          ×2
        </button>
        <button className="btn-ghost px-3 text-sm" disabled={disabled} onClick={() => set(cap)} aria-label="Miser le maximum">
          Max
        </button>
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {[1, 10, 50, 100, 500].map((n) => (
          <button key={n} className="flex-1 rounded-md border border-gold/20 py-1 text-xs text-gold-pale/80 hover:bg-gold/10 disabled:opacity-40" disabled={disabled || n > cap} onClick={() => set(n)}>
            {fmt(n)}
          </button>
        ))}
      </div>
    </div>
  );
}
