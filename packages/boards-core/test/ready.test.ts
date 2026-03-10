import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type { Kysely } from 'kysely';
import type { Database } from '../src/schema.js';
import { migrate } from '../src/migrate.js';
import { createBoard } from '../src/boards.js';
import { createIssueWithId, updateIssue, closeIssue } from '../src/issues.js';
import { readyWork } from '../src/ready.js';
import { addDependency } from '../src/deps.js';
import { addLabel } from '../src/labels.js';
import { createTestDb, BunDatabase } from './helpers.js';

describe('readyWork', () => {
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

  it('returns open issue with no dependencies', async () => {
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'Issue 1' });

    const results = await readyWork(db, 'test');

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('test-1');
    expect(results[0].status).toBe('open');
  });

  it('excludes open issue blocked by open issue', async () => {
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'Blocker' });
    await createIssueWithId(db, 'test-2', { board: 'test', title: 'Blocked' });
    await addDependency(db, { issue_id: 'test-2', depends_on_id: 'test-1', type: 'blocks' });

    const results = await readyWork(db, 'test');

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('test-1');
  });

  it('includes open issue blocked by closed issue (blocker resolved)', async () => {
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'Blocker' });
    await createIssueWithId(db, 'test-2', { board: 'test', title: 'Blocked' });
    await addDependency(db, { issue_id: 'test-2', depends_on_id: 'test-1', type: 'blocks' });
    await closeIssue(db, 'test-1');

    const results = await readyWork(db, 'test');

    const ids = results.map((r) => r.id);
    expect(ids).toContain('test-2');
  });

  it('includes open issue with only related dep on open issue (non-blocking)', async () => {
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'Related A' });
    await createIssueWithId(db, 'test-2', { board: 'test', title: 'Related B' });
    await addDependency(db, { issue_id: 'test-2', depends_on_id: 'test-1', type: 'related' });

    const results = await readyWork(db, 'test');

    const ids = results.map((r) => r.id);
    expect(ids).toContain('test-1');
    expect(ids).toContain('test-2');
  });

  it('includes open issue with only parent-child dep on open issue (non-blocking)', async () => {
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'Parent' });
    await createIssueWithId(db, 'test-2', { board: 'test', title: 'Child' });
    await addDependency(db, { issue_id: 'test-2', depends_on_id: 'test-1', type: 'parent-child' });

    const results = await readyWork(db, 'test');

    const ids = results.map((r) => r.id);
    expect(ids).toContain('test-1');
    expect(ids).toContain('test-2');
  });

  it('excludes closed issues from results (even if unblocked)', async () => {
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'Issue 1' });
    await closeIssue(db, 'test-1');

    const results = await readyWork(db, 'test');

    expect(results).toHaveLength(0);
  });

  it('includes in_progress issues in results (unblocked work)', async () => {
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'Issue 1' });
    await updateIssue(db, 'test-1', { status: 'in_progress' });

    const results = await readyWork(db, 'test');

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('test-1');
    expect(results[0].status).toBe('in_progress');
  });

  it('filters by assignee', async () => {
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'Alice task', assignee: 'alice' });
    await createIssueWithId(db, 'test-2', { board: 'test', title: 'Bob task', assignee: 'bob' });

    const results = await readyWork(db, 'test', { assignee: 'alice' });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('test-1');
  });

  it('filters by unassigned (assignee is null/empty)', async () => {
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'Unassigned' });
    await createIssueWithId(db, 'test-2', { board: 'test', title: 'Assigned', assignee: 'alice' });

    const results = await readyWork(db, 'test', { unassigned: true });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('test-1');
  });

  it('filters by priority', async () => {
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'High', priority: 0 });
    await createIssueWithId(db, 'test-2', { board: 'test', title: 'Low', priority: 3 });

    const results = await readyWork(db, 'test', { priority: 0 });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('test-1');
  });

  it('filters by issue_type', async () => {
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'Bug fix', issue_type: 'bug' });
    await createIssueWithId(db, 'test-2', { board: 'test', title: 'Feature', issue_type: 'feature' });

    const results = await readyWork(db, 'test', { issue_type: 'bug' });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('test-1');
  });

  it('filters by label', async () => {
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'Urgent' });
    await createIssueWithId(db, 'test-2', { board: 'test', title: 'Normal' });
    await addLabel(db, 'test-1', 'urgent');

    const results = await readyWork(db, 'test', { label: 'urgent' });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('test-1');
  });

  it('results ordered by priority ASC, created_at ASC', async () => {
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'Low priority', priority: 3 });
    await createIssueWithId(db, 'test-2', { board: 'test', title: 'High priority', priority: 0 });
    await createIssueWithId(db, 'test-3', { board: 'test', title: 'High priority older', priority: 0 });

    const results = await readyWork(db, 'test');

    expect(results).toHaveLength(3);
    expect(results[0].id).toBe('test-2');
    expect(results[1].id).toBe('test-3');
    expect(results[2].id).toBe('test-1');
  });

  it('returns empty array when no issues are ready', async () => {
    const results = await readyWork(db, 'test');

    expect(results).toHaveLength(0);
    expect(results).toEqual([]);
  });

  it('handles issue with multiple deps (one blocks resolved, one blocks unresolved → excluded)', async () => {
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'Resolved blocker' });
    await createIssueWithId(db, 'test-2', { board: 'test', title: 'Unresolved blocker' });
    await createIssueWithId(db, 'test-3', { board: 'test', title: 'Blocked by both' });
    await addDependency(db, { issue_id: 'test-3', depends_on_id: 'test-1', type: 'blocks' });
    await addDependency(db, { issue_id: 'test-3', depends_on_id: 'test-2', type: 'blocks' });
    await closeIssue(db, 'test-1');

    const results = await readyWork(db, 'test');

    const ids = results.map((r) => r.id);
    expect(ids).not.toContain('test-3');
    expect(ids).toContain('test-2');
  });

  it('excludes epics from results by default', async () => {
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'Regular task' });
    await createIssueWithId(db, 'test-2', { board: 'test', title: 'Epic container', issue_type: 'epic' });

    const results = await readyWork(db, 'test');

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('test-1');
  });

  it('includes epics when include_epics filter is set', async () => {
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'Regular task' });
    await createIssueWithId(db, 'test-2', { board: 'test', title: 'Epic container', issue_type: 'epic' });

    const results = await readyWork(db, 'test', { include_epics: true });

    expect(results).toHaveLength(2);
  });

  it('includes epics when explicitly filtering by type epic', async () => {
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'Regular task' });
    await createIssueWithId(db, 'test-2', { board: 'test', title: 'Epic container', issue_type: 'epic' });

    const results = await readyWork(db, 'test', { issue_type: 'epic' });

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('test-2');
  });

  it('excludes children of blocked parents from ready work', async () => {
    // Epic 1 (blocker) and Epic 2 (blocked by Epic 1)
    await createIssueWithId(db, 'test-epic1', { board: 'test', title: 'Epic 1', issue_type: 'epic' });
    await createIssueWithId(db, 'test-epic2', { board: 'test', title: 'Epic 2', issue_type: 'epic' });

    // Children of each epic
    await createIssueWithId(db, 'test-e1t1', { board: 'test', title: 'E1 Task A' });
    await createIssueWithId(db, 'test-e1t2', { board: 'test', title: 'E1 Task B' });
    await createIssueWithId(db, 'test-e2t1', { board: 'test', title: 'E2 Task A' });
    await createIssueWithId(db, 'test-e2t2', { board: 'test', title: 'E2 Task B' });

    // Parent-child relationships (issue_id=parent, depends_on_id=child)
    await addDependency(db, { issue_id: 'test-epic1', depends_on_id: 'test-e1t1', type: 'parent-child' });
    await addDependency(db, { issue_id: 'test-epic1', depends_on_id: 'test-e1t2', type: 'parent-child' });
    await addDependency(db, { issue_id: 'test-epic2', depends_on_id: 'test-e2t1', type: 'parent-child' });
    await addDependency(db, { issue_id: 'test-epic2', depends_on_id: 'test-e2t2', type: 'parent-child' });

    // Epic 2 is blocked by Epic 1
    await addDependency(db, { issue_id: 'test-epic2', depends_on_id: 'test-epic1', type: 'blocks' });

    const results = await readyWork(db, 'test');
    const ids = results.map((r) => r.id);

    // Only Epic 1's children should be ready
    expect(ids).toContain('test-e1t1');
    expect(ids).toContain('test-e1t2');
    expect(ids).not.toContain('test-e2t1');
    expect(ids).not.toContain('test-e2t2');
  });

  it('children become ready once parent epic is unblocked', async () => {
    await createIssueWithId(db, 'test-blocker', { board: 'test', title: 'Blocker', issue_type: 'epic' });
    await createIssueWithId(db, 'test-epic', { board: 'test', title: 'Gated Epic', issue_type: 'epic' });
    await createIssueWithId(db, 'test-child', { board: 'test', title: 'Child Task' });

    await addDependency(db, { issue_id: 'test-epic', depends_on_id: 'test-child', type: 'parent-child' });
    await addDependency(db, { issue_id: 'test-epic', depends_on_id: 'test-blocker', type: 'blocks' });

    // Before closing blocker: child should NOT be ready
    let results = await readyWork(db, 'test');
    let ids = results.map((r) => r.id);
    expect(ids).not.toContain('test-child');

    // Close the blocker → epic is unblocked → child becomes ready
    await closeIssue(db, 'test-blocker');

    results = await readyWork(db, 'test');
    ids = results.map((r) => r.id);
    expect(ids).toContain('test-child');
  });
});
