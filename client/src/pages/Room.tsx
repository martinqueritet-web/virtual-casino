import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { api, inviteLink } from "../api";
import { useApp, go } from "../state";
import { TopBar, Avatar, Modal } from "../components/UI";
import { useRoom } from "./useRoom";
import { PokerTable } from "./PokerTable";

export function RoomPage({ code, autoJoin }: { code: string; autoJoin: boolean }) {
  const { toast } = useApp();
  const [joined, setJoined] = useState(!autoJoin);
  const [joinError, setJoinError] = useState("");

  useEffect(() => {
    if (!autoJoin) return;
    api("/rooms/join", { body: { code } })
      .then((r) => {
        setJoined(true);
        history.replaceState(null, "", "#/room/" + r.code);
      })
      .catch((e) => setJoinError(e.message));
  }, [autoJoin, code]);

  if (joinError)
    return (
      <Fullscreen>
        <p className="text-lg">{joinError}</p>
        <button className="btn-gold" onClick={() => go("")}>
          Retour au hall
        </button>
      </Fullscreen>
    );
  if (!joined) return <Fullscreen>Entrée dans le salon {code}…</Fullscreen>;
  return <RoomInner code={code} toast={toast} />;
}

function Fullscreen({ children }: { children: React.ReactNode }) {
  return <div className="grid min-h-dvh place-items-center p-6 text-center text-gold-pale"><div className="flex flex-col items-center gap-4">{children}</div></div>;
}

type Tab = "table" | "salon" | "chat";

