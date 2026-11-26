import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApp, fmt, go } from "../state";
import { api } from "../api";
import { sound } from "../sound";

export function Modal({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, input, select, [tabindex]")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`panel w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90dvh] overflow-y-auto scroll-thin p-5 sm:p-6 bg-[#04110c]`}
            initial={{ y: 24, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 24, opacity: 0 }}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 className="font-marquee text-2xl text-gold">{title}</h2>
              <button className="text-gold-pale/60 hover:text-gold text-2xl leading-none px-1" onClick={onClose} aria-label="Fermer">
                ×
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="fixed bottom-4 left-1/2 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2" aria-live="polite">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`rounded-lg border px-4 py-3 text-sm shadow-xl ${
              t.kind === "error" ? "border-ruby/60 bg-[#2a0a10]" : t.kind === "win" ? "border-gold/70 bg-[#2a2108] text-gold-pale" : "border-gold/25 bg-[#04110c]"
            }`}
          >
            {t.msg}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Solde animé : compte jusqu'à la nouvelle valeur. */
export function Balance({ className = "" }: { className?: string }) {
  const { balance } = useApp();
  const [shown, setShown] = useState(balance);
  useEffect(() => {
    const from = shown;
    const to = balance;
    if (from === to) return;
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 600);
      setShown(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balance]);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-black/50 px-3 py-1 tabular-nums ${className}`} title="Crédits virtuels : fictifs, gratuits et sans valeur">
      <span className="grid h-4 w-4 place-items-center rounded-full bg-gold text-[9px] font-bold text-velvet">V</span>
      <span className="font-semibold text-gold-pale">{fmt(shown)}</span>
      <span className="text-xs text-gold/70">VC</span>
    </span>
  );
}

export function Avatar({ emoji, color, size = 40, ring = false }: { emoji: string; color: string; size?: number; ring?: boolean }) {
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full ${ring ? "turn-ring" : ""}`}
      style={{ width: size, height: size, fontSize: size * 0.5, background: `radial-gradient(circle at 35% 30%, ${color}, #000 120%)`, border: `2px solid ${color}` }}
      aria-hidden
    >
      {emoji}
    </span>
  );
}

/** Bandeau « plus de crédits » : visible partout dès que le solde passe sous 10 VC. */
export function LowBalanceBar() {
  const { user, balance, setBalance, toast } = useApp();
  const [busy, setBusy] = useState(false);
  if (!user || balance >= 10) return null;
  const refill = async () => {
    setBusy(true);
    try {
      const r = await api("/wallet/refill", { method: "POST" });
      setBalance(r.balance);
      toast(r.refilled ? (r.recovered > 0 ? `${r.recovered} VC récupérés sur une table, et votre portefeuille est rechargé à 500 VC` : "Portefeuille rechargé : 500 VC") : `Vos ${r.recovered} VC posés sur une table sont revenus dans votre portefeuille`, "win");
      sound.win();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="border-t border-gold/30 bg-gradient-to-r from-[#2a2108] via-[#3a2d0b] to-[#2a2108]">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-3 py-2">
        <span className="text-sm text-gold-pale">{balance === 0 ? "Vous n'avez plus de crédits." : `Il ne vous reste que ${balance} VC.`}</span>
        <button className="btn-gold px-4 py-1.5 text-sm" onClick={refill} disabled={busy}>
          {busy ? "Un instant…" : "Recharger 500 VC gratuitement"}
        </button>
      </div>
    </div>
  );
}

export function TopBar({ title, back = "" }: { title?: string; back?: string }) {
  const { user } = useApp();
  return (
    <header className="sticky top-0 z-40 border-b border-gold/10 bg-velvet/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2.5 sm:px-5">
        <button onClick={() => go(back)} className="flex items-center gap-2 text-gold hover:text-gold-pale" aria-label="Retour au hall">
          <span className="text-lg">‹</span>
          <span className="font-marquee text-lg tracking-wide">{title ?? "VIRTUAL CASINO"}</span>
        </button>
        <div className="ml-auto flex items-center gap-2">
          {user && <Balance />}
          {user && (
            <button onClick={() => go("profile")} aria-label="Mon profil" className="rounded-full">
              <Avatar emoji={user.avatar} color={user.avatar_color} size={34} />
            </button>
          )}
        </div>
      </div>
      <LowBalanceBar />
    </header>
  );
}

export function Help({ children }: { children: ReactNode }) {
  const { prefs } = useApp();
  if (!prefs.showHelp) return null;
  return <p className="text-xs leading-snug text-gold-pale/55">{children}</p>;
}
