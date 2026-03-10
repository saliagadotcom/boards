import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type { Kysely } from 'kysely';
import type { Database } from '../src/schema.js';
import { migrate } from '../src/migrate.js';
import { createBoard } from '../src/boards.js';
import { createIssueWithId } from '../src/issues.js';
import { BoardsError } from '../src/errors.js';
import { searchIssues } from '../src/search.js';
import { addLabel } from '../src/labels.js';
import { createTestDb, BunDatabase } from './helpers.js';

describe('searchIssues', () => {
  let db: Kysely<Database>;
  let raw: BunDatabase;

  beforeEach(async () => {
    const result = createTestDb();
    db = result.db;
    raw = result.raw;
    await migrate(db);
    await createBoard(db, { name: 'test' });
    await createIssueWithId(db, 'test-1', {
      board: 'test',
      title: 'Fix login bug',
      description: 'Users cannot log in',
      priority: 0,
    });
    await createIssueWithId(db, 'test-2', {
      board: 'test',
      title: 'Add dashboard',
      description: 'Build the main dashboard view',
      priority: 2,
    });
    await createIssueWithId(db, 'test-3', {
      board: 'test',
      title: 'Update README',
      description: 'Add setup instructions',
      priority: 1,
    });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('matches in title are returned', async () => {
    const results = await searchIssues(db, 'test', 'login');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('test-1');
  });

  it('matches in description are returned', async () => {
    const results = await searchIssues(db, 'test', 'dashboard view');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('test-2');
  });

  it('matching is case-insensitive', async () => {
    const results = await searchIssues(db, 'test', 'FIX LOGIN');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('test-1');
  });

  it('case-insensitive matching works on description', async () => {
    const results = await searchIssues(db, 'test', 'CANNOT LOG');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('test-1');
  });

  it('results ordered by priority ASC, created_at ASC', async () => {
    const results = await searchIssues(db, 'test', 'a');
    expect(results.length).toBeGreaterThanOrEqual(2);

    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1];
      const curr = results[i];
      if (prev.priority === curr.priority) {
        expect(prev.created_at <= curr.created_at).toBe(true);
      } else {
        expect(prev.priority < curr.priority).toBe(true);
      }
    }
  });

  it('no matches returns empty array', async () => {
    const results = await searchIssues(db, 'test', 'zzz-nonexistent-query');
    expect(results).toEqual([]);
  });

  it('escapes % wildcard in search query', async () => {
    await createIssueWithId(db, 'test-pct', {
      board: 'test',
      title: '100% complete',
      description: 'Done',
    });

    const results = await searchIssues(db, 'test', '100%');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('test-pct');
  });

  it('escapes _ wildcard in search query', async () => {
    await createIssueWithId(db, 'test-under', {
      board: 'test',
      title: 'foo_bar method',
      description: 'Description',
    });

    const results = await searchIssues(db, 'test', 'foo_bar');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('test-under');
  });

  it('% in search does not match everything', async () => {
    const results = await searchIssues(db, 'test', '%');
    // Should only match issues that literally contain %, not all issues
    expect(results).toHaveLength(0);
  });

  it('results include labels', async () => {
    await addLabel(db, 'test-1', 'bug');
    await addLabel(db, 'test-1', 'urgent');

    const results = await searchIssues(db, 'test', 'login');
    expect(results).toHaveLength(1);
    expect(results[0].labels).toContain('bug');
    expect(results[0].labels).toContain('urgent');
  });
});
