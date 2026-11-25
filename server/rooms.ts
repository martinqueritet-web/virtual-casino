/**
 * Salons privés multijoueurs. L'état complet d'un salon (membres, chat, table de poker)
 * est stocké en base et modifié uniquement sous verrou de ligne (SELECT … FOR UPDATE),
 * dans la même transaction que les mouvements de portefeuille.
 * Les clients se synchronisent par interrogation courte (~1 s) avec un numéro de version.
 */
import { randomInt } from "node:crypto";
import { q, tx, type Q } from "./db.js";
import { ApiError, debit, credit, balanceOf, addHistory, SEATED_SQL, type User } from "./core.js";
import * as P from "./games/poker.js";

export interface Member {
  userId: string;
  username: string;
  avatar: string;
  color: string;
  ready: boolean;
  joinedAt: number;
}
export interface ChatMsg {
  id: number;
  userId: string | null;
  username: string;
  text: string;
  ts: number;
  kind: "msg" | "system" | "emote";
}
export interface RoomState {
  code: string;
  hostId: string;
  locked: boolean;
  game: "poker";
  members: Member[];
  banned: string[];
  chat: ChatMsg[];
  chatSeq: number;
  poker: P.PokerTable;
  createdAt: number;
}

const ONLINE_MS = 20_000;
const NEXT_HAND_DELAY_MS = 4_000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const EMOTES = ["👏", "😂", "😮", "😎", "🔥", "🍀", "😭", "🤝", "🎉", "🤔"];
export const BLIND_LEVELS = [
  [1, 2],
  [2, 5],
  [5, 10],
  [10, 20],
  [25, 50],
];

export function normalizeCode(raw: string): string {
  let c = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c.startsWith("CASINO")) c = c.slice(6);
  if (!/^[A-Z0-9]{4}$/.test(c)) throw new ApiError(400, "Code de salon invalide (format CASINO-XXXX)");
  return `CASINO-${c}`;
}

const memberOf = (u: User): Member => ({ userId: u.id, username: u.username, avatar: u.avatar, color: u.avatar_color, ready: false, joinedAt: Date.now() });

function system(s: RoomState, text: string) {
  s.chat.push({ id: ++s.chatSeq, userId: null, username: "Croupier", text, ts: Date.now(), kind: "system" });
  s.chat = s.chat.slice(-80);
}

async function lock(c: Q, code: string): Promise<RoomState> {
  const { rows } = await c.query<{ state: RoomState }>("SELECT state FROM rooms WHERE code = $1 FOR UPDATE", [code]);
  if (!rows[0]) throw new ApiError(404, "Ce salon n'existe pas ou a été fermé");
  return rows[0].state;
}

async function save(c: Q, s: RoomState) {
  await c.query("UPDATE rooms SET state = $2, host_id = $3, version = version + 1, updated_at = NOW() WHERE code = $1", [s.code, JSON.stringify(s), s.hostId]);
}

/** Après toute action de poker : rendre les jetons des partants et enregistrer les statistiques. */
async function settlePoker(c: Q, s: RoomState) {
  const t = s.poker;
  const h = t.hand;
  if (h) await recordHandStats(c, h, s.code);
  for (const out of P.collectLeavers(t)) {
    await credit(c, out.userId, out.amount, "POKER_CASH_OUT", s.code);
    system(s, `${s.members.find((m) => m.userId === out.userId)?.username ?? "Un joueur"} récupère ${out.amount} VC dans son portefeuille`);
  }
}


