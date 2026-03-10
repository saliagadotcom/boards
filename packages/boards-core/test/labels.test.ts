import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type { Kysely } from 'kysely';
import type { Database } from '../src/schema.js';
import { migrate } from '../src/migrate.js';
import { createBoard } from '../src/boards.js';
import { createIssueWithId } from '../src/issues.js';
import { BoardsError } from '../src/errors.js';
import { addLabel, removeLabel } from '../src/labels.js';
import { createTestDb, BunDatabase } from './helpers.js';

describe('labels', () => {
  let db: Kysely<Database>;
  let raw: BunDatabase;

  beforeEach(async () => {
    const result = createTestDb();
    db = result.db;
    raw = result.raw;
    await migrate(db);
    await createBoard(db, { name: 'test' });
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'Issue 1' });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('adds label to issue', async () => {
    await addLabel(db, 'test-1', 'bug');

    const rows = await db.selectFrom('labels').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].issue_id).toBe('test-1');
    expect(rows[0].label).toBe('bug');
  });

  it('adding duplicate label is idempotent (no error)', async () => {
    await addLabel(db, 'test-1', 'bug');
    await addLabel(db, 'test-1', 'bug');

    const rows = await db.selectFrom('labels').selectAll().execute();
    expect(rows).toHaveLength(1);
  });

  it('rejects adding label to non-existent issue with not_found', async () => {
    try {
      await addLabel(db, 'test-nope', 'bug');
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('not_found');
    }
  });

  it('removes label from issue', async () => {
    await addLabel(db, 'test-1', 'bug');
    await removeLabel(db, 'test-1', 'bug');

    const rows = await db.selectFrom('labels').selectAll().execute();
    expect(rows).toHaveLength(0);
  });

  it('removing non-existent label is a no-op', async () => {
    await removeLabel(db, 'test-1', 'nonexistent');
  });

  it('labels with special characters are allowed', async () => {
    await addLabel(db, 'test-1', 'p0/critical');
    await addLabel(db, 'test-1', 'area:frontend');
    await addLabel(db, 'test-1', '🔥urgent');

    const rows = await db.selectFrom('labels').selectAll().orderBy('label', 'asc').execute();
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.label)).toContain('p0/critical');
    expect(rows.map((r) => r.label)).toContain('area:frontend');
    expect(rows.map((r) => r.label)).toContain('🔥urgent');
  });
});
