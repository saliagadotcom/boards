import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type { Kysely } from 'kysely';
import type { Database } from '../src/schema.js';
import { migrate } from '../src/migrate.js';
import { createTestDb, BunDatabase } from './helpers.js';

describe('migrate', () => {
  let db: Kysely<Database>;
  let raw: BunDatabase;

  beforeEach(() => {
    const result = createTestDb();
    db = result.db;
    raw = result.raw;
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('creates all tables', async () => {
    await migrate(db);

    const tables = raw
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('schema_migrations');
    expect(tableNames).toContain('boards');
    expect(tableNames).toContain('issues');
    expect(tableNames).toContain('dependencies');
    expect(tableNames).toContain('labels');
  });

  it('is idempotent (running twice does not error)', async () => {
    await migrate(db);
    await migrate(db);

    const rows = raw
      .prepare('SELECT COUNT(*) as count FROM schema_migrations')
      .get() as { count: number };
    expect(rows.count).toBe(2);
  });

  it('records version in schema_migrations', async () => {
    await migrate(db);

    const row = raw
      .prepare('SELECT version, applied_at FROM schema_migrations WHERE version = 1')
      .get() as { version: number; applied_at: string } | null;

    expect(row).not.toBeNull();
    expect(row!.version).toBe(1);
    expect(row!.applied_at).toBeTruthy();
  });

  it('skips all DDL on second call (fast path)', async () => {
    await migrate(db);

    // Drop a table to prove migrate() doesn't re-run DDL
    raw.prepare('DROP TABLE comments').run();

    await migrate(db);

    // comments should still be missing — fast path skipped everything
    const tables = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='comments'")
      .all() as { name: string }[];
    expect(tables).toHaveLength(0);
  });

  it('migrate still works as backward-compat wrapper', async () => {
    await migrate(db);

    const row = raw
      .prepare('SELECT version FROM schema_migrations WHERE version = 1')
      .get() as { version: number } | null;
    expect(row).not.toBeNull();
  });

  it('boards table has correct columns', async () => {
    await migrate(db);

    const columns = raw
      .prepare("PRAGMA table_info('boards')")
      .all() as { name: string; type: string; notnull: number }[];
    const colNames = columns.map((c) => c.name);

    expect(colNames).toEqual(['id', 'prefix', 'description', 'created_at', 'updated_at']);
  });

  it('issues table has correct columns', async () => {
    await migrate(db);

    const columns = raw
      .prepare("PRAGMA table_info('issues')")
      .all() as { name: string }[];
    const colNames = columns.map((c) => c.name);

    expect(colNames).toEqual([
      'id', 'board', 'title', 'description', 'design',
      'acceptance_criteria', 'notes', 'status', 'priority',
      'issue_type', 'assignee', 'owner', 'created_at',
      'updated_at', 'closed_at', 'close_reason', 'resolution',
    ]);
  });

  it('dependencies table has correct columns', async () => {
    await migrate(db);

    const columns = raw
      .prepare("PRAGMA table_info('dependencies')")
      .all() as { name: string }[];
    const colNames = columns.map((c) => c.name);

    expect(colNames).toEqual(['issue_id', 'depends_on_id', 'type', 'created_at', 'created_by', 'metadata']);
  });

  it('labels table has correct columns', async () => {
    await migrate(db);

    const columns = raw
      .prepare("PRAGMA table_info('labels')")
      .all() as { name: string }[];
    const colNames = columns.map((c) => c.name);

    expect(colNames).toEqual(['issue_id', 'label']);
  });

  it('creates indexes', async () => {
    await migrate(db);

    const indexes = raw
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name")
      .all() as { name: string }[];
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain('idx_issues_board');
    expect(indexNames).toContain('idx_issues_board_status');
    expect(indexNames).toContain('idx_issues_board_priority');
    expect(indexNames).toContain('idx_issues_assignee');
    expect(indexNames).toContain('idx_deps_depends_on');
    expect(indexNames).toContain('idx_labels_label');
  });
});