function RoomInner({ code, toast }: { code: string; toast: (m: string, k?: any) => void }) {
  const { user } = useApp();
  const { data, error, offline, send } = useRoom(code);
  const [tab, setTab] = useState<Tab>("table");
  const [invite, setInvite] = useState(false);

  const run = async (action: string, body: object = {}) => {
    try {
      await send(action, body);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  if (error)
    return (
      <Fullscreen>
        <p className="text-lg">{error.message}</p>
        <button className="btn-gold" onClick={() => go("")}>
          Retour au hall
        </button>
      </Fullscreen>
    );
  if (!data) return <Fullscreen>Connexion à la table…</Fullscreen>;

  const isHost = data.room.hostId === user!.id;
  const leave = async () => {
    try {
      await api(`/rooms/${code}/leave`, { method: "POST" });
      go("");
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <div className="min-h-dvh">
      <TopBar title={code} />
      {offline && <div className="bg-ruby/80 px-4 py-1.5 text-center text-sm">Connexion perdue — reconnexion automatique en cours…</div>}
      <div className="mx-auto max-w-7xl px-2 pb-24 pt-3 sm:px-4 lg:grid lg:grid-cols-[1fr_320px] lg:gap-4">
        <nav className="mb-3 grid grid-cols-3 rounded-lg bg-black/40 p-1 lg:hidden" role="tablist">
          {(["table", "salon", "chat"] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-md py-2 text-sm ${tab === t ? "bg-felt text-gold-pale" : "text-gold-pale/60"}`}>
              {t === "table" ? "Table" : t === "salon" ? `Salon (${data.room.members.length})` : "Chat"}
            </button>
          ))}
        </nav>
        <section className={tab === "table" ? "" : "hidden lg:block"}>
          <PokerTable data={data} run={run} isHost={isHost} />
        </section>
        <aside className="flex flex-col gap-4">
          <div className={tab === "salon" ? "" : "hidden lg:block"}>
            <InviteCard code={code} onQR={() => setInvite(true)} />
            <Members data={data} isHost={isHost} run={run} />
            {isHost && <HostControls data={data} run={run} />}
            <button className="btn-ghost mt-4 w-full" onClick={leave}>
              Quitter le salon
            </button>
          </div>
          <div className={tab === "chat" ? "" : "hidden lg:block"}>
            <Chat data={data} run={run} />
          </div>
        </aside>
      </div>
      <Modal open={invite} onClose={() => setInvite(false)} title="Inviter des amis">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="rounded-xl bg-[#fbf8ef] p-4">
            <QRCodeSVG value={inviteLink(code)} size={200} fgColor="#020504" bgColor="#fbf8ef" level="M" />
          </div>
          <p className="text-sm text-gold-pale/70">Vos amis scannent ce code avec l'appareil photo de leur téléphone.</p>
          <p className="font-marquee text-3xl tracking-wider text-gold">{code}</p>
        </div>
      </Modal>
    </div>
  );
}

function InviteCard({ code, onQR }: { code: string; onQR: () => void }) {
  const { toast } = useApp();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink(code));
      toast("Lien d'invitation copié");
    } catch {
      prompt("Copiez ce lien :", inviteLink(code));
    }
  };
  const share = async () => {
    if (navigator.share) navigator.share({ title: "VIRTUAL CASINO", text: `Rejoins ma table de poker ! Code : ${code}`, url: inviteLink(code) }).catch(() => {});
    else copy();
  };
  return (
    <div className="panel p-4">
      <p className="text-sm text-gold-pale/60">Code du salon</p>
      <p className="font-marquee text-3xl tracking-wider text-gold">{code}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <button className="btn-ghost px-2 py-2 text-sm" onClick={copy}>
          Copier le lien
        </button>
        <button className="btn-ghost px-2 py-2 text-sm" onClick={onQR}>
          QR code
        </button>
        <button className="btn-ghost px-2 py-2 text-sm" onClick={share}>
          Partager
        </button>
      </div>
    </div>
  );
}

function Members({ data, isHost, run }: { data: any; isHost: boolean; run: (a: string, b?: object) => void }) {
  const { user } = useApp();
  const me = data.room.members.find((m: any) => m.userId === user!.id);
  const [menu, setMenu] = useState<string | null>(null);
  return (
    <div className="panel mt-4 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-gold-pale">Joueurs</h2>
        <button
          className={`rounded-full px-3 py-1 text-sm ${me?.ready ? "bg-felt-light text-white" : "border border-gold/30 text-gold-pale/80"}`}
          onClick={() => run("ready", { ready: !me?.ready })}
          aria-pressed={!!me?.ready}
        >
          {me?.ready ? "✓ Je suis prêt" : "Je suis prêt ?"}
        </button>
      </div>
      <ul className="flex flex-col gap-1">
        {data.room.members.map((m: any) => {
          const online = data.online.includes(m.userId);
          const host = data.room.hostId === m.userId;
          return (
            <li key={m.userId} className="relative flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/5">
              <span className="relative">
                <Avatar emoji={m.avatar} color={m.color} size={34} />
                <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-lounge ${online ? "bg-emerald-400" : "bg-zinc-500"}`} title={online ? "En ligne" : "Hors ligne"} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-gold-pale">
                  {m.username} {host && <span title="Hôte du salon">👑</span>}
                </span>
                <span className="text-xs text-gold-pale/50">{!online ? "Hors ligne" : m.ready ? "Prêt" : "Pas encore prêt"}</span>
              </span>
              {isHost && m.userId !== user!.id && (
                <button className="px-2 text-gold-pale/60 hover:text-gold" onClick={() => setMenu(menu === m.userId ? null : m.userId)} aria-label={`Options pour ${m.username}`}>
                  ⋯
                </button>
              )}
              {menu === m.userId && (
                <div className="absolute right-2 top-10 z-20 flex w-48 flex-col rounded-lg border border-gold/25 bg-[#04110c] p-1 shadow-xl">
                  <button className="rounded px-3 py-2 text-left text-sm hover:bg-white/5" onClick={() => (setMenu(null), run("transferHost", { userId: m.userId }))}>
                    Nommer hôte
                  </button>
                  <button
                    className="rounded px-3 py-2 text-left text-sm text-[#ff9aa9] hover:bg-white/5"
                    onClick={() => {
                      setMenu(null);
                      if (confirm(`Exclure ${m.username} du salon ? Ses jetons lui seront rendus.`)) run("kick", { userId: m.userId });
                    }}
                  >
                    Exclure du salon
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function HostControls({ data, run }: { data: any; run: (a: string, b?: object) => void }) {
  const levels: number[][] = data.room.blindLevels;
  const current = levels.findIndex((l) => l[0] === data.poker.sb && l[1] === data.poker.bb);
  return (
    <div className="panel mt-4 p-4">
      <h2 className="mb-3 font-semibold text-gold-pale">Réglages de l'hôte</h2>
      <label className="flex items-center justify-between gap-3 py-1.5">
        <span>
          <span className="block">Salon verrouillé</span>
          <span className="text-xs text-gold-pale/50">Plus personne ne peut entrer avec le code</span>
        </span>
        <input type="checkbox" className="h-5 w-5 accent-[#d9b45a]" checked={data.room.locked} onChange={(e) => run("lock", { locked: e.target.checked })} />
      </label>
      <label className="mt-2 block">
        <span className="mb-1 block text-sm">Jeu : Texas Hold'em — blinds</span>
        <select className="input" value={current} onChange={(e) => run("settings", { level: Number(e.target.value) })}>
          {levels.map((l, i) => (
            <option key={i} value={i}>
              {l[0]} / {l[1]} VC — cave de {l[1] * 10} à {l[1] * 100}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function Chat({ data, run }: { data: any; run: (a: string, b?: object) => Promise<void> | void }) {
  const { user } = useApp();
  const [text, setText] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const last = data.room.chat[data.room.chat.length - 1]?.id;
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  }, [last]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const t = text;
    setText("");
    await run("chat", { text: t });
  };
  return (
    <div className="panel flex h-[420px] flex-col p-3 lg:h-[360px]">
      <div ref={box} className="scroll-thin flex-1 space-y-1.5 overflow-y-auto pr-1" aria-live="polite">
        {data.room.chat.map((m: any) => (
          <div key={m.id} className={m.kind === "system" ? "text-xs italic text-gold/70" : "text-sm"}>
            {m.kind === "system" ? (
              m.text
            ) : m.kind === "emote" ? (
              <span>
                <b className={m.userId === user!.id ? "text-gold" : "text-gold-pale"}>{m.username}</b> <span className="text-2xl align-middle">{m.text}</span>
              </span>
            ) : (
              <span>
                <b className={m.userId === user!.id ? "text-gold" : "text-gold-pale"}>{m.username}</b> <span className="text-gold-pale/85">{m.text}</span>
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1" aria-label="Émoticônes">
        {data.room.emotes.map((e: string) => (
          <button key={e} className="rounded px-1 text-xl hover:bg-white/10" onClick={() => run("emote", { emote: e })} aria-label={`Envoyer ${e}`}>
            {e}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <input className="input py-2" value={text} onChange={(e) => setText(e.target.value)} placeholder="Écrire un message…" maxLength={240} aria-label="Message" />
        <button className="btn-felt px-3 py-2" disabled={!text.trim()}>
          Envoyer
        </button>
      </form>
    </div>
  );
}
