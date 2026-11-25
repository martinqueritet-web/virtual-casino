import { useApp, fmt } from "../state";

/** Saisie de mise commune aux jeux rapides : montant, ½, ×2, raccourcis. */
export function BetInput({ value, onChange, max = 500, disabled = false }: { value: number; onChange: (n: number) => void; max?: number; disabled?: boolean }) {
  const { balance } = useApp();
  const cap = Math.max(1, Math.min(max, balance));
  const set = (n: number) => onChange(Math.max(1, Math.min(cap, Math.floor(n) || 1)));
  return (
    <div>
      <label className="mb-1 block text-sm text-gold-pale/70" htmlFor="bet">
        Mise
      </label>
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <input id="bet" type="number" inputMode="numeric" className="input pr-10 font-semibold tabular-nums" min={1} max={cap} value={value} disabled={disabled} onChange={(e) => set(Number(e.target.value))} />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gold/70">VC</span>
        </div>
        <button className="btn-ghost px-3" disabled={disabled} onClick={() => set(value / 2)} aria-label="Diviser la mise par deux">
          ½
        </button>
        <button className="btn-ghost px-3" disabled={disabled} onClick={() => set(value * 2)} aria-label="Doubler la mise">
          ×2
        </button>
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {[1, 5, 10, 25, 100].map((n) => (
          <button key={n} className="flex-1 rounded-md border border-gold/20 py-1 text-xs text-gold-pale/80 hover:bg-gold/10 disabled:opacity-40" disabled={disabled || n > cap} onClick={() => set(n)}>
            {fmt(n)}
          </button>
        ))}
      </div>
    </div>
  );
}
