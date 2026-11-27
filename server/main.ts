// Serveur de production (Render) : applique les migrations SQL, sert la page et l'API.
import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { handle } from "./api";

const MIGRATIONS = "netlify/database/migrations";

async function migrate() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
      if (done.has(file)) continue;
      await client.query("BEGIN");
      try {
        await client.query(readFileSync(join(MIGRATIONS, file), "utf8"));
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        console.log("migration appliquée :", file);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    await client.end();
  }
}

const page = () => readFileSync("dist/index.html");
const port = Number(process.env.PORT ?? 10000);

await migrate();
createServer(async (req, res) => {
  try {
    if (req.url?.startsWith("/api")) {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const r = await handle(
        new Request(`http://${req.headers.host ?? "localhost"}${req.url}`, {
          method: req.method,
          headers: req.headers as any,
          body: ["GET", "HEAD"].includes(req.method!) ? undefined : Buffer.concat(chunks),
        }),
      );
      res.writeHead(r.status, Object.fromEntries(r.headers));
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
    res.end(page());
  } catch (e) {
    console.error(e);
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Erreur serveur" }));
  }
}).listen(port, () => console.log("VIRTUAL CASINO en ligne sur le port " + port));
