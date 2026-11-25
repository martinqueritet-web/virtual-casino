/** Routeur HTTP unique : /api/... */
import * as core from "./core.js";
import * as rooms from "./rooms.js";
import * as solo from "./solo.js";
import * as soloPoker from "./soloPoker.js";
import { publicMachines } from "./games/slots.js";
import { ApiError } from "./core.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS } });

async function body(req: Request) {
  if (req.method === "GET") return {};
  try {
    const t = await req.text();
    if (t.length > 10_000) throw new ApiError(413, "Requête trop volumineuse");
    return t ? JSON.parse(t) : {};
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, "JSON invalide");
  }
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";
  const M = req.method;
  try {
    const b = await body(req);
    // ---- public
    if (M === "GET" && path === "/health") return json({ ok: true, time: Date.now() });
    if (M === "POST" && path === "/auth/register") return json(await core.register(b.username, b.password), 201);
    if (M === "POST" && path === "/auth/login") return json(await core.login(b.username, b.password));
    if (M === "GET" && path === "/slots/machines") return json(publicMachines());

    // ---- authentifié
    if (M === "POST" && path === "/auth/logout") {
      await core.logout(req);
      return json({ ok: true });
    }
    const user = await core.authenticate(req);

    if (M === "GET" && path === "/me") {
      await rooms.reclaimStaleSeats(user.id).catch(() => {});
      return json({ user, balance: await core.balanceOf(user.id), rooms: await rooms.myRooms(user.id), avatars: core.AVATARS });
    }
    if (M === "PATCH" && path === "/me") return json({ user: await core.updateProfile(user.id, b) });
    if (M === "GET" && path === "/stats") return json({ user, ...(await core.getStats(user.id)), balance: await core.balanceOf(user.id) });
    if (M === "POST" && path === "/wallet/reset") return json({ balance: await core.resetWallet(user.id) });

    if (M === "POST" && path === "/rooms") return json(await rooms.createRoom(user), 201);
    if (M === "POST" && path === "/rooms/join") return json(await rooms.joinRoom(user, b.code));
    let m = path.match(/^\/rooms\/(CASINO-[A-Z0-9]{4})$/);
    if (M === "GET" && m) return json(await rooms.getRoom(user, m[1], Number(url.searchParams.get("v") ?? 0)));
    m = path.match(/^\/rooms\/(CASINO-[A-Z0-9]{4})\/leave$/);
    if (M === "POST" && m) return json(await rooms.leaveRoom(user, m[1]));
    m = path.match(/^\/rooms\/(CASINO-[A-Z0-9]{4})\/([a-zA-Z]+)$/);
    if (M === "POST" && m) return json(await rooms.roomAction(user, m[1], m[2], b));

    if (M === "GET" && path === "/blackjack") return json(await solo.bjGet(user.id));
    if (M === "POST" && path === "/blackjack/start") return json(await solo.bjStart(user.id, b));
    if (M === "POST" && path === "/blackjack/insurance") return json(await solo.bjInsurance(user.id, b));
    if (M === "POST" && path === "/blackjack/action") return json(await solo.bjAction(user.id, b));
    if (M === "GET" && path === "/solo-poker") return json(await soloPoker.soloGet(user.id));
    if (M === "POST" && path === "/solo-poker/start") return json(await soloPoker.soloStart(user, b));
    if (M === "POST" && path === "/solo-poker/act") return json(await soloPoker.soloAct(user, b));
    if (M === "POST" && path === "/solo-poker/step") return json(await soloPoker.soloStep(user));
    if (M === "POST" && path === "/solo-poker/next") return json(await soloPoker.soloNext(user));
    if (M === "POST" && path === "/solo-poker/rebuy") return json(await soloPoker.soloRebuy(user, b));
    if (M === "POST" && path === "/solo-poker/leave") return json(await soloPoker.soloLeave(user));
    if (M === "POST" && path === "/slots/spin") return json(await solo.slotSpin(user.id, b));

    throw new ApiError(404, "Route inconnue");
  } catch (e) {
    if (e instanceof ApiError) return json({ error: e.message }, e.status);
    console.error("[api]", M, path, e);
    return json({ error: "Erreur interne du serveur, réessayez" }, 500);
  }
}