/** Enregistre statistiques et historique d'une main terminée (une seule fois ; les bots sont ignorés). */
export async function recordHandStats(c: Q, h: P.HandState, ref: string) {
  if (h.stage !== "done" || !h.result || h.statsRecorded) return;
  h.statsRecorded = true;
  const r = h.result;
  for (const p of r.participants) {
    if (p.userId.startsWith("bot:")) continue;
    await c.query(
      `UPDATE game_stats SET
         poker_hands = poker_hands + 1,
         poker_won = poker_won + $2,
         poker_showdowns = poker_showdowns + $3,
         poker_showdowns_won = poker_showdowns_won + $4,
         poker_vpip = poker_vpip + $5,
         poker_biggest_pot = GREATEST(poker_biggest_pot, $6),
         poker_net = poker_net + $7,
         poker_best_label = CASE WHEN $8 > poker_best_rank THEN $9 ELSE poker_best_label END,
         poker_best_rank = GREATEST(poker_best_rank, $8)
       WHERE user_id = $1`,
      [p.userId, p.won ? 1 : 0, p.showdown ? 1 : 0, p.showdown && p.won ? 1 : 0, p.vpip ? 1 : 0, p.won ? r.potTotal : 0, p.net, p.category, p.label],
    );
    await addHistory(c, p.userId, "poker", p.won ? "Gagnée" : p.net === 0 ? "Neutre" : "Perdue", p.net, { room: ref, hand: h.number, label: p.label, summary: r.summary });
  }
}

// ------------------------------------------------------------ cycle de vie

export async function createRoom(u: User) {
  return tx(async (c) => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = "CASINO-" + Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
      const exists = await c.query("SELECT 1 FROM rooms WHERE code = $1", [code]);
      if (exists.rowCount) continue;
      const s: RoomState = {
        code,
        hostId: u.id,
        locked: false,
        game: "poker",
        members: [memberOf(u)],
        banned: [],
        chat: [],
        chatSeq: 0,
        poker: P.createTable({ sb: 5, bb: 10, maxSeats: 9 }),
        createdAt: Date.now(),
      };
      system(s, `${u.username} a ouvert le salon. Partagez le code ${code} avec vos amis !`);
      await c.query("INSERT INTO rooms (code, host_id, state) VALUES ($1, $2, $3)", [code, u.id, JSON.stringify(s)]);
      await c.query("INSERT INTO room_presence (room_code, user_id) VALUES ($1, $2)", [code, u.id]);
      return { code };
    }
    throw new ApiError(500, "Impossible de générer un code, réessayez");
  });
}

export async function joinRoom(u: User, rawCode: string) {
  const code = normalizeCode(rawCode);
  return tx(async (c) => {
    const s = await lock(c, code);
    if (s.banned.includes(u.id)) throw new ApiError(403, "L'hôte vous a exclu de ce salon");
    const existing = s.members.find((m) => m.userId === u.id);
    if (!existing) {
      if (s.locked) throw new ApiError(403, "Ce salon est verrouillé par l'hôte");
      if (s.members.length >= 12) throw new ApiError(403, "Ce salon est complet (12 personnes)");
      s.members.push(memberOf(u));
      system(s, `${u.username} rejoint le salon`);
      await save(c, s);
    }
    await c.query(
      "INSERT INTO room_presence (room_code, user_id) VALUES ($1, $2) ON CONFLICT (room_code, user_id) DO UPDATE SET last_seen = NOW()",
      [code, u.id],
    );
    return { code };
  });
}

function removeMember(s: RoomState, userId: string) {
  s.members = s.members.filter((m) => m.userId !== userId);
  if (s.hostId === userId && s.members.length) {
    s.hostId = s.members[0].userId;
    system(s, `${s.members[0].username} devient l'hôte du salon`);
  }
}

/**
 * Fait avancer une main bloquée : tant que le joueur qui a la parole est absent
 * (déconnecté ou parti du salon), il parle si possible, sinon il se couche.
 * S'arrête dès qu'un joueur connecté doit décider.
 */
async function unblockHand(c: Q, s: RoomState) {
  for (let i = 0; i < 80 && P.handInProgress(s.poker); i++) {
    const h = s.poker.hand!;
    if (h.toAct === null) break;
    const who = s.poker.seats[h.toAct]!;
    const present = s.members.some((m) => m.userId === who.userId) && (await isOnline(c, s.code, who.userId));
    if (present) break;
    P.forceAbsentAction(s.poker);
    s.poker.log.push(`${who.username} est absent : action automatique`);
  }
}

/** Quitter la table de poker (jetons rendus au portefeuille, ou à la fin de la main). */
async function standUp(c: Q, s: RoomState, userId: string) {
  const r = P.leave(s.poker, userId);
  if (r.deferred) await unblockHand(c, s); // ne pas laisser les jetons bloqués si les autres sont partis
  const before = P.seatOf(s.poker, userId);
  await settlePoker(c, s);
  const released = r.deferred && before !== -1 && P.seatOf(s.poker, userId) === -1;
  if (r.cashOut > 0) await credit(c, userId, r.cashOut, "POKER_CASH_OUT", s.code);
  return { ...r, deferred: r.deferred && !released };
}

