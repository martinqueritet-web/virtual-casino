import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Marquee } from "../components/Marquee";
import { api } from "../api";
import { useApp, go } from "../state";
import { PlayingCard } from "../components/Cards";

export function Landing() {
  const [entering, setEntering] = useState(false);
  return (
    <main className="deco-bg relative min-h-dvh overflow-hidden">
      <div className="mx-auto flex min-h-dvh max-w-5xl flex-col items-center justify-center gap-10 px-4 py-12">
        <Marquee />
        <AnimatePresence mode="wait">
          {!entering ? (
            <motion.div key="door" className="flex flex-col items-center gap-6 text-center" exit={{ opacity: 0, y: -10 }}>
              <p className="max-w-md text-lg text-gold-pale/80">
                Poker entre amis, blackjack et machines à sous. Retrouvez-vous autour d'une table, apprenez les règles et jouez avec des crédits fictifs.
              </p>
              <button className="btn-gold px-8 py-3.5 text-lg" onClick={() => setEntering(true)} autoFocus>
                Entrer dans le casino
              </button>
              <div className="flex gap-2 opacity-90" aria-hidden>
                {["As", "Kh", "Qd", "Jc", "Ts"].map((c, i) => (
                  <motion.div key={c} initial={{ y: 30, opacity: 0, rotate: (i - 2) * 6 }} animate={{ y: Math.abs(i - 2) * 6, opacity: 1, rotate: (i - 2) * 6 }} transition={{ delay: 1.6 + i * 0.12 }}>
                    <PlayingCard card={c} size="md" />
                  </motion.div>
                ))}
              </div>
              <button onClick={() => go("rules")} className="text-sm text-gold/80 underline-offset-4 hover:underline">
                Découvrir les règles des jeux
              </button>
            </motion.div>
          ) : (
            <AuthForm key="auth" />
          )}
        </AnimatePresence>
        <p className="max-w-lg text-center text-xs text-gold-pale/45">
          Jeu de simulation uniquement. Les crédits virtuels (VC) sont fictifs, gratuits, non achetables, non transférables et sans aucune valeur monétaire.
        </p>
      </div>
    </main>
  );
}

function AuthForm() {
  const { signIn } = useApp();
  const [mode, setMode] = useState<"register" | "login">("register");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const r = await api(mode === "register" ? "/auth/register" : "/auth/login", { body: { username, password } });
      signIn(r.token, r.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.form onSubmit={submit} className="panel w-full max-w-sm p-6" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
      <div className="mb-5 grid grid-cols-2 rounded-lg bg-black/40 p-1" role="tablist">
        {(["register", "login"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-md py-2 text-sm font-medium ${mode === m ? "bg-felt text-gold-pale" : "text-gold-pale/60"}`}
          >
            {m === "register" ? "Créer un compte" : "J'ai un compte"}
          </button>
        ))}
      </div>
      <label className="mb-3 block">
        <span className="mb-1 block text-sm text-gold-pale/70">Pseudo</span>
        <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={3} maxLength={16} autoFocus />
      </label>
      <label className="mb-4 block">
        <span className="mb-1 block text-sm text-gold-pale/70">Mot de passe</span>
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "register" ? "new-password" : "current-password"} required minLength={6} />
      </label>
      {error && <p className="mb-3 rounded-md bg-ruby/15 px-3 py-2 text-sm text-[#ff9aa9]" role="alert">{error}</p>}
      <button className="btn-gold w-full" disabled={busy}>
        {busy ? "Un instant…" : mode === "register" ? "Recevoir mes 500 VC et entrer" : "Entrer"}
      </button>
      {mode === "register" && <p className="mt-3 text-center text-xs text-gold-pale/50">Votre compte vous suit sur tous vos appareils.</p>}
    </motion.form>
  );
}
