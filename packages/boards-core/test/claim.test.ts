import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type { Kysely } from 'kysely';
import type { Database } from '../src/schema.js';
import { migrate } from '../src/migrate.js';
import { createBoard } from '../src/boards.js';
import { createIssueWithId, updateIssue, closeIssue, showIssue } from '../src/issues.js';
import { BoardsError } from '../src/errors.js';
import { claimIssue } from '../src/claim.js';
import { createTestDb, BunDatabase } from './helpers.js';

describe('claimIssue', () => {
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

  it('open unassigned issue → claim succeeds, status=in_progress, assignee set', async () => {
    const result = await claimIssue(db, 'test-1', 'alice');

    expect(result.status).toBe('in_progress');
    expect(result.assignee).toBe('alice');
    expect(result.id).toBe('test-1');
  });

  it('already assigned issue → conflict error reporting current assignee', async () => {
    await updateIssue(db, 'test-1', { assignee: 'bob' });

    try {
      await claimIssue(db, 'test-1', 'alice');
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('conflict');
      expect((err as BoardsError).message).toContain('bob');
    }
  });

  it('closed issue → conflict error with status "closed"', async () => {
    await closeIssue(db, 'test-1');

    try {
      await claimIssue(db, 'test-1', 'alice');
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('conflict');
      expect((err as BoardsError).message).toContain('closed');
    }
  });

  it('in_progress issue → conflict error with status "in_progress"', async () => {
    await claimIssue(db, 'test-1', 'bob');

    try {
      await claimIssue(db, 'test-1', 'alice');
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('conflict');
      expect((err as BoardsError).message).toContain('in_progress');
    }
  });

  it('non-existent issue → not_found error', async () => {
    try {
      await claimIssue(db, 'test-nope', 'alice');
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('not_found');
    }
  });

  it('single atomic SQL (verify result status/assignee are correct)', async () => {
    const result = await claimIssue(db, 'test-1', 'alice');

    expect(result.status).toBe('in_progress');
    expect(result.assignee).toBe('alice');

    const row = await db
      .selectFrom('issues')
      .selectAll()
      .where('id', '=', 'test-1')
      .executeTakeFirstOrThrow();
    expect(row.status).toBe('in_progress');
    expect(row.assignee).toBe('alice');
  });

  it('claimed issue appears with correct assignee and status in showIssue', async () => {
    await claimIssue(db, 'test-1', 'alice');

    const detail = await showIssue(db, 'test-1');
    expect(detail.issue.status).toBe('in_progress');
    expect(detail.issue.assignee).toBe('alice');
  });

  it('rejects empty assignee with invalid_request', async () => {
    try {
      await claimIssue(db, 'test-1', '');
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('invalid_request');
    }
  });

  it('rejects whitespace-only assignee with invalid_request', async () => {
    try {
      await claimIssue(db, 'test-1', '   ');
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('invalid_request');
    }
  });

  it('claiming sets updated_at to current time', async () => {
    const before = new Date().toISOString();
    await claimIssue(db, 'test-1', 'alice');

    const row = await db
      .selectFrom('issues')
      .select(['created_at', 'updated_at'])
      .where('id', '=', 'test-1')
      .executeTakeFirstOrThrow();

    expect(row.updated_at! >= before).toBe(true);
    expect(row.updated_at! >= row.created_at!).toBe(true);
  });
});
