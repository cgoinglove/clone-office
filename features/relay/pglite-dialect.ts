// Kysely over PGlite, for Better Auth on a relay that keeps its office in a folder (accounts.ts):
// Postgres's own adapter, compiler and introspector, and a driver whose one connection hands each
// query to PGlite, which runs them one at a time. Better Auth is told not to use Kysely's
// transactions here, so none is opened on the connection the relay shares.
//
// Node runs this file without a build, so no TypeScript-only syntax such as parameter properties.

import {
  type CompiledQuery,
  type DatabaseConnection,
  type DatabaseIntrospector,
  type Dialect,
  type Driver,
  type Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type QueryResult,
} from "kysely";

/** What this needs of a PGlite instance. */
interface PGliteLike {
  query<T>(
    text: string,
    params?: unknown[],
  ): Promise<{ rows: T[]; affectedRows?: number }>;
}

class PGliteConnection implements DatabaseConnection {
  private db: PGliteLike;

  constructor(db: PGliteLike) {
    this.db = db;
  }

  async executeQuery<R>(compiled: CompiledQuery): Promise<QueryResult<R>> {
    const result = await this.db.query<R>(compiled.sql, [
      ...compiled.parameters,
    ]);
    return {
      rows: result.rows,
      ...(result.affectedRows
        ? { numAffectedRows: BigInt(result.affectedRows) }
        : {}),
    };
  }

  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error("PGlite does not stream query results.");
  }
}

class PGliteDriver implements Driver {
  private connection: PGliteConnection;

  constructor(db: PGliteLike) {
    this.connection = new PGliteConnection(db);
  }

  async init(): Promise<void> {}

  async acquireConnection(): Promise<DatabaseConnection> {
    return this.connection;
  }

  async beginTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery({ sql: "BEGIN", parameters: [] } as never);
  }

  async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery({ sql: "COMMIT", parameters: [] } as never);
  }

  async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery({ sql: "ROLLBACK", parameters: [] } as never);
  }

  async releaseConnection(): Promise<void> {}

  async destroy(): Promise<void> {}
}

export class PGliteDialect implements Dialect {
  private db: PGliteLike;

  constructor(db: PGliteLike) {
    this.db = db;
  }

  createAdapter() {
    return new PostgresAdapter();
  }

  createDriver(): Driver {
    return new PGliteDriver(this.db);
  }

  createQueryCompiler() {
    return new PostgresQueryCompiler();
  }

  createIntrospector(db: Kysely<any>): DatabaseIntrospector {
    return new PostgresIntrospector(db);
  }
}
