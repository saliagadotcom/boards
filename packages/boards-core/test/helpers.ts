/**
 * Shared test database helpers for @boards/core tests.
 *
 * Provides factory functions so that every test file uses the same
 * database semantics.
 */

import { Database as BunDatabase } from 'bun:sqlite';
import type { Kysely } from 'kysely';
import { Kysely as KyselyClass } from 'kysely';
import type { Database } from '../src/schema.js';
import { BunSqliteDialect } from '../src/sqlite.js';
import { migrate } from '../src/migrate.js';
import { BoardsStore, createStore } from '../src/store.js';

// Re-export so test files can type `let raw: BunDatabase` without an extra import.
export { BunDatabase };
export { BunSqliteDialect };

// ─── Test Factories ─────────────────────────────────────────────────────────

export function createTestDb(): { db: Kysely<Database>; raw: BunDatabase } {
  const raw = new BunDatabase(':memory:');
  raw.run('PRAGMA foreign_keys = ON');
  const db = new KyselyClass<Database>({ dialect: new BunSqliteDialect(raw) });
  return { db, raw };
}

/**
 * Create a fully migrated test environment with a BoardsStore instance.
 * Optionally creates a default board.
 *
 * Returns a `destroy` function that tears everything down.
 */
export async function createTestEnv(opts?: { board?: string }): Promise<{
  db: Kysely<Database>;
  raw: BunDatabase;
  store: BoardsStore;
  destroy: () => Promise<void>;
}> {
  const { db, raw } = createTestDb();
  await migrate(db);
  const store = createStore(db);
  if (opts?.board) {
    await store.createBoard({ name: opts.board });
  }
  return { db, raw, store, destroy: () => db.destroy() };
}
