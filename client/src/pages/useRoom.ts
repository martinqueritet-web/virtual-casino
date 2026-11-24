import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiErr } from "../api";
import { useApp } from "../state";

export interface RoomData {
  version: number;
  online: string[];
  room: any;
  poker: any;
  balance: number;
  serverTime: number;
  clockOffset: number;
}

/**
 * Synchronisation temps réel par interrogation courte :
 * ~1 s quand l'onglet est visible, 5 s en arrière-plan.
 * Le serveur ne renvoie l'état complet que si sa version a changé.
 * Une coupure réseau est rattrapée automatiquement (reconnexion).
 */
export function useRoom(code: string) {
  const { setBalance } = useApp();
  const [data, setData] = useState<RoomData | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [offline, setOffline] = useState(false);
  const version = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const alive = useRef(true);
  const inflight = useRef(false);

  const poll = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const r = await api(`/rooms/${code}?v=${version.current}`);
      setOffline(false);
      if (r.unchanged) {
        setData((d) => (d ? { ...d, online: r.online } : d));
      } else {
        version.current = r.version;
        setBalance(r.balance);
        setData({ ...r, clockOffset: r.serverTime - Date.now() });
      }
      setError(null);
    } catch (e) {
      if (e instanceof ApiErr && e.status !== 0 && e.status !== 500) setError({ status: e.status, message: e.message });
      else setOffline(true);
    } finally {
      inflight.current = false;
    }
  }, [code, setBalance]);

  useEffect(() => {
    alive.current = true;
    version.current = 0;
    const loop = async () => {
      await poll();
      if (!alive.current) return;
      timer.current = window.setTimeout(loop, document.hidden ? 5000 : 1000);
    };
    loop();
    const onVis = () => {
      if (!document.hidden) {
        clearTimeout(timer.current);
        loop();
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [poll]);

  const send = useCallback(
    async (action: string, body: object = {}) => {
      await api(`/rooms/${code}/${action}`, { body });
      await poll();
    },
    [code, poll],
  );

  return { data, error, offline, send, refresh: poll };
}
