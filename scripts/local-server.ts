// Serveur local qui imite Netlify : sert dist/index.html et route /api vers la fonction.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { handle } from "../server/api";

const port = Number(process.env.PORT ?? 8888);
createServer(async (req, res) => {
  const url = `http://localhost:${port}${req.url}`;
  if (req.url?.startsWith("/api")) {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const r = await handle(new Request(url, { method: req.method, headers: req.headers as any, body: ["GET", "HEAD"].includes(req.method!) ? undefined : Buffer.concat(chunks) }));
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(readFileSync("dist/index.html"));
}).listen(port, () => console.log("VIRTUAL CASINO local sur http://localhost:" + port));
