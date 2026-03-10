import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type { Kysely } from 'kysely';
import type { Database } from '../src/schema.js';
import { migrate } from '../src/migrate.js';
import { createBoard } from '../src/boards.js';
import { createIssueWithId, closeIssue } from '../src/issues.js';
import { getEpicsEligibleForClosure } from '../src/epic.js';
import { addDependency } from '../src/deps.js';
import { createTestDb, BunDatabase } from './helpers.js';

describe('getEpicsEligibleForClosure', () => {
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

  it('returns empty array when no epics exist', async () => {
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'A task' });

    const results = await getEpicsEligibleForClosure(db, 'test');

    expect(results).toHaveLength(0);
  });

  it('excludes epics with no children', async () => {
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'Lone epic', issue_type: 'epic' });

    const results = await getEpicsEligibleForClosure(db, 'test');

    expect(results).toHaveLength(0);
  });

  it('returns epic with mixed children as not eligible', async () => {
    await createIssueWithId(db, 'test-epic', { board: 'test', title: 'My Epic', issue_type: 'epic' });
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'Child 1' });
    await createIssueWithId(db, 'test-2', { board: 'test', title: 'Child 2' });
    await addDependency(db, { issue_id: 'test-epic', depends_on_id: 'test-1', type: 'parent-child' });
    await addDependency(db, { issue_id: 'test-epic', depends_on_id: 'test-2', type: 'parent-child' });
    await closeIssue(db, 'test-1');

    const results = await getEpicsEligibleForClosure(db, 'test');

    expect(results).toHaveLength(1);
    expect(results[0].epic.id).toBe('test-epic');
    expect(results[0].totalChildren).toBe(2);
    expect(results[0].closedChildren).toBe(1);
    expect(results[0].eligibleForClose).toBe(false);
  });

  it('returns epic as eligible when all children are closed', async () => {
    await createIssueWithId(db, 'test-epic', { board: 'test', title: 'My Epic', issue_type: 'epic' });
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'Child 1' });
    await createIssueWithId(db, 'test-2', { board: 'test', title: 'Child 2' });
    await addDependency(db, { issue_id: 'test-epic', depends_on_id: 'test-1', type: 'parent-child' });
    await addDependency(db, { issue_id: 'test-epic', depends_on_id: 'test-2', type: 'parent-child' });
    await closeIssue(db, 'test-1');
    await closeIssue(db, 'test-2');

    const results = await getEpicsEligibleForClosure(db, 'test');

    expect(results).toHaveLength(1);
    expect(results[0].eligibleForClose).toBe(true);
    expect(results[0].totalChildren).toBe(2);
    expect(results[0].closedChildren).toBe(2);
  });

  it('excludes already-closed epics', async () => {
    await createIssueWithId(db, 'test-epic', { board: 'test', title: 'Closed Epic', issue_type: 'epic' });
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'Child 1' });
    await addDependency(db, { issue_id: 'test-epic', depends_on_id: 'test-1', type: 'parent-child' });
    await closeIssue(db, 'test-1');
    await closeIssue(db, 'test-epic');

    const results = await getEpicsEligibleForClosure(db, 'test');

    expect(results).toHaveLength(0);
  });

  it('only returns epics for the specified board', async () => {
    await createBoard(db, { name: 'other' });
    await createIssueWithId(db, 'test-epic', { board: 'test', title: 'Test Epic', issue_type: 'epic' });
    await createIssueWithId(db, 'test-1', { board: 'test', title: 'Test Child' });
    await addDependency(db, { issue_id: 'test-epic', depends_on_id: 'test-1', type: 'parent-child' });
    await closeIssue(db, 'test-1');

    await createIssueWithId(db, 'other-epic', { board: 'other', title: 'Other Epic', issue_type: 'epic' });
    await createIssueWithId(db, 'other-1', { board: 'other', title: 'Other Child' });
    await addDependency(db, { issue_id: 'other-epic', depends_on_id: 'other-1', type: 'parent-child' });

    const results = await getEpicsEligibleForClosure(db, 'test');

    expect(results).toHaveLength(1);
    expect(results[0].epic.id).toBe('test-epic');
    expect(results[0].eligibleForClose).toBe(true);
  });
});
