import { getDatabase } from "@netlify/database";

export interface Q {
  query<T = any>(text: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}

type PoolLike = { connect(): Promise<Q & { release(): void }>; query: Q["query"] };

let pool: PoolLike | null = null;

/** Connexion : Netlify DB en production, DATABASE_URL en test local. */
export function getPool(): PoolLike {
  if (!pool) {
    const override = process.env.DATABASE_URL;
    pool = getDatabase(override ? { connectionString: override } : {}).pool as unknown as PoolLike;
  }
  return pool;
}

export function setPoolForTests(p: PoolLike) {
  pool = p;
}

/** Transaction SQL : tout réussit ou rien n'est écrit (pas de duplication de crédits). */
export async function tx<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export const q: Q["query"] = (text, params) => getPool().query(text, params);
