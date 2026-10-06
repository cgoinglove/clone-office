// Where the relay keeps its office: Postgres. A deployed relay connects to a Postgres server by its
// URL (DATABASE_URL); a relay started on one computer for its team runs PGlite, the same Postgres
// built into the process, in a folder, so it needs nothing installed. Both speak the same SQL, so
// there is one schema and one set of queries.
//
// A relay can run as several processes over one Postgres. They hear each other's news through
// LISTEN/NOTIFY; where that is not available (a pooler, a serverless host) the inbox also looks
// again every few seconds, so nothing depends on it.

export interface Sql {
  /** Rows of one statement, with $1-style parameters. */
  query<T = Record<string, unknown>>(
    text: string,
    params?: unknown[],
  ): Promise<T[]>;
}

export interface Database extends Sql {
  readonly kind: "pglite" | "postgres";
  /** Statements in one go, without parameters (the schema). */
  exec(text: string): Promise<void>;
  /** Runs `fn` in one transaction: committed when it returns, rolled back when it throws. */
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  /** Calls `fn` with each payload sent to `channel`; returns how to stop. */
  listen(
    channel: string,
    fn: (payload: string) => void,
  ): Promise<() => Promise<void>>;
  close(): Promise<void>;
}

/** A Postgres URL, or a folder for PGlite ("memory" keeps it in memory, for tests). */
export async function openDatabase(target: string): Promise<Database> {
  return /^postgres(ql)?:\/\//.test(target)
    ? openPostgres(target)
    : openPGlite(target);
}

async function openPGlite(folder: string): Promise<Database> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = folder === "memory" ? new PGlite() : new PGlite(folder);
  await db.waitReady;
  const sql = (q: {
    query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  }): Sql => ({
    query: async <T>(text: string, params?: unknown[]) =>
      (await q.query(text, params)).rows as T[],
  });
  return {
    kind: "pglite",
    ...sql(db),
    exec: async (text) => {
      await db.exec(text);
    },
    transaction: (fn) => db.transaction((tx) => fn(sql(tx))),
    listen: (channel, fn) => db.listen(channel, fn),
    close: () => db.close(),
  };
}

async function openPostgres(url: string): Promise<Database> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  // An idle client's error (a restarted server) must not end the process; the next query reconnects.
  pool.on("error", (error) => console.error(`postgres: ${error.message}`));
  await pool.query("SELECT 1");
  const listeners = new Set<InstanceType<typeof pg.Client>>();
  return {
    kind: "postgres",
    query: async <T>(text: string, params?: unknown[]) =>
      (await pool.query(text, params)).rows as T[],
    exec: async (text) => {
      await pool.query(text);
    },
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await fn({
          query: async <T>(text: string, params?: unknown[]) =>
            (await client.query(text, params)).rows as T[],
        });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    // A connection of its own, kept open; when it drops it comes back, and meanwhile the inbox's
    // second look keeps news flowing.
    listen: async (channel, fn) => {
      let stopped = false;
      let client: InstanceType<typeof pg.Client> | null = null;
      const connect = async (): Promise<void> => {
        if (stopped) return;
        const next = new pg.Client({ connectionString: url });
        next.on("notification", (message) => {
          if (message.channel === channel) fn(message.payload ?? "");
        });
        next.on("error", () => {
          listeners.delete(next);
          next.end().catch(() => {});
          if (client === next) client = null;
          setTimeout(() => void connect().catch(() => {}), 3000);
        });
        try {
          await next.connect();
          await next.query(`LISTEN ${quoteIdent(channel)}`);
          client = next;
          listeners.add(next);
        } catch {
          next.end().catch(() => {});
          setTimeout(() => void connect().catch(() => {}), 3000);
        }
      };
      await connect();
      return async () => {
        stopped = true;
        if (client) {
          listeners.delete(client);
          await client.end().catch(() => {});
        }
      };
    },
    close: async () => {
      for (const client of listeners) await client.end().catch(() => {});
      await pool.end();
    },
  };
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
