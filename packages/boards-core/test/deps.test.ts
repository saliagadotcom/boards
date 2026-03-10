import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type { Kysely } from 'kysely';
import type { Database } from '../src/schema.js';
import { migrate } from '../src/migrate.js';
import { createBoard } from '../src/boards.js';
import { createIssueWithId } from '../src/issues.js';
import { BoardsError } from '../src/errors.js';
import { addDependency, removeDependency, listDependencies } from '../src/deps.js';
import { addLabel } from '../src/labels.js';
import { createTestDb, BunDatabase } from './helpers.js';

describe('addDependency', () => {
  let db: Kysely<Database>;
  let raw: BunDatabase;

  beforeEach(async () => {
    const result = createTestDb();
    db = result.db;
    raw = result.raw;
    await migrate(db);
    await createBoard(db, { name: 'test' });
    await createIssueWithId(db, 'test-a', { board: 'test', title: 'A' });
    await createIssueWithId(db, 'test-b', { board: 'test', title: 'B' });
    await createIssueWithId(db, 'test-c', { board: 'test', title: 'C' });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('adds a blocks dependency successfully', async () => {
    await addDependency(db, { issue_id: 'test-a', depends_on_id: 'test-b', type: 'blocks' });

    const rows = await db.selectFrom('dependencies').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].issue_id).toBe('test-a');
    expect(rows[0].depends_on_id).toBe('test-b');
    expect(rows[0].type).toBe('blocks');
  });

  it('adds a related dependency successfully', async () => {
    await addDependency(db, { issue_id: 'test-a', depends_on_id: 'test-b', type: 'related' });

    const rows = await db.selectFrom('dependencies').selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe('related');
  });

  it('rejects self-dependency with self_dependency error', async () => {
    try {
      await addDependency(db, { issue_id: 'test-a', depends_on_id: 'test-a', type: 'blocks' });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('self_dependency');
    }
  });

  it('rejects when issue_id not found with not_found', async () => {
    try {
      await addDependency(db, { issue_id: 'test-nope', depends_on_id: 'test-b', type: 'blocks' });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('not_found');
    }
  });

  it('rejects when depends_on_id not found with not_found', async () => {
    try {
      await addDependency(db, { issue_id: 'test-a', depends_on_id: 'test-nope', type: 'blocks' });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('not_found');
    }
  });

  it('rejects cross-board dependency with cross_board error', async () => {
    await createBoard(db, { name: 'other' });
    await createIssueWithId(db, 'other-1', { board: 'other', title: 'Other' });

    try {
      await addDependency(db, { issue_id: 'test-a', depends_on_id: 'other-1', type: 'blocks' });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('cross_board');
    }
  });

  it('rejects duplicate dependency with conflict error', async () => {
    await addDependency(db, { issue_id: 'test-a', depends_on_id: 'test-b', type: 'blocks' });

    try {
      await addDependency(db, { issue_id: 'test-a', depends_on_id: 'test-b', type: 'blocks' });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('conflict');
    }
  });

  it('detects direct cycle A↔B with circular_dependency', async () => {
    await addDependency(db, { issue_id: 'test-a', depends_on_id: 'test-b', type: 'blocks' });

    try {
      await addDependency(db, { issue_id: 'test-b', depends_on_id: 'test-a', type: 'blocks' });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('circular_dependency');
    }
  });

  it('detects transitive cycle A→B→C→A with circular_dependency', async () => {
    await addDependency(db, { issue_id: 'test-a', depends_on_id: 'test-b', type: 'blocks' });
    await addDependency(db, { issue_id: 'test-b', depends_on_id: 'test-c', type: 'blocks' });

    try {
      await addDependency(db, { issue_id: 'test-c', depends_on_id: 'test-a', type: 'blocks' });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('circular_dependency');
    }
  });

  it('allows non-blocking types (related) to form cycles', async () => {
    await addDependency(db, { issue_id: 'test-a', depends_on_id: 'test-b', type: 'related' });
    await addDependency(db, { issue_id: 'test-b', depends_on_id: 'test-a', type: 'related' });

    const rows = await db.selectFrom('dependencies').selectAll().execute();
    expect(rows).toHaveLength(2);
  });

  it('adds parent-child and discovered-from dependency types', async () => {
    await addDependency(db, { issue_id: 'test-a', depends_on_id: 'test-b', type: 'parent-child' });
    await addDependency(db, { issue_id: 'test-b', depends_on_id: 'test-c', type: 'discovered-from' });

    const rows = await db.selectFrom('dependencies').selectAll().execute();
    expect(rows).toHaveLength(2);
    expect(rows[0].type).toBe('parent-child');
    expect(rows[1].type).toBe('discovered-from');
  });

  it('detects long chain cycle: A→B→C→D→E→F, then F→A', async () => {
    await createIssueWithId(db, 'test-d', { board: 'test', title: 'D' });
    await createIssueWithId(db, 'test-e', { board: 'test', title: 'E' });
    await createIssueWithId(db, 'test-f', { board: 'test', title: 'F' });

    await addDependency(db, { issue_id: 'test-a', depends_on_id: 'test-b', type: 'blocks' });
    await addDependency(db, { issue_id: 'test-b', depends_on_id: 'test-c', type: 'blocks' });
    await addDependency(db, { issue_id: 'test-c', depends_on_id: 'test-d', type: 'blocks' });
    await addDependency(db, { issue_id: 'test-d', depends_on_id: 'test-e', type: 'blocks' });
    await addDependency(db, { issue_id: 'test-e', depends_on_id: 'test-f', type: 'blocks' });

    try {
      await addDependency(db, { issue_id: 'test-f', depends_on_id: 'test-a', type: 'blocks' });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('circular_dependency');
    }
  });

  it('allows parent-child type to form cycles', async () => {
    await addDependency(db, { issue_id: 'test-a', depends_on_id: 'test-b', type: 'parent-child' });
    await addDependency(db, { issue_id: 'test-b', depends_on_id: 'test-a', type: 'parent-child' });

    const rows = await db.selectFrom('dependencies').selectAll().execute();
    expect(rows).toHaveLength(2);
  });

  it('mixed chain: related breaks blocks chain', async () => {
    await addDependency(db, { issue_id: 'test-a', depends_on_id: 'test-b', type: 'blocks' });
    await addDependency(db, { issue_id: 'test-b', depends_on_id: 'test-c', type: 'related' });

    await addDependency(db, { issue_id: 'test-c', depends_on_id: 'test-a', type: 'blocks' });

    const rows = await db.selectFrom('dependencies').selectAll().execute();
    expect(rows).toHaveLength(3);
  });

  it('no false positive: A→B→C, D→A is fine', async () => {
    await createIssueWithId(db, 'test-d', { board: 'test', title: 'D' });

    await addDependency(db, { issue_id: 'test-a', depends_on_id: 'test-b', type: 'blocks' });
    await addDependency(db, { issue_id: 'test-b', depends_on_id: 'test-c', type: 'blocks' });
    await addDependency(db, { issue_id: 'test-d', depends_on_id: 'test-a', type: 'blocks' });

    const rows = await db.selectFrom('dependencies').selectAll().execute();
    expect(rows).toHaveLength(3);
  });

  it('handles 100+ node chains without stack overflow', async () => {
    const count = 110;
    for (let i = 0; i < count; i++) {
      await createIssueWithId(db, `test-c${i}`, { board: 'test', title: `Chain ${i}` });
    }

    for (let i = 0; i < count - 1; i++) {
      await addDependency(db, {
        issue_id: `test-c${i}`,
        depends_on_id: `test-c${i + 1}`,
        type: 'blocks',
      });
    }

    try {
      await addDependency(db, {
        issue_id: `test-c${count - 1}`,
        depends_on_id: 'test-c0',
        type: 'blocks',
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('circular_dependency');
    }
  });
});

describe('removeDependency', () => {
  let db: Kysely<Database>;
  let raw: BunDatabase;

  beforeEach(async () => {
    const result = createTestDb();
    db = result.db;
    raw = result.raw;
    await migrate(db);
    await createBoard(db, { name: 'test' });
    await createIssueWithId(db, 'test-a', { board: 'test', title: 'A' });
    await createIssueWithId(db, 'test-b', { board: 'test', title: 'B' });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('removes existing dependency', async () => {
    await addDependency(db, { issue_id: 'test-a', depends_on_id: 'test-b', type: 'blocks' });

    await removeDependency(db, 'test-a', 'test-b');

    const rows = await db.selectFrom('dependencies').selectAll().execute();
    expect(rows).toHaveLength(0);
  });

  it('no error on non-existent dependency', async () => {
    await removeDependency(db, 'test-a', 'test-b');
  });
});

describe('listDependencies', () => {
  let db: Kysely<Database>;
  let raw: BunDatabase;

  beforeEach(async () => {
    const result = createTestDb();
    db = result.db;
    raw = result.raw;
    await migrate(db);
    await createBoard(db, { name: 'test' });
    await createIssueWithId(db, 'test-a', { board: 'test', title: 'A' });
    await createIssueWithId(db, 'test-b', { board: 'test', title: 'B' });
    await createIssueWithId(db, 'test-c', { board: 'test', title: 'C' });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('returns empty array when no deps', async () => {
    const deps = await listDependencies(db, 'test-a', 'down');
    expect(deps).toEqual([]);
  });

  it('returns downstream deps (direction=down)', async () => {
    await addDependency(db, { issue_id: 'test-a', depends_on_id: 'test-b', type: 'blocks' });

    const deps = await listDependencies(db, 'test-a', 'down');
    expect(deps).toHaveLength(1);
    expect(deps[0].issue.id).toBe('test-b');
    expect(deps[0].type).toBe('blocks');
  });

  it('returns upstream deps (direction=up)', async () => {
    await addDependency(db, { issue_id: 'test-a', depends_on_id: 'test-b', type: 'blocks' });

    const deps = await listDependencies(db, 'test-b', 'up');
    expect(deps).toHaveLength(1);
    expect(deps[0].issue.id).toBe('test-a');
    expect(deps[0].type).toBe('blocks');
  });

  it('returns resolved Issue objects with each dependency', async () => {
    await addLabel(db, 'test-b', 'urgent');
    await addLabel(db, 'test-b', 'backend');
    await addDependency(db, { issue_id: 'test-a', depends_on_id: 'test-b', type: 'blocks' });

    const deps = await listDependencies(db, 'test-a', 'down');
    expect(deps).toHaveLength(1);

    const dep = deps[0];
    expect(dep.type).toBe('blocks');
    expect(typeof dep.created_at).toBe('string');

    const issue = dep.issue;
    expect(issue.id).toBe('test-b');
    expect(issue.title).toBe('B');
    expect(issue.board).toBe('test');
    expect(issue.status).toBe('open');
    expect(issue.priority).toBe(1);
    expect(issue.issue_type).toBe('task');
    expect(issue.description).toBe('');
    expect(issue.assignee).toBe('');
    expect(issue.owner).toBe('');
    expect(issue.closed_at).toBeNull();
    expect(issue.close_reason).toBe('');
    expect(typeof issue.created_at).toBe('string');
    expect(typeof issue.updated_at).toBe('string');
    expect(issue.labels).toEqual(['backend', 'urgent']);
  });

  it('filters by type', async () => {
    await addDependency(db, { issue_id: 'test-a', depends_on_id: 'test-b', type: 'blocks' });
    await addDependency(db, { issue_id: 'test-a', depends_on_id: 'test-c', type: 'related' });

    const blocksOnly = await listDependencies(db, 'test-a', 'down', 'blocks');
    expect(blocksOnly).toHaveLength(1);
    expect(blocksOnly[0].issue.id).toBe('test-b');

    const relatedOnly = await listDependencies(db, 'test-a', 'down', 'related');
    expect(relatedOnly).toHaveLength(1);
    expect(relatedOnly[0].issue.id).toBe('test-c');
  });
});
