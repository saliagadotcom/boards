import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type { Kysely } from 'kysely';
import type { Database } from '../src/schema.js';
import { migrate } from '../src/migrate.js';
import {
  createIssue,
  createIssueWithId,
  showIssue,
  listIssues,
  updateIssue,
  closeIssue,
  deleteIssue,
} from '../src/issues.js';
import { createBoard } from '../src/boards.js';
import { BoardsError } from '../src/errors.js';
import { createTestDb, BunDatabase } from './helpers.js';

describe('createIssue', () => {
  let db: Kysely<Database>;
  let raw: BunDatabase;

  beforeEach(async () => {
    const result = createTestDb();
    db = result.db;
    raw = result.raw;
    await migrate(db);
    await createBoard(db, { name: 'test' });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('creates issue with generated ID matching ^prefix-[a-z0-9]{6}$', async () => {
    const issue = await createIssue(db, { board: 'test', title: 'My issue' });
    expect(issue.id).toMatch(/^test-[a-z0-9]{6}$/);
  });

  it('creates issue with default status=open, priority=1, issue_type=task', async () => {
    const issue = await createIssue(db, { board: 'test', title: 'Defaults' });
    expect(issue.status).toBe('open');
    expect(issue.priority).toBe(1);
    expect(issue.issue_type).toBe('task');
  });

  it('creates issue with all optional fields populated', async () => {
    const issue = await createIssue(db, {
      board: 'test',
      title: 'Full issue',
      description: 'A description',
      design: 'Some design',
      acceptance_criteria: 'AC here',
      notes: 'Some notes',
      priority: 3,
      issue_type: 'bug',
      assignee: 'alice',
      owner: 'bob',
      labels: ['urgent', 'frontend'],
    });

    expect(issue.title).toBe('Full issue');
    expect(issue.description).toBe('A description');
    expect(issue.design).toBe('Some design');
    expect(issue.acceptance_criteria).toBe('AC here');
    expect(issue.notes).toBe('Some notes');
    expect(issue.priority).toBe(3);
    expect(issue.issue_type).toBe('bug');
    expect(issue.assignee).toBe('alice');
    expect(issue.owner).toBe('bob');
    expect(issue.labels).toEqual(['urgent', 'frontend']);
  });

  it('creates issue with labels', async () => {
    const issue = await createIssue(db, {
      board: 'test',
      title: 'Labeled',
      labels: ['bug', 'p0'],
    });
    expect(issue.labels).toEqual(['bug', 'p0']);
  });

  it('rejects empty title with invalid_request', async () => {
    try {
      await createIssue(db, { board: 'test', title: '' });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('invalid_request');
    }
  });

  it('rejects whitespace-only title with invalid_request', async () => {
    try {
      await createIssue(db, { board: 'test', title: '   ' });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('invalid_request');
    }
  });

  it('rejects unknown issue_type with invalid_request', async () => {
    try {
      await createIssue(db, {
        board: 'test',
        title: 'Bad type',
        issue_type: 'invalid' as any,
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('invalid_request');
    }
  });

  it('rejects non-existent board with not_found', async () => {
    try {
      await createIssue(db, { board: 'nonexistent', title: 'Orphan' });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('not_found');
    }
  });

  it('clamps priority 5 → 4', async () => {
    const issue = await createIssue(db, {
      board: 'test',
      title: 'High priority',
      priority: 5,
    });
    expect(issue.priority).toBe(4);
  });

  it('clamps priority -1 → 0', async () => {
    const issue = await createIssue(db, {
      board: 'test',
      title: 'Negative priority',
      priority: -1,
    });
    expect(issue.priority).toBe(0);
  });

  it('createIssueWithId creates issue with exact provided ID', async () => {
    const issue = await createIssueWithId(db, 'test-customid', {
      board: 'test',
      title: 'Custom ID issue',
    });
    expect(issue.id).toBe('test-customid');
  });

  it('createIssueWithId rejects invalid ID format with invalid_request', async () => {
    try {
      await createIssueWithId(db, 'INVALID', {
        board: 'test',
        title: 'Bad ID',
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('invalid_request');
    }
  });

  it('createIssueWithId rejects ID without prefix-suffix format', async () => {
    try {
      await createIssueWithId(db, 'nohyphen', {
        board: 'test',
        title: 'Bad ID',
      });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('invalid_request');
    }
  });

  it('createIssueWithId accepts valid ID format', async () => {
    const issue = await createIssueWithId(db, 'test-abc123', {
      board: 'test',
      title: 'Valid ID',
    });
    expect(issue.id).toBe('test-abc123');
  });
});

describe('showIssue', () => {
  let db: Kysely<Database>;
  let raw: BunDatabase;

  beforeEach(async () => {
    const result = createTestDb();
    db = result.db;
    raw = result.raw;
    await migrate(db);
    await createBoard(db, { name: 'test' });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('returns issue with labels array', async () => {
    await createIssueWithId(db, 'test-abc123', {
      board: 'test',
      title: 'Show me',
      labels: ['bug', 'urgent'],
    });

    const detail = await showIssue(db, 'test-abc123');
    expect(detail.issue.id).toBe('test-abc123');
    expect(detail.issue.title).toBe('Show me');
    expect(detail.issue.labels).toEqual(['bug', 'urgent']);
    expect(detail.dependencies).toEqual([]);
    expect(detail.dependents).toEqual([]);
  });

  it('returns issue with dependencies and dependents', async () => {
    await createIssueWithId(db, 'test-issue1', {
      board: 'test',
      title: 'Issue 1',
    });
    await createIssueWithId(db, 'test-issue2', {
      board: 'test',
      title: 'Issue 2',
    });
    await createIssueWithId(db, 'test-issue3', {
      board: 'test',
      title: 'Issue 3',
    });

    // test-issue2 depends on test-issue1 (test-issue1 blocks test-issue2)
    await db
      .insertInto('dependencies')
      .values({
        issue_id: 'test-issue2',
        depends_on_id: 'test-issue1',
        type: 'blocks',
        created_at: new Date().toISOString(),
      })
      .execute();

    // test-issue3 depends on test-issue2
    await db
      .insertInto('dependencies')
      .values({
        issue_id: 'test-issue3',
        depends_on_id: 'test-issue2',
        type: 'related',
        created_at: new Date().toISOString(),
      })
      .execute();

    const detail = await showIssue(db, 'test-issue2');

    // test-issue2 depends on test-issue1
    expect(detail.dependencies).toHaveLength(1);
    expect(detail.dependencies[0].issue.id).toBe('test-issue1');
    expect(detail.dependencies[0].type).toBe('blocks');

    // test-issue3 depends on test-issue2, so test-issue3 is a dependent
    expect(detail.dependents).toHaveLength(1);
    expect(detail.dependents[0].issue.id).toBe('test-issue3');
    expect(detail.dependents[0].type).toBe('related');
  });

  it('throws not_found for non-existent issue ID', async () => {
    try {
      await showIssue(db, 'test-nope');
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('not_found');
    }
  });
});

describe('listIssues', () => {
  let db: Kysely<Database>;
  let raw: BunDatabase;

  beforeEach(async () => {
    const result = createTestDb();
    db = result.db;
    raw = result.raw;
    await migrate(db);
    await createBoard(db, { name: 'test' });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('returns empty array for board with no issues', async () => {
    const issues = await listIssues(db, 'test');
    expect(issues).toEqual([]);
  });

  it('returns issues ordered by priority ASC, created_at ASC', async () => {
    await createIssueWithId(db, 'test-aaa', {
      board: 'test',
      title: 'Low priority',
      priority: 3,
    });
    await createIssueWithId(db, 'test-bbb', {
      board: 'test',
      title: 'High priority',
      priority: 0,
    });
    await createIssueWithId(db, 'test-ccc', {
      board: 'test',
      title: 'Also high priority',
      priority: 0,
    });

    const issues = await listIssues(db, 'test');
    expect(issues).toHaveLength(3);
    // priority 0 first, then priority 3
    expect(issues[0].id).toBe('test-bbb');
    expect(issues[1].id).toBe('test-ccc');
    expect(issues[2].id).toBe('test-aaa');
  });

  it('filters by status', async () => {
    await createIssueWithId(db, 'test-open', {
      board: 'test',
      title: 'Open',
    });
    const ip = await createIssueWithId(db, 'test-ip', {
      board: 'test',
      title: 'In progress',
    });
    await updateIssue(db, 'test-ip', { status: 'in_progress' });

    const issues = await listIssues(db, 'test', { status: 'in_progress' });
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe('test-ip');
  });

  it('filters by priority', async () => {
    await createIssueWithId(db, 'test-p0', {
      board: 'test',
      title: 'P0',
      priority: 0,
    });
    await createIssueWithId(db, 'test-p2', {
      board: 'test',
      title: 'P2',
      priority: 2,
    });

    const issues = await listIssues(db, 'test', { priority: 0 });
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe('test-p0');
  });

  it('filters by issue_type', async () => {
    await createIssueWithId(db, 'test-bug', {
      board: 'test',
      title: 'A bug',
      issue_type: 'bug',
    });
    await createIssueWithId(db, 'test-feat', {
      board: 'test',
      title: 'A feature',
      issue_type: 'feature',
    });

    const issues = await listIssues(db, 'test', { issue_type: 'bug' });
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe('test-bug');
  });

  it('filters by assignee', async () => {
    await createIssueWithId(db, 'test-alice', {
      board: 'test',
      title: 'Alice task',
      assignee: 'alice',
    });
    await createIssueWithId(db, 'test-bob', {
      board: 'test',
      title: 'Bob task',
      assignee: 'bob',
    });

    const issues = await listIssues(db, 'test', { assignee: 'alice' });
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe('test-alice');
  });

  it('filters by label', async () => {
    await createIssueWithId(db, 'test-labeled', {
      board: 'test',
      title: 'Labeled',
      labels: ['frontend', 'urgent'],
    });
    await createIssueWithId(db, 'test-unlabeled', {
      board: 'test',
      title: 'Unlabeled',
    });

    const issues = await listIssues(db, 'test', { label: 'frontend' });
    expect(issues).toHaveLength(1);
    expect(issues[0].id).toBe('test-labeled');
  });

  it('each issue includes its labels array', async () => {
    await createIssueWithId(db, 'test-lbl', {
      board: 'test',
      title: 'With labels',
      labels: ['api', 'backend'],
    });
    await createIssueWithId(db, 'test-nolbl', {
      board: 'test',
      title: 'No labels',
    });

    const issues = await listIssues(db, 'test');
    const withLabels = issues.find((i) => i.id === 'test-lbl')!;
    const noLabels = issues.find((i) => i.id === 'test-nolbl')!;

    expect(withLabels.labels).toEqual(['api', 'backend']);
    expect(noLabels.labels).toEqual([]);
  });
});

describe('updateIssue', () => {
  let db: Kysely<Database>;
  let raw: BunDatabase;

  beforeEach(async () => {
    const result = createTestDb();
    db = result.db;
    raw = result.raw;
    await migrate(db);
    await createBoard(db, { name: 'test' });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('updates title, description, design, acceptance_criteria, notes, assignee, owner', async () => {
    await createIssueWithId(db, 'test-upd', {
      board: 'test',
      title: 'Original',
    });

    const updated = await updateIssue(db, 'test-upd', {
      title: 'New title',
      description: 'New desc',
      design: 'New design',
      acceptance_criteria: 'New AC',
      notes: 'New notes',
      assignee: 'charlie',
      owner: 'dave',
    });

    expect(updated.title).toBe('New title');
    expect(updated.description).toBe('New desc');
    expect(updated.design).toBe('New design');
    expect(updated.acceptance_criteria).toBe('New AC');
    expect(updated.notes).toBe('New notes');
    expect(updated.assignee).toBe('charlie');
    expect(updated.owner).toBe('dave');
  });

  it('updates priority (clamped to 0-4)', async () => {
    await createIssueWithId(db, 'test-pri', {
      board: 'test',
      title: 'Priority test',
    });

    const high = await updateIssue(db, 'test-pri', { priority: 10 });
    expect(high.priority).toBe(4);

    const low = await updateIssue(db, 'test-pri', { priority: -5 });
    expect(low.priority).toBe(0);

    const normal = await updateIssue(db, 'test-pri', { priority: 2 });
    expect(normal.priority).toBe(2);
  });

  it('replaces labels entirely on update (replace-all semantics)', async () => {
    await createIssueWithId(db, 'test-lbl', {
      board: 'test',
      title: 'Labels test',
      labels: ['old1', 'old2'],
    });

    const updated = await updateIssue(db, 'test-lbl', {
      labels: ['new1', 'new2', 'new3'],
    });

    expect(updated.labels).toEqual(['new1', 'new2', 'new3']);
  });

  it('updating with empty labels array removes all labels', async () => {
    await createIssueWithId(db, 'test-empty', {
      board: 'test',
      title: 'Remove labels',
      labels: ['a', 'b'],
    });

    const updated = await updateIssue(db, 'test-empty', { labels: [] });
    expect(updated.labels).toEqual([]);
  });

  it('refreshes updated_at timestamp', async () => {
    const created = await createIssueWithId(db, 'test-ts', {
      board: 'test',
      title: 'Timestamp test',
    });
    const originalUpdatedAt = created.updated_at;

    // Small delay to ensure timestamp differs
    await new Promise((resolve) => setTimeout(resolve, 10));

    const updated = await updateIssue(db, 'test-ts', { title: 'Changed' });
    expect(updated.updated_at).not.toBe(originalUpdatedAt);
  });

  it('throws not_found for non-existent issue', async () => {
    try {
      await updateIssue(db, 'test-nope', { title: 'Nope' });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('not_found');
    }
  });

  it('rejects empty title with invalid_request', async () => {
    await createIssueWithId(db, 'test-emptytitle', {
      board: 'test',
      title: 'Original',
    });

    try {
      await updateIssue(db, 'test-emptytitle', { title: '' });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('invalid_request');
    }
  });

  it('rejects whitespace-only title with invalid_request', async () => {
    await createIssueWithId(db, 'test-wstitle', {
      board: 'test',
      title: 'Original',
    });

    try {
      await updateIssue(db, 'test-wstitle', { title: '   ' });
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('invalid_request');
    }
  });

  it('allows updating description without title validation', async () => {
    await createIssueWithId(db, 'test-notitle', {
      board: 'test',
      title: 'Keep this',
    });

    const updated = await updateIssue(db, 'test-notitle', { description: 'new desc' });
    expect(updated.title).toBe('Keep this');
    expect(updated.description).toBe('new desc');
  });
});

describe('status transitions', () => {
  let db: Kysely<Database>;
  let raw: BunDatabase;

  beforeEach(async () => {
    const result = createTestDb();
    db = result.db;
    raw = result.raw;
    await migrate(db);
    await createBoard(db, { name: 'test' });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('open → in_progress: succeeds', async () => {
    await createIssueWithId(db, 'test-s1', {
      board: 'test',
      title: 'Transition test',
    });

    const updated = await updateIssue(db, 'test-s1', {
      status: 'in_progress',
    });
    expect(updated.status).toBe('in_progress');
  });

  it('open → closed: succeeds (via closeIssue)', async () => {
    await createIssueWithId(db, 'test-s2', {
      board: 'test',
      title: 'Close from open',
    });

    const closed = await closeIssue(db, 'test-s2', 'Done');
    expect(closed.status).toBe('closed');
    expect(closed.closed_at).toBeTruthy();
    expect(closed.close_reason).toBe('Done');
  });

  it('in_progress → open: succeeds', async () => {
    await createIssueWithId(db, 'test-s3', {
      board: 'test',
      title: 'Back to open',
    });
    await updateIssue(db, 'test-s3', { status: 'in_progress' });

    const updated = await updateIssue(db, 'test-s3', { status: 'open' });
    expect(updated.status).toBe('open');
  });

  it('in_progress → closed: succeeds', async () => {
    await createIssueWithId(db, 'test-s4', {
      board: 'test',
      title: 'Close from IP',
    });
    await updateIssue(db, 'test-s4', { status: 'in_progress' });

    const closed = await closeIssue(db, 'test-s4');
    expect(closed.status).toBe('closed');
  });

  it('closed → open: succeeds, clears closed_at to null', async () => {
    await createIssueWithId(db, 'test-s5', {
      board: 'test',
      title: 'Reopen',
    });
    await closeIssue(db, 'test-s5', 'Closing');

    const reopened = await updateIssue(db, 'test-s5', { status: 'open' });
    expect(reopened.status).toBe('open');
    expect(reopened.closed_at).toBeNull();
    expect(reopened.close_reason).toBe('');
  });

  it('closed → in_progress: allowed (reopens issue)', async () => {
    await createIssueWithId(db, 'test-s6', {
      board: 'test',
      title: 'Reopen transition',
    });
    await closeIssue(db, 'test-s6');

    const result = await updateIssue(db, 'test-s6', { status: 'in_progress' });
    expect(result.status).toBe('in_progress');
    expect(result.closed_at).toBeNull();
    expect(result.close_reason).toBe('');
  });
});

describe('closeIssue', () => {
  let db: Kysely<Database>;
  let raw: BunDatabase;

  beforeEach(async () => {
    const result = createTestDb();
    db = result.db;
    raw = result.raw;
    await migrate(db);
    await createBoard(db, { name: 'test' });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('sets status=closed, closed_at=ISO timestamp, close_reason', async () => {
    await createIssueWithId(db, 'test-cl1', {
      board: 'test',
      title: 'Close me',
    });

    const closed = await closeIssue(db, 'test-cl1', 'Resolved');
    expect(closed.status).toBe('closed');
    expect(closed.closed_at).toBeTruthy();
    // Verify it's a valid ISO date
    expect(new Date(closed.closed_at!).toISOString()).toBe(closed.closed_at);
    expect(closed.close_reason).toBe('Resolved');
  });

  it('throws not_found for non-existent issue', async () => {
    try {
      await closeIssue(db, 'test-nope');
      expect(true).toBe(false);
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('not_found');
    }
  });

  it('closed → closed: no-op success (idempotent)', async () => {
    await createIssueWithId(db, 'test-cl2', {
      board: 'test',
      title: 'Already closed',
    });
    const first = await closeIssue(db, 'test-cl2', 'First close');
    const second = await closeIssue(db, 'test-cl2', 'Second close');

    expect(second.status).toBe('closed');
    // Should retain original closed_at and close_reason (idempotent)
    expect(second.closed_at).toBe(first.closed_at);
    expect(second.close_reason).toBe(first.close_reason);
  });
});

describe('deleteIssue', () => {
  let db: Kysely<Database>;
  let raw: BunDatabase;

  beforeEach(async () => {
    const result = createTestDb();
    db = result.db;
    raw = result.raw;
    await migrate(db);
    await createBoard(db, { name: 'test' });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('deletes issue and cascades to deps and labels', async () => {
    await createIssueWithId(db, 'test-del1', {
      board: 'test',
      title: 'To delete',
      labels: ['bug'],
    });
    await createIssueWithId(db, 'test-del2', {
      board: 'test',
      title: 'Dependent',
    });

    await db
      .insertInto('dependencies')
      .values({
        issue_id: 'test-del2',
        depends_on_id: 'test-del1',
        type: 'blocks',
        created_at: new Date().toISOString(),
      })
      .execute();

    await deleteIssue(db, 'test-del1');

    const issues = await db
      .selectFrom('issues')
      .selectAll()
      .where('id', '=', 'test-del1')
      .execute();
    expect(issues).toHaveLength(0);

    const deps = await db
      .selectFrom('dependencies')
      .selectAll()
      .where('depends_on_id', '=', 'test-del1')
      .execute();
    expect(deps).toHaveLength(0);

    const labels = await db
      .selectFrom('labels')
      .selectAll()
      .where('issue_id', '=', 'test-del1')
      .execute();
    expect(labels).toHaveLength(0);
  });

  it('no error on non-existent issue', async () => {
    await deleteIssue(db, 'test-nonexistent');
  });
});