export async function leaveRoom(u: User, code: string) {
  return tx(async (c) => {
    const s = await lock(c, code);
    await standUp(c, s, u.id);
    removeMember(s, u.id);
    system(s, `${u.username} quitte le salon`);
    const stillSeated = s.poker.seats.some(Boolean);
    if (!s.members.length && !stillSeated) {
      await c.query("DELETE FROM rooms WHERE code = $1", [code]);
      return { closed: true };
    }
    await save(c, s);
    await c.query("DELETE FROM room_presence WHERE room_code = $1 AND user_id = $2", [code, u.id]);
    return { closed: false };
  });
}

// ------------------------------------------------------------ lecture / synchronisation

export async function getRoom(u: User, code: string, sinceVersion: number) {
  await q(
    `INSERT INTO room_presence (room_code, user_id) VALUES ($1, $2)
     ON CONFLICT (room_code, user_id) DO UPDATE SET last_seen = NOW()
     WHERE room_presence.last_seen < NOW() - INTERVAL '5 seconds'`,
    [code, u.id],
  ).catch(() => {});
  const presence = await q<{ user_id: string; ms: number }>(
    "SELECT user_id, (EXTRACT(EPOCH FROM (NOW() - last_seen)) * 1000)::int AS ms FROM room_presence WHERE room_code = $1",
    [code],
  );
  const online = presence.rows.filter((r) => r.ms < ONLINE_MS).map((r) => r.user_id);
  const { rows } = await q<{ version: number; state?: RoomState }>(
    `SELECT version, CASE WHEN version <> $2 THEN state END AS state FROM rooms WHERE code = $1`,
    [code, sinceVersion],
  );
  if (!rows[0]) throw new ApiError(404, "Ce salon n'existe pas ou a été fermé");
  const { version, state } = rows[0];
  if (!state) return { version, unchanged: true, online };
  if (!state.members.some((m) => m.userId === u.id)) {
    if (state.banned.includes(u.id)) throw new ApiError(403, "L'hôte vous a exclu de ce salon");
    throw new ApiError(403, "Vous ne faites pas partie de ce salon");
  }
  return {
    version,
    unchanged: false,
    online,
    room: {
      code: state.code,
      hostId: state.hostId,
      locked: state.locked,
      game: state.game,
      members: state.members,
      chat: state.chat.slice(-60),
      blindLevels: BLIND_LEVELS,
      emotes: EMOTES,
    },
    poker: P.viewFor(state.poker, u.id),
    balance: await balanceOf(u.id),
    serverTime: Date.now(),
  };
}

// ------------------------------------------------------------ actions

type Handler = (c: Q, s: RoomState, u: User, body: any) => Promise<unknown> | unknown;

const isHost = (s: RoomState, u: User) => {
  if (s.hostId !== u.id) throw new ApiError(403, "Seul l'hôte peut faire cela");
};
const requireMember = (s: RoomState, u: User) => {
  if (!s.members.some((m) => m.userId === u.id)) throw new ApiError(403, "Vous ne faites pas partie de ce salon");
};

async function isOnline(c: Q, code: string, userId: string) {
  const { rows } = await c.query<{ ms: number }>(
    "SELECT (EXTRACT(EPOCH FROM (NOW() - last_seen)) * 1000)::int AS ms FROM room_presence WHERE room_code = $1 AND user_id = $2",
    [code, userId],
  );
  return rows[0] ? rows[0].ms < ONLINE_MS : false;
}

