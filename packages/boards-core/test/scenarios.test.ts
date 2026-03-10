/**
 * Scenario Tests for BoardsStore
 *
 * These tests exercise multi-step workflows that span multiple features
 * (dependencies, ready queue, claims, status transitions, labels, etc.).
 *
 * Unlike the unit tests which test each operation in isolation, these scenarios
 * verify that features interact correctly when composed into realistic sequences.
 * Each scenario tells a story — read it top-to-bottom to understand what's being
 * tested and why.
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type { Kysely } from 'kysely';
import type { Database } from '../src/schema.js';
import { BoardsStore, createStore, BoardsError, migrate } from '../src/index.js';
import { createTestDb, BunDatabase } from './helpers.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract just the IDs from an issue array, for easy assertions. */
function ids(issues: { id: string }[]): string[] {
  return issues.map((i) => i.id);
}

// ─── Scenarios ───────────────────────────────────────────────────────────────

describe('scenarios', () => {
  let db: Kysely<Database>;
  let raw: BunDatabase;
  let store: BoardsStore;

  beforeEach(async () => {
    const result = createTestDb();
    db = result.db;
    raw = result.raw;
    await migrate(db);
    store = createStore(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  // ─── Scenario 1: Dependency Unblocking Cascade ───────────────────────────
  //
  // Models a pipeline where work must proceed in order: A → B → C.
  // As each blocker is resolved, the next issue becomes ready.
  // This verifies that the ready queue correctly responds to the progressive
  // closing of blockers in a chain.

  it('scenario 1: dependency unblocking cascade', async () => {
    await store.createBoard({ name: 'proj' });
    const a = await store.createIssueWithId('proj-aaa', { board: 'proj', title: 'Setup database' });
    const b = await store.createIssueWithId('proj-bbb', { board: 'proj', title: 'Build API layer' });
    const c = await store.createIssueWithId('proj-ccc', { board: 'proj', title: 'Write frontend' });

    // B depends on A, C depends on B — a linear pipeline
    await store.addDependency({ issue_id: 'proj-bbb', depends_on_id: 'proj-aaa', type: 'blocks' });
    await store.addDependency({ issue_id: 'proj-ccc', depends_on_id: 'proj-bbb', type: 'blocks' });

    // Only A is ready — it has no blockers
    let ready = await store.readyWork('proj');
    expect(ids(ready)).toEqual(['proj-aaa']);

    // Close A → B becomes unblocked, but C is still blocked by B
    await store.closeIssue('proj-aaa');
    ready = await store.readyWork('proj');
    expect(ids(ready)).toEqual(['proj-bbb']);

    // Close B → C is finally unblocked
    await store.closeIssue('proj-bbb');
    ready = await store.readyWork('proj');
    expect(ids(ready)).toEqual(['proj-ccc']);
  });

  // ─── Scenario 2: Mixed Dependency Types Don't Block ──────────────────────
  //
  // Only `blocks` dependencies should prevent issues from appearing in ready.
  // A `related` dependency is informational — it links issues without creating
  // a work-ordering constraint. This scenario verifies the distinction.

  it('scenario 2: related dependencies do not block the ready queue', async () => {
    await store.createBoard({ name: 'proj' });
    await store.createIssueWithId('proj-aaa', { board: 'proj', title: 'Core module' });
    await store.createIssueWithId('proj-bbb', { board: 'proj', title: 'Depends on core (blocked)' });
    await store.createIssueWithId('proj-ccc', { board: 'proj', title: 'Related to core (not blocked)' });

    // B is blocked by A — hard dependency
    await store.addDependency({ issue_id: 'proj-bbb', depends_on_id: 'proj-aaa', type: 'blocks' });
    // C is related to A — informational link only
    await store.addDependency({ issue_id: 'proj-ccc', depends_on_id: 'proj-aaa', type: 'related' });

    // A and C should both be ready; B is blocked
    const ready = await store.readyWork('proj');
    const readyIds = ids(ready);
    expect(readyIds).toContain('proj-aaa');
    expect(readyIds).toContain('proj-ccc');
    expect(readyIds).not.toContain('proj-bbb');
  });

  // ─── Scenario 3: Claim Race (Double Claim) ──────────────────────────────
  //
  // When multiple agents try to claim the same issue, only the first should
  // succeed. The second must get a conflict error, and the original assignee
  // must remain unchanged. This tests the atomic claim guarantee.

  it('scenario 3: only the first agent can claim an issue', async () => {
    await store.createBoard({ name: 'proj' });
    await store.createIssueWithId('proj-aaa', { board: 'proj', title: 'Investigate flaky test' });

    // Agent 1 claims successfully
    const claimed = await store.claimIssue('proj-aaa', 'agent-1');
    expect(claimed.assignee).toBe('agent-1');
    expect(claimed.status).toBe('in_progress');

    // Agent 2 tries to claim the same issue — should fail
    try {
      await store.claimIssue('proj-aaa', 'agent-2');
      expect.unreachable('Second claim should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('conflict');
    }

    // Verify agent-1 still owns it — the failed claim didn't corrupt state
    const detail = await store.showIssue('proj-aaa');
    expect(detail.issue.assignee).toBe('agent-1');
    expect(detail.issue.status).toBe('in_progress');
  });

  // ─── Scenario 4: Reopen Unblocks / Re-blocks Dependents ─────────────────
  //
  // Closing a blocker makes its dependent ready. But if you reopen the blocker,
  // the dependent should go back to being blocked. This tests that the ready
  // queue reacts to status changes in both directions.

  it('scenario 4: reopening a blocker re-blocks its dependent', async () => {
    await store.createBoard({ name: 'proj' });
    await store.createIssueWithId('proj-aaa', { board: 'proj', title: 'Design spec' });
    await store.createIssueWithId('proj-bbb', { board: 'proj', title: 'Implement feature' });

    await store.addDependency({ issue_id: 'proj-bbb', depends_on_id: 'proj-aaa', type: 'blocks' });

    // Close A → B becomes ready
    await store.closeIssue('proj-aaa');
    let ready = await store.readyWork('proj');
    expect(ids(ready)).toContain('proj-bbb');

    // Reopen A → B should be blocked again
    await store.updateIssue('proj-aaa', { status: 'open' });
    ready = await store.readyWork('proj');
    expect(ids(ready)).toEqual(['proj-aaa']);
    expect(ids(ready)).not.toContain('proj-bbb');
  });

  // ─── Scenario 5: Deleting a Blocker Frees Its Dependent ──────────────────
  //
  // If a blocking issue is deleted entirely (not just closed), the dependency
  // should be cascade-deleted via foreign keys, freeing the dependent issue.
  // This is a subtle interaction between DELETE CASCADE and the ready queue.

  it('scenario 5: deleting a blocker frees its dependent', async () => {
    await store.createBoard({ name: 'proj' });
    await store.createIssueWithId('proj-aaa', { board: 'proj', title: 'Spike: evaluate library' });
    await store.createIssueWithId('proj-bbb', { board: 'proj', title: 'Integrate library' });

    await store.addDependency({ issue_id: 'proj-bbb', depends_on_id: 'proj-aaa', type: 'blocks' });

    // B is blocked by A
    let ready = await store.readyWork('proj');
    expect(ids(ready)).toEqual(['proj-aaa']);

    // Delete A entirely — B should now be free
    await store.deleteIssue('proj-aaa');
    ready = await store.readyWork('proj');
    expect(ids(ready)).toEqual(['proj-bbb']);
  });

  // ─── Scenario 6: Board Counts Stay Consistent ───────────────────────────
  //
  // listBoards() returns computed open/in_progress/closed counts per board.
  // This scenario verifies the counts stay accurate as issues transition
  // through the full status lifecycle.

  it('scenario 6: board counts reflect issue status changes', async () => {
    await store.createBoard({ name: 'api' });
    await store.createIssueWithId('api-aaa', { board: 'api', title: 'Issue A' });
    await store.createIssueWithId('api-bbb', { board: 'api', title: 'Issue B' });
    await store.createIssueWithId('api-ccc', { board: 'api', title: 'Issue C' });

    // All three are open initially
    let boards = await store.listBoards();
    let api = boards.find((b) => b.id === 'api')!;
    expect(api.open_count).toBe(3);
    expect(api.in_progress_count).toBe(0);
    expect(api.closed_count).toBe(0);

    // Claim B (moves to in_progress), close C
    await store.claimIssue('api-bbb', 'agent-1');
    await store.closeIssue('api-ccc');

    boards = await store.listBoards();
    api = boards.find((b) => b.id === 'api')!;
    expect(api.open_count).toBe(1);
    expect(api.in_progress_count).toBe(1);
    expect(api.closed_count).toBe(1);
  });

  // ─── Scenario 7: Close and Reopen Clears closed_at ──────────────────────
  //
  // When an issue is closed, closed_at must be set. When reopened, closed_at
  // must be cleared back to null. This is a spec requirement that ensures
  // reopened issues don't carry stale closure timestamps.

  it('scenario 7: reopening an issue clears closed_at', async () => {
    await store.createBoard({ name: 'proj' });
    await store.createIssueWithId('proj-aaa', { board: 'proj', title: 'Fix regression' });

    // Close it — closed_at should be set
    await store.closeIssue('proj-aaa');
    let detail = await store.showIssue('proj-aaa');
    expect(detail.issue.status).toBe('closed');
    expect(detail.issue.closed_at).not.toBeNull();

    // Reopen it — closed_at and close_reason must be cleared
    await store.updateIssue('proj-aaa', { status: 'open' });
    detail = await store.showIssue('proj-aaa');
    expect(detail.issue.status).toBe('open');
    expect(detail.issue.closed_at).toBeNull();
    expect(detail.issue.close_reason).toBe('');
  });

  // ─── Scenario 8: Invalid Transition Doesn't Corrupt State ───────────────
  //
  // The spec forbids closed → in_progress (must go closed → open first).
  // This scenario verifies that closed → in_progress is allowed (reopens the issue)
  // and properly clears closed_at.

  it('scenario 8: closed → in_progress reopens issue', async () => {
    await store.createBoard({ name: 'proj' });
    await store.createIssueWithId('proj-aaa', { board: 'proj', title: 'Completed task' });

    await store.closeIssue('proj-aaa', 'All done');

    // Transition closed → in_progress should succeed
    const updated = await store.updateIssue('proj-aaa', { status: 'in_progress' });
    expect(updated.status).toBe('in_progress');
    expect(updated.closed_at).toBeNull();
    expect(updated.close_reason).toBe('');
  });

  // ─── Scenario 9: Cycle Rejection Preserves Existing Dependencies ────────
  //
  // When a dependency would create a cycle, the store must reject it but
  // leave all existing dependencies intact. The ready queue should continue
  // to work correctly with the pre-existing dependency graph.

  it('scenario 9: rejected cycle preserves existing dependency graph', async () => {
    await store.createBoard({ name: 'proj' });
    await store.createIssueWithId('proj-aaa', { board: 'proj', title: 'A' });
    await store.createIssueWithId('proj-bbb', { board: 'proj', title: 'B' });
    await store.createIssueWithId('proj-ccc', { board: 'proj', title: 'C' });

    // Build a valid chain: A blocks B, B blocks C
    await store.addDependency({ issue_id: 'proj-bbb', depends_on_id: 'proj-aaa', type: 'blocks' });
    await store.addDependency({ issue_id: 'proj-ccc', depends_on_id: 'proj-bbb', type: 'blocks' });

    // Try to close the loop: C blocks A → should fail
    try {
      await store.addDependency({ issue_id: 'proj-aaa', depends_on_id: 'proj-ccc', type: 'blocks' });
      expect.unreachable('Should have thrown circular_dependency');
    } catch (err) {
      expect(err).toBeInstanceOf(BoardsError);
      expect((err as BoardsError).code).toBe('circular_dependency');
    }

    // The existing chain must still be intact
    const aDeps = await store.listDependencies('proj-bbb', 'down');
    expect(aDeps).toHaveLength(1);
    expect(aDeps[0].issue.id).toBe('proj-aaa');

    const bDeps = await store.listDependencies('proj-ccc', 'down');
    expect(bDeps).toHaveLength(1);
    expect(bDeps[0].issue.id).toBe('proj-bbb');

    // Ready queue should still work: only A is unblocked
    const ready = await store.readyWork('proj');
    expect(ids(ready)).toEqual(['proj-aaa']);
  });

  // ─── Scenario 10: Labels Survive Status Transitions ─────────────────────
  //
  // Labels are metadata attached to issues. They must not be lost when an
  // issue moves through status transitions (open → in_progress → closed →
  // reopened). This catches any accidental label deletion on update/close.

  it('scenario 10: labels persist through the full status lifecycle', async () => {
    await store.createBoard({ name: 'proj' });
    await store.createIssueWithId('proj-aaa', { board: 'proj', title: 'Labeled task' });

    // Attach labels
    await store.addLabel('proj-aaa', 'backend');
    await store.addLabel('proj-aaa', 'urgent');

    // Transition: open → in_progress
    await store.updateIssue('proj-aaa', { status: 'in_progress' });
    let detail = await store.showIssue('proj-aaa');
    expect(detail.issue.labels).toContain('backend');
    expect(detail.issue.labels).toContain('urgent');

    // Transition: in_progress → closed
    await store.closeIssue('proj-aaa');
    detail = await store.showIssue('proj-aaa');
    expect(detail.issue.labels).toContain('backend');
    expect(detail.issue.labels).toContain('urgent');

    // Transition: closed → open (reopen)
    await store.updateIssue('proj-aaa', { status: 'open' });
    detail = await store.showIssue('proj-aaa');
    expect(detail.issue.labels).toContain('backend');
    expect(detail.issue.labels).toContain('urgent');
  });

  // ─── Scenario 11: Ready Queue Respects Priority Ordering ────────────────
  //
  // When multiple issues are ready, they should be returned in priority order
  // (0 = highest, 4 = lowest). This is critical for agents that always pick
  // the top item — they should work on the most important task first.

  it('scenario 11: ready queue returns issues ordered by priority', async () => {
    await store.createBoard({ name: 'proj' });
    // Create in non-priority order to ensure sorting isn't accidental
    await store.createIssueWithId('proj-low', { board: 'proj', title: 'Low priority', priority: 3 });
    await store.createIssueWithId('proj-crit', { board: 'proj', title: 'Critical', priority: 0 });
    await store.createIssueWithId('proj-med', { board: 'proj', title: 'Medium priority', priority: 2 });

    const ready = await store.readyWork('proj');
    expect(ids(ready)).toEqual(['proj-crit', 'proj-med', 'proj-low']);
  });

  // ─── Scenario 12: Full Agent Lifecycle ──────────────────────────────────
  //
  // Simulates a complete agent workflow from start to finish:
  //   1. Set up a board with issues and dependencies
  //   2. Work through the ready queue: claim → complete → next
  //   3. Verify the board ends up fully resolved
  //
  // This is the "happy path" integration test — if this passes, the core
  // agent loop works end-to-end.

  it('scenario 12: full agent lifecycle — setup, work queue, completion', async () => {
    // ── Step 1: Set up the project ──
    await store.createBoard({ name: 'sprint' });
    await store.createIssueWithId('sprint-db', { board: 'sprint', title: 'Set up database', priority: 0 });
    await store.createIssueWithId('sprint-api', { board: 'sprint', title: 'Build REST API', priority: 1 });
    await store.createIssueWithId('sprint-ui', { board: 'sprint', title: 'Build UI', priority: 2 });

    // API depends on DB, UI depends on API
    await store.addDependency({ issue_id: 'sprint-api', depends_on_id: 'sprint-db', type: 'blocks' });
    await store.addDependency({ issue_id: 'sprint-ui', depends_on_id: 'sprint-api', type: 'blocks' });

    // ── Step 2: Agent works through the queue ──

    // First pass: only DB is ready
    let ready = await store.readyWork('sprint');
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe('sprint-db');

    // Agent claims and completes DB
    await store.claimIssue('sprint-db', 'agent-1');
    await store.closeIssue('sprint-db');

    // Second pass: API is now unblocked
    ready = await store.readyWork('sprint');
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe('sprint-api');

    // Agent claims and completes API
    await store.claimIssue('sprint-api', 'agent-1');
    await store.closeIssue('sprint-api');

    // Third pass: UI is now unblocked
    ready = await store.readyWork('sprint');
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe('sprint-ui');

    // Agent claims and completes UI
    await store.claimIssue('sprint-ui', 'agent-1');
    await store.closeIssue('sprint-ui');

    // ── Step 3: Verify everything is done ──

    // No more work
    ready = await store.readyWork('sprint');
    expect(ready).toHaveLength(0);

    // Board counts reflect completion
    const boards = await store.listBoards();
    const sprint = boards.find((b) => b.id === 'sprint')!;
    expect(sprint.open_count).toBe(0);
    expect(sprint.in_progress_count).toBe(0);
    expect(sprint.closed_count).toBe(3);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Scale & Edge Case Scenarios
  //
  // These scenarios exercise the same features as above, but with larger data
  // sets and more complex graph shapes. They catch bugs that only surface when
  // the system is under realistic load — off-by-one errors in SQL queries,
  // missed joins, incorrect aggregation, etc.
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── Scenario 13: Wide Fan-Out ──────────────────────────────────────────
  //
  // One "gateway" issue blocks 100 downstream issues. When the gateway is
  // closed, ALL 100 must appear in the ready queue simultaneously.
  // This catches SQL queries that accidentally LIMIT results, use EXISTS
  // instead of a proper join, or have other fan-out bugs.

  it('scenario 13: closing one blocker unblocks 100 dependents', async () => {
    const COUNT = 100;
    await store.createBoard({ name: 'fan' });

    // The gateway issue — everything depends on this
    await store.createIssueWithId('fan-gate', { board: 'fan', title: 'Gateway: set up CI' });

    // Create 100 issues that all depend on the gateway
    for (let i = 0; i < COUNT; i++) {
      const id = `fan-t${String(i).padStart(3, '0')}`;
      await store.createIssueWithId(id, { board: 'fan', title: `Task ${i}` });
      await store.addDependency({ issue_id: id, depends_on_id: 'fan-gate', type: 'blocks' });
    }

    // Only the gateway should be ready — all 100 are blocked
    let ready = await store.readyWork('fan');
    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe('fan-gate');

    // Close the gateway — all 100 should become ready at once
    await store.closeIssue('fan-gate');
    ready = await store.readyWork('fan');
    expect(ready).toHaveLength(COUNT);

    // Verify every single task is in the results (no missed rows)
    const readyIds = new Set(ids(ready));
    for (let i = 0; i < COUNT; i++) {
      expect(readyIds.has(`fan-t${String(i).padStart(3, '0')}`)).toBe(true);
    }
  });

  // ─── Scenario 14: Wide Fan-In ──────────────────────────────────────────
  //
  // One issue is blocked by 50 different blockers. It must NOT become ready
  // until every single blocker is closed — not just the first one, not just
  // most of them, ALL of them. This catches queries that use EXISTS (true
  // after first match) instead of checking that zero open blockers remain.

  it('scenario 14: issue blocked by 50 others needs ALL resolved', async () => {
    const BLOCKER_COUNT = 50;
    await store.createBoard({ name: 'fan' });

    // The bottleneck issue — blocked by many things
    await store.createIssueWithId('fan-ship', { board: 'fan', title: 'Ship release' });

    // Create 50 blocker issues
    for (let i = 0; i < BLOCKER_COUNT; i++) {
      const id = `fan-b${String(i).padStart(3, '0')}`;
      await store.createIssueWithId(id, { board: 'fan', title: `Blocker ${i}` });
      await store.addDependency({ issue_id: 'fan-ship', depends_on_id: id, type: 'blocks' });
    }

    // Close the first 49 blockers — ship should still NOT be ready
    for (let i = 0; i < BLOCKER_COUNT - 1; i++) {
      const id = `fan-b${String(i).padStart(3, '0')}`;
      await store.closeIssue(id);

      // After each close, verify ship is still blocked
      const ready = await store.readyWork('fan');
      const readyIds = ids(ready);
      expect(readyIds).not.toContain('fan-ship');
    }

    // Close the LAST blocker — now ship should finally be ready
    await store.closeIssue(`fan-b${String(BLOCKER_COUNT - 1).padStart(3, '0')}`);
    const ready = await store.readyWork('fan');
    expect(ids(ready)).toContain('fan-ship');
  });

  // ─── Scenario 15: Diamond DAG ──────────────────────────────────────────
  //
  // A classic diamond dependency pattern:
  //
  //       A
  //      / \
  //     B   C
  //      \ /
  //       D
  //
  // D has TWO paths back to A. This tests that:
  //   - Closing A unblocks B and C (but not D — still has direct blockers)
  //   - Closing just B doesn't unblock D (C is still open)
  //   - Closing both B and C finally unblocks D
  // This catches naive dependency resolution that only follows one path.

  it('scenario 15: diamond dependency requires both branches resolved', async () => {
    await store.createBoard({ name: 'dia' });
    await store.createIssueWithId('dia-a', { board: 'dia', title: 'A: Foundation' });
    await store.createIssueWithId('dia-b', { board: 'dia', title: 'B: Left branch' });
    await store.createIssueWithId('dia-c', { board: 'dia', title: 'C: Right branch' });
    await store.createIssueWithId('dia-d', { board: 'dia', title: 'D: Merge point' });

    // Build the diamond: B and C depend on A, D depends on both B and C
    await store.addDependency({ issue_id: 'dia-b', depends_on_id: 'dia-a', type: 'blocks' });
    await store.addDependency({ issue_id: 'dia-c', depends_on_id: 'dia-a', type: 'blocks' });
    await store.addDependency({ issue_id: 'dia-d', depends_on_id: 'dia-b', type: 'blocks' });
    await store.addDependency({ issue_id: 'dia-d', depends_on_id: 'dia-c', type: 'blocks' });

    // Initially only A is ready
    let ready = await store.readyWork('dia');
    expect(ids(ready)).toEqual(['dia-a']);

    // Close A → B and C become ready, but D is still blocked by both
    await store.closeIssue('dia-a');
    ready = await store.readyWork('dia');
    let readyIds = ids(ready);
    expect(readyIds).toContain('dia-b');
    expect(readyIds).toContain('dia-c');
    expect(readyIds).not.toContain('dia-d');

    // Close B → D is still blocked by C
    await store.closeIssue('dia-b');
    ready = await store.readyWork('dia');
    readyIds = ids(ready);
    expect(readyIds).toContain('dia-c');
    expect(readyIds).not.toContain('dia-d');

    // Close C → D is finally unblocked
    await store.closeIssue('dia-c');
    ready = await store.readyWork('dia');
    expect(ids(ready)).toEqual(['dia-d']);
  });

  // ─── Scenario 16: Parent-Child at Scale Doesn't Affect Ready Queue ─────
  //
  // Epics use parent-child dependencies to organize subtasks. These are
  // purely organizational — they must NEVER block the ready queue. This
  // scenario creates an epic with 50 subtasks to verify that parent-child
  // relationships don't accidentally get treated as blocking dependencies,
  // even when mixed with real blocks dependencies.

  it('scenario 16: epic with 50 subtasks — parent-child never blocks', async () => {
    const SUBTASK_COUNT = 50;
    await store.createBoard({ name: 'epic' });

    // Create the epic
    await store.createIssueWithId('epic-main', {
      board: 'epic',
      title: 'Epic: Redesign auth system',
      issue_type: 'epic',
    });

    // Create 50 subtasks linked to the epic via parent-child
    for (let i = 0; i < SUBTASK_COUNT; i++) {
      const id = `epic-s${String(i).padStart(3, '0')}`;
      await store.createIssueWithId(id, { board: 'epic', title: `Subtask ${i}` });
      await store.addDependency({ issue_id: 'epic-main', depends_on_id: id, type: 'parent-child' });
    }

    // All subtasks should be ready — parent-child doesn't block
    // (epics are excluded from ready by default)
    let ready = await store.readyWork('epic');
    expect(ready).toHaveLength(SUBTASK_COUNT); // 50 subtasks (epic excluded)
    expect(ids(ready)).not.toContain('epic-main');

    // Now add a real blocks dependency: subtask 10 blocks subtask 20
    await store.addDependency({ issue_id: 'epic-s020', depends_on_id: 'epic-s010', type: 'blocks' });

    // Subtask 20 is now blocked, everything else is still ready
    ready = await store.readyWork('epic');
    expect(ready).toHaveLength(SUBTASK_COUNT - 1); // 50 - 1 (subtask 20 blocked, epic excluded)
    expect(ids(ready)).not.toContain('epic-s020');
    expect(ids(ready)).toContain('epic-s010');
    expect(ids(ready)).not.toContain('epic-main');

    // Close subtask 10 → subtask 20 is unblocked again
    await store.closeIssue('epic-s010');
    ready = await store.readyWork('epic');
    expect(ids(ready)).toContain('epic-s020');
  });

  // ─── Scenario 17: Board Counts at Scale ────────────────────────────────
  //
  // Creates 200 issues, then performs bulk status transitions (claim some,
  // close some, reopen some) and verifies that the board counts computed
  // by listBoards() stay exactly correct at every step. This catches
  // aggregation bugs that only appear with larger data sets — e.g.,
  // double-counting from bad JOINs or missing GROUP BY clauses.

  it('scenario 17: board counts stay exact across 200 issues', async () => {
    const TOTAL = 200;
    await store.createBoard({ name: 'bulk' });

    // Create 200 issues
    for (let i = 0; i < TOTAL; i++) {
      await store.createIssueWithId(`bulk-i${String(i).padStart(3, '0')}`, {
        board: 'bulk',
        title: `Issue ${i}`,
      });
    }

    // Verify initial counts
    let boards = await store.listBoards();
    let bulk = boards.find((b) => b.id === 'bulk')!;
    expect(bulk.open_count).toBe(200);
    expect(bulk.in_progress_count).toBe(0);
    expect(bulk.closed_count).toBe(0);

    // Claim issues 0-49 (50 → in_progress)
    for (let i = 0; i < 50; i++) {
      await store.claimIssue(`bulk-i${String(i).padStart(3, '0')}`, `agent-${i % 5}`);
    }

    boards = await store.listBoards();
    bulk = boards.find((b) => b.id === 'bulk')!;
    expect(bulk.open_count).toBe(150);
    expect(bulk.in_progress_count).toBe(50);
    expect(bulk.closed_count).toBe(0);

    // Close issues 0-29 (30 move from in_progress → closed)
    for (let i = 0; i < 30; i++) {
      await store.closeIssue(`bulk-i${String(i).padStart(3, '0')}`);
    }

    boards = await store.listBoards();
    bulk = boards.find((b) => b.id === 'bulk')!;
    expect(bulk.open_count).toBe(150);
    expect(bulk.in_progress_count).toBe(20);
    expect(bulk.closed_count).toBe(30);

    // Close issues 50-99 directly from open (50 more closed)
    for (let i = 50; i < 100; i++) {
      await store.closeIssue(`bulk-i${String(i).padStart(3, '0')}`);
    }

    boards = await store.listBoards();
    bulk = boards.find((b) => b.id === 'bulk')!;
    expect(bulk.open_count).toBe(100);
    expect(bulk.in_progress_count).toBe(20);
    expect(bulk.closed_count).toBe(80);

    // Reopen issues 0-9 (10 move from closed → open)
    for (let i = 0; i < 10; i++) {
      await store.updateIssue(`bulk-i${String(i).padStart(3, '0')}`, { status: 'open' });
    }

    boards = await store.listBoards();
    bulk = boards.find((b) => b.id === 'bulk')!;
    expect(bulk.open_count).toBe(110);
    expect(bulk.in_progress_count).toBe(20);
    expect(bulk.closed_count).toBe(70);

    // Final sanity check: counts must sum to TOTAL
    expect(bulk.open_count + bulk.in_progress_count + bulk.closed_count).toBe(TOTAL);
  });

  // ─── Scenario 18: Serialized Epic Pipeline ────────────────────────────
  //
  // 5 epics chained linearly via blocks. Each epic has 5 child issues
  // also chained linearly via blocks. The first issue of each epic
  // (except the first) is blocked by the previous epic. This creates
  // a fully serialized pipeline of 25 issues where exactly 1 is ready
  // at any time. Closing all children of an epic, then the epic itself,
  // unblocks the next epic's first issue.

  it('scenario 18: serialized epic pipeline — 5 epics × 5 issues, 1 ready at a time', async () => {
    const EPIC_COUNT = 5;
    const ISSUES_PER_EPIC = 5;
    await store.createBoard({ name: 'pipe' });

    // Create epics and their child issues
    for (let e = 0; e < EPIC_COUNT; e++) {
      const epicId = `pipe-e${e}`;
      await store.createIssueWithId(epicId, {
        board: 'pipe',
        title: `Epic ${e}`,
        issue_type: 'epic',
      });

      for (let i = 0; i < ISSUES_PER_EPIC; i++) {
        const issueId = `pipe-e${e}i${i}`;
        await store.createIssueWithId(issueId, {
          board: 'pipe',
          title: `Epic ${e} Issue ${i}`,
        });

        // Parent-child: epic depends on child
        await store.addDependency({ issue_id: epicId, depends_on_id: issueId, type: 'parent-child' });

        // Intra-epic chain: each issue blocks the next
        if (i > 0) {
          const prevIssueId = `pipe-e${e}i${i - 1}`;
          await store.addDependency({ issue_id: issueId, depends_on_id: prevIssueId, type: 'blocks' });
        }
      }

      // Inter-epic chain: each epic (except first) is blocked by previous epic
      if (e > 0) {
        const prevEpicId = `pipe-e${e - 1}`;
        await store.addDependency({ issue_id: epicId, depends_on_id: prevEpicId, type: 'blocks' });

        // First issue of this epic is blocked by previous epic
        await store.addDependency({ issue_id: `pipe-e${e}i0`, depends_on_id: prevEpicId, type: 'blocks' });
      }
    }

    // Walk through all 25 issues — exactly 1 ready at each step
    for (let e = 0; e < EPIC_COUNT; e++) {
      for (let i = 0; i < ISSUES_PER_EPIC; i++) {
        const currentId = `pipe-e${e}i${i}`;

        const ready = await store.readyWork('pipe');
        expect(ready).toHaveLength(1);
        expect(ids(ready)).toEqual([currentId]);

        await store.closeIssue(currentId);
      }

      // All children closed — close the epic, which unblocks the next epic's first issue
      await store.closeIssue(`pipe-e${e}`);
    }

    // Everything is closed — nothing is ready
    const ready = await store.readyWork('pipe');
    expect(ready).toHaveLength(0);
  });
});
