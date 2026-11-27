// Adresse du serveur de jeu. Sur le site Render : même origine.
// Ouvert en fichier local (file://) ou hébergé ailleurs : serveur en ligne.
const REMOTE = "https://virtual-casino.onrender.com";
const sameOrigin = location.hostname.endsWith(".onrender.com") || location.hostname === "localhost" || location.hostname === "127.0.0.1";
export const ORIGIN = sameOrigin ? location.origin : REMOTE;
export const API = (sameOrigin ? "" : REMOTE) + "/api";

const TOKEN_KEY = "vc_token";
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return memToken;
  }
}
let memToken: string | null = null;
export function setToken(t: string | null) {
  memToken = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* stockage indisponible : jeton gardé en mémoire */
  }
}

export class ApiErr extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(API + path, {
      method: opts.method ?? (opts.body ? "POST" : "GET"),
      headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiErr(0, "Connexion au casino impossible. Vérifiez votre connexion internet.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) window.dispatchEvent(new Event("vc:logout"));
    throw new ApiErr(res.status, data.error ?? "Erreur inattendue");
  }
  return data as T;
}

export const inviteLink = (code: string) => `${ORIGIN}/#/join/${code}`;