const handlers: Record<string, Handler> = {
  ready(c, s, u, b) {
    const m = s.members.find((x) => x.userId === u.id)!;
    m.ready = !!b.ready;
  },
  chat(c, s, u, b) {
    const text = String(b.text ?? "").trim().slice(0, 240);
    if (!text) throw new ApiError(400, "Message vide");
    const recent = s.chat.filter((m) => m.userId === u.id && Date.now() - m.ts < 5000).length;
    if (recent >= 5) throw new ApiError(429, "Doucement ! Attendez quelques secondes");
    s.chat.push({ id: ++s.chatSeq, userId: u.id, username: u.username, text, ts: Date.now(), kind: "msg" });
    s.chat = s.chat.slice(-80);
  },
  emote(c, s, u, b) {
    if (!EMOTES.includes(b.emote)) throw new ApiError(400, "Émoticône inconnue");
    s.chat.push({ id: ++s.chatSeq, userId: u.id, username: u.username, text: b.emote, ts: Date.now(), kind: "emote" });
    s.chat = s.chat.slice(-80);
  },
  lock(c, s, u, b) {
    isHost(s, u);
    s.locked = !!b.locked;
    system(s, s.locked ? "L'hôte a verrouillé le salon : plus personne ne peut entrer" : "Le salon est de nouveau ouvert");
  },
  async kick(c, s, u, b) {
    isHost(s, u);
    if (b.userId === u.id) throw new ApiError(400, "Vous ne pouvez pas vous exclure vous-même");
    const target = s.members.find((m) => m.userId === b.userId);
    if (!target) throw new ApiError(404, "Joueur introuvable");
    await standUp(c, s, target.userId);
    removeMember(s, target.userId);
    s.banned.push(target.userId);
    system(s, `${target.username} a été exclu par l'hôte`);
    await c.query("DELETE FROM room_presence WHERE room_code = $1 AND user_id = $2", [s.code, target.userId]);
  },
  transferHost(c, s, u, b) {
    isHost(s, u);
    const target = s.members.find((m) => m.userId === b.userId);
    if (!target) throw new ApiError(404, "Joueur introuvable");
    s.hostId = target.userId;
    system(s, `${target.username} devient l'hôte du salon`);
  },
  settings(c, s, u, b) {
    isHost(s, u);
    if (P.handInProgress(s.poker)) throw new ApiError(400, "Attendez la fin de la main pour changer les blinds");
    const lvl = BLIND_LEVELS[Number(b.level)];
    if (!lvl) throw new ApiError(400, "Niveau de blinds inconnu");
    s.poker.sb = lvl[0];
    s.poker.bb = lvl[1];
    s.poker.minBuyIn = lvl[1] * 10;
    s.poker.maxBuyIn = lvl[1] * 100;
    system(s, `Nouvelles blinds : ${lvl[0]} / ${lvl[1]} VC`);
  },
  async sit(c, s, u, b) {
    const amount = Math.floor(Number(b.buyIn));
    const t = s.poker;
    if (!(amount >= t.minBuyIn && amount <= t.maxBuyIn)) throw new ApiError(400, `La cave doit être comprise entre ${t.minBuyIn} et ${t.maxBuyIn} VC`);
    await debit(c, u.id, amount, "POKER_BUY_IN", s.code);
    P.sit(t, Number(b.seat), { userId: u.id, username: u.username, avatar: u.avatar, color: u.avatar_color }, amount);
    system(s, `${u.username} s'installe à la table avec ${amount} VC`);
  },
  async rebuy(c, s, u, b) {
    const amount = Math.floor(Number(b.amount));
    await debit(c, u.id, amount, "POKER_BUY_IN", s.code);
    P.rebuy(s.poker, u.id, amount);
  },
  async stand(c, s, u) {
    const r = await standUp(c, s, u.id);
    if (r.deferred) system(s, `${u.username} se lèvera à la fin de la main`);
  },
  sitOut(c, s, u, b) {
    P.setSittingOut(s.poker, u.id, !!b.value);
  },
  start(c, s, u) {
    const t = s.poker;
    if (P.seatOf(t, u.id) === -1 && s.hostId !== u.id) throw new ApiError(403, "Asseyez-vous pour lancer la partie");
    if (P.handInProgress(t)) return;
    if (t.hand?.endedAt && Date.now() - t.hand.endedAt < NEXT_HAND_DELAY_MS && s.hostId !== u.id) return;
    P.startHand(t);
  },
  async act(c, s, u, b) {
    P.act(s.poker, u.id, b.type, b.amount);
  },
  async forceAbsent(c, s, u) {
    isHost(s, u);
    const h = s.poker.hand;
    if (!h || h.toAct === null || !P.handInProgress(s.poker)) throw new ApiError(400, "Personne n'a la parole");
    const target = s.poker.seats[h.toAct]!;
    if (target.userId === u.id) throw new ApiError(400, "C'est à vous de jouer !");
    if (await isOnline(c, s.code, target.userId)) throw new ApiError(400, `${target.username} est connecté : laissez-lui le temps de jouer`);
    P.forceAbsentAction(s.poker);
    system(s, `L'hôte a fait jouer ${target.username}, absent`);
  },
};

