import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setToken, getToken } from "./api";
import { sound } from "./sound";

export interface Prefs {
  sound?: boolean;
  reducedFx?: boolean;
  colorblind?: boolean;
  showHelp?: boolean;
  cardBack?: string;
  tableTheme?: string;
  lowPower?: boolean;
}
export interface User {
  id: string;
  username: string;
  avatar: string;
  avatar_color: string;
  prefs: Prefs;
  created_at: string;
}

interface Ctx {
  user: User | null;
  balance: number;
  loading: boolean;
  avatars: string[];
  prefs: Required<Prefs>;
  setBalance: (n: number) => void;
  refresh: () => Promise<void>;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
  updateUser: (u: User) => void;
  toast: (msg: string, kind?: "info" | "error" | "win") => void;
  toasts: { id: number; msg: string; kind: string }[];
}

const DEFAULT_PREFS: Required<Prefs> = {
  sound: true,
  reducedFx: false,
  colorblind: false,
  showHelp: true,
  cardBack: "emerald",
  tableTheme: "classic",
  lowPower: false,
};

const AppCtx = createContext<Ctx>(null as unknown as Ctx);
export const useApp = () => useContext(AppCtx);

let toastId = 0;

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [balance, setBalance] = useState(0);
  const [loading, setLoading] = useState(!!getToken());
  const [avatars, setAvatars] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Ctx["toasts"]>([]);

  const toast = useCallback((msg: string, kind: "info" | "error" | "win" = "info") => {
    const id = ++toastId;
    setToasts((t) => [...t.slice(-2), { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 5000 : 3500);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      const me = await api("/me");
      setUser(me.user);
      setBalance(me.balance);
      setAvatars(me.avatars);
    } catch {
      /* jeton invalide : géré par vc:logout */
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(() => {
    api("/auth/logout", { method: "POST" }).catch(() => {});
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    refresh();
    const onLogout = () => {
      setToken(null);
      setUser(null);
    };
    window.addEventListener("vc:logout", onLogout);
    return () => window.removeEventListener("vc:logout", onLogout);
  }, [refresh]);

  const prefs = { ...DEFAULT_PREFS, ...(user?.prefs ?? {}) };
  sound.enabled = prefs.sound;

  useEffect(() => {
    document.documentElement.dataset.lowfx = String(prefs.lowPower || prefs.reducedFx);
  }, [prefs.lowPower, prefs.reducedFx]);

  return (
    <AppCtx.Provider
      value={{
        user,
        balance,
        loading,
        avatars,
        prefs,
        setBalance,
        refresh,
        signIn: (token, u) => {
          setToken(token);
          setUser(u);
          refresh();
        },
        signOut,
        updateUser: setUser,
        toast,
        toasts,
      }}
    >
      {children}
    </AppCtx.Provider>
  );
}

// --------------------------------------------------------------- routeur (hash)
export function useRoute(): string[] {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return hash.replace(/^#\/?/, "").split("/").filter(Boolean);
}
export const go = (path: string) => {
  location.hash = "#/" + path.replace(/^\//, "");
  window.scrollTo(0, 0);
};

export const fmt = (n: number) => n.toLocaleString("fr-FR");
