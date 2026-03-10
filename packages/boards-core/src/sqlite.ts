import { Database as BunDatabase } from 'bun:sqlite';
import type { DatabaseConnection, Driver, Dialect, QueryResult, TransactionSettings, CompiledQuery } from 'kysely';
import { Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler } from 'kysely';
import type { Database } from './schema.js';

class BunSqliteConnection implements DatabaseConnection {
  constructor(private db: BunDatabase) {}

  executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    const { sql, parameters } = compiledQuery;
    const stmt = this.db.prepare(sql);
    const query = compiledQuery.query as any;
    const hasReturning = query.kind === 'SelectQueryNode' || query.kind === 'RawNode' || !!query.returning;

    if (hasReturning) {
      const rows = stmt.all(...(parameters as any[])) as R[];
      return Promise.resolve({ rows });
    }

    const { changes } = stmt.run(...(parameters as any[]));
    return Promise.resolve({
      rows: [],
      numAffectedRows: BigInt(changes),
    });
  }

  streamQuery(): AsyncIterableIterator<QueryResult<any>> {
    throw new Error('Streaming is not supported by bun:sqlite');
  }
}

class BunSqliteDriver implements Driver {
  private connection: BunSqliteConnection;

  constructor(private db: BunDatabase) {
    this.connection = new BunSqliteConnection(db);
  }

  init(): Promise<void> {
    return Promise.resolve();
  }

  acquireConnection(): Promise<DatabaseConnection> {
    return Promise.resolve(this.connection);
  }

  releaseConnection(): Promise<void> {
    return Promise.resolve();
  }

  beginTransaction(_connection: DatabaseConnection, _settings: TransactionSettings): Promise<void> {
    this.db.run('BEGIN');
    return Promise.resolve();
  }

  commitTransaction(): Promise<void> {
    this.db.run('COMMIT');
    return Promise.resolve();
  }

  rollbackTransaction(): Promise<void> {
    this.db.run('ROLLBACK');
    return Promise.resolve();
  }

  destroy(): Promise<void> {
    this.db.close();
    return Promise.resolve();
  }
}

export class BunSqliteDialect implements Dialect {
  constructor(private db: BunDatabase) {}

  createDriver(): Driver {
    return new BunSqliteDriver(this.db);
  }

  createAdapter() {
    return new SqliteAdapter();
  }

  createIntrospector(db: Kysely<any>) {
    return new SqliteIntrospector(db);
  }

  createQueryCompiler() {
    return new SqliteQueryCompiler();
  }
}

export function openDatabase(path: string): Kysely<Database> {
  const raw = new BunDatabase(path);
  raw.run('PRAGMA busy_timeout = 5000');
  raw.run('PRAGMA journal_mode = WAL');
  raw.run('PRAGMA foreign_keys = ON');

  return new Kysely<Database>({
    dialect: new BunSqliteDialect(raw),
  });
}