export async function roomAction(u: User, code: string, action: string, body: any) {
  const h = handlers[action];
  if (!h) throw new ApiError(404, "Action inconnue");
  return tx(async (c) => {
    const s = await lock(c, code);
    requireMember(s, u);
    try {
      await h(c, s, u, body ?? {});
    } catch (e) {
      if (e instanceof P.PokerError) throw new ApiError(400, e.message);
      throw e;
    }
    await settlePoker(c, s);
    await save(c, s);
    return { ok: true };
  });
}

/** Tables où l'utilisateur a encore des jetons (y compris des salons qu'il a quittés). */
export async function seatedTables(userId: string) {
  const { rows } = await q<{ code: string; state: RoomState }>(
    `SELECT code, state FROM rooms WHERE jsonb_path_exists(state, '$.poker.seats[*] ? (@.userId == $uid)', jsonb_build_object('uid', $1::text))`,
    [userId],
  );
  return rows.map((r) => {
    const t = r.state.poker;
    const i = P.seatOf(t, userId);
    const ph = t.hand && P.handInProgress(t) ? t.hand.players[i] : undefined;
    return {
      code: r.code,
      stack: t.seats[i]!.stack,
      inHand: ph ? ph.total : 0,
      member: r.state.members.some((m) => m.userId === userId),
    };
  });
}

/** Récupère les jetons de toutes les tables. Retourne les tables encore bloquées par une main en cours. */
export async function reclaimAllSeats(userId: string) {
  const codes = (await seatedTables(userId)).map((t) => t.code);
  const pending: string[] = [];
  for (const code of codes) {
    const r = await tx(async (c) => {
      const s = await lock(c, code);
      if (P.seatOf(s.poker, userId) === -1) return { deferred: false };
      const out = await standUp(c, s, userId);
      // salon vide et plus personne d'assis : on le ferme
      if (!s.members.length && !s.poker.seats.some(Boolean)) {
        await c.query("DELETE FROM rooms WHERE code = $1", [code]);
        return out;
      }
      await save(c, s);
      return out;
    });
    if (r.deferred) pending.push(code);
  }
  return { pending };
}

/** Rend les jetons laissés sur des tables abandonnées depuis plus de 12 h. */
export async function reclaimStaleSeats(userId: string) {
  const { rows } = await q<{ code: string; updated_at: string }>(SEATED_SQL + " AND updated_at < NOW() - INTERVAL '12 hours'", [userId]);
  for (const r of rows) {
    await tx(async (c) => {
      const s = await lock(c, r.code);
      await standUp(c, s, userId);
      // si la main reste bloquée (tous partis), on l'abandonne en rendant les mises
      if (P.handInProgress(s.poker) && !s.poker.seats.some((x) => x && !x.leaveAfterHand)) {
        for (const p of Object.values(s.poker.hand!.players)) {
          s.poker.seats[p.seat]!.stack += p.total;
          p.total = 0;
        }
        s.poker.hand!.stage = "done";
        s.poker.hand!.statsRecorded = true;
        await settlePoker(c, s);
      }
      await save(c, s);
    });
  }
}

export async function myRooms(userId: string) {
  const { rows } = await q<{ code: string; members: number; updated_at: string }>(
    `SELECT code, jsonb_array_length(state->'members') AS members, updated_at FROM rooms
      WHERE jsonb_path_exists(state, '$.members[*] ? (@.userId == $uid)', jsonb_build_object('uid', $1::text))
      ORDER BY updated_at DESC LIMIT 5`,
    [userId],
  );
  return rows;
}
