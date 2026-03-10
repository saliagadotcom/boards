/**
 * Concurrency Tests
 *
 * Validates that operations behave correctly under concurrent access.
 * With SQLite (single connection), these test the logical concurrency contract.
 * When Postgres/MySQL backends are added, the same tests will exercise true
 * concurrent connections and catch TOCTOU bugs, locking issues, and
 * dialect-specific UNIQUE violation handling.
 */

import { describe, expect, it } from 'bun:test';
import { BoardsError } from '../src/index.js';
import { createTestEnv } from './helpers.js';

describe('concurrency', () => {
  // ─── Concurrent Claim ──────────────────────────────────────────────────
  //
  // Fire N concurrent claimIssue calls against the same issue.
  // Exactly 1 must succeed; the other N-1 must fail with 'conflict'.
  // The winner's identity must be consistent when re-queried.

  it('exactly one of N concurrent claims succeeds', async () => {
    const { store, destroy } = await createTestEnv({ board: 'race' });
    try {
      await store.createIssueWithId('race-target', {
        board: 'race',
        title: 'Contested issue',
      });

      const AGENTS = 10;
      const results = await Promise.allSettled(
        Array.from({ length: AGENTS }, (_, i) =>
          store.claimIssue('race-target', `agent-${i}`),
        ),
      );

      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected');

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(AGENTS - 1);

      // Every failure must be a conflict error
      for (const f of failures) {
        const err = (f as PromiseRejectedResult).reason;
        expect(err).toBeInstanceOf(BoardsError);
        expect((err as BoardsError).code).toBe('conflict');
      }

      // The winner's identity is consistent when re-queried
      const detail = await store.showIssue('race-target');
      const winner = (successes[0] as PromiseFulfilledResult<any>).value;
      expect(detail.issue.assignee).toBe(winner.assignee);
      expect(detail.issue.status).toBe('in_progress');
    } finally {
      await destroy();
    }
  });

  // ─── Rapid Sequential Issue Creation ─────────────────────────────────────
  //
  // Create many issues in rapid succession with auto-generated IDs.
  // All IDs must be unique. (SQLite single-connection can't do true
  // concurrent transactions, but this validates the ID generation contract
  // that will matter with Postgres/MySQL connection pools.)

  it('rapid createIssue produces unique IDs', async () => {
    const { store, destroy } = await createTestEnv({ board: 'ids' });
    try {
      const COUNT = 100;
      const issues = [];
      for (let i = 0; i < COUNT; i++) {
        issues.push(await store.createIssue({ board: 'ids', title: `Issue ${i}` }));
      }

      const ids = issues.map((issue) => issue.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(COUNT);

      const listed = await store.listIssues('ids');
      expect(listed).toHaveLength(COUNT);
    } finally {
      await destroy();
    }
  });

  // ─── Ready-Then-Claim Workflow ─────────────────────────────────────────
  //
  // Multiple agents each query readyWork and try to claim the first
  // available issue. Every issue must end up claimed by exactly one agent.

  it('ready-then-claim workflow: no double assignments', async () => {
    const { store, destroy } = await createTestEnv({ board: 'wf' });
    try {
      const COUNT = 5;
      for (let i = 0; i < COUNT; i++) {
        await store.createIssueWithId(`wf-i${i}`, {
          board: 'wf',
          title: `Work item ${i}`,
        });
      }

      const claimWork = async (agentId: string) => {
        const ready = await store.readyWork('wf');
        const claimed: string[] = [];
        for (const issue of ready) {
          try {
            await store.claimIssue(issue.id, agentId);
            claimed.push(issue.id);
            break;
          } catch {
            continue;
          }
        }
        return claimed;
      };

      const agents = Array.from({ length: COUNT }, (_, i) =>
        claimWork(`agent-${i}`),
      );
      const results = await Promise.all(agents);

      const allClaimed = results.flat();
      const uniqueClaimed = new Set(allClaimed);
      expect(uniqueClaimed.size).toBe(allClaimed.length);
    } finally {
      await destroy();
    }
  });

  // ─── Concurrent Board Creation ─────────────────────────────────────────
  //
  // Multiple concurrent attempts to create the same board.
  // Exactly one must succeed; the rest must get 'conflict'.

  it('concurrent createBoard: exactly one succeeds', async () => {
    const { store, destroy } = await createTestEnv();
    try {
      const ATTEMPTS = 10;
      const results = await Promise.allSettled(
        Array.from({ length: ATTEMPTS }, () =>
          store.createBoard({ name: 'contested' }),
        ),
      );

      const successes = results.filter((r) => r.status === 'fulfilled');
      const failures = results.filter((r) => r.status === 'rejected');

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(ATTEMPTS - 1);

      for (const f of failures) {
        const err = (f as PromiseRejectedResult).reason;
        expect(err).toBeInstanceOf(BoardsError);
        expect((err as BoardsError).code).toBe('conflict');
      }
    } finally {
      await destroy();
    }
  });

  // ─── Duplicate addDependency Rejected ────────────────────────────────────
  //
  // Adding the same dependency twice must succeed the first time and
  // fail with 'conflict' the second time. The dependency must exist
  // exactly once afterward. (With Postgres/MySQL, this can also be tested
  // with true concurrent connections.)

  it('duplicate addDependency: second attempt rejected', async () => {
    const { store, destroy } = await createTestEnv({ board: 'dep' });
    try {
      await store.createIssueWithId('dep-a', { board: 'dep', title: 'A' });
      await store.createIssueWithId('dep-b', { board: 'dep', title: 'B' });

      // First add succeeds
      await store.addDependency({
        issue_id: 'dep-b',
        depends_on_id: 'dep-a',
        type: 'blocks',
      });

      // Second add must fail with conflict
      try {
        await store.addDependency({
          issue_id: 'dep-b',
          depends_on_id: 'dep-a',
          type: 'blocks',
        });
        expect.unreachable('Second addDependency should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(BoardsError);
        expect((err as BoardsError).code).toBe('conflict');
      }

      // Dependency exists exactly once
      const deps = await store.listDependencies('dep-b', 'down');
      const blocksDeps = deps.filter((d) => d.issue.id === 'dep-a');
      expect(blocksDeps).toHaveLength(1);
    } finally {
      await destroy();
    }
  });

  // ─── Concurrent closeIssue ─────────────────────────────────────────────
  //
  // closeIssue is idempotent — all concurrent calls should succeed and
  // the issue should end up closed with no corruption.

  it('concurrent closeIssue: all succeed (idempotent)', async () => {
    const { store, destroy } = await createTestEnv({ board: 'close' });
    try {
      await store.createIssueWithId('close-a', { board: 'close', title: 'A' });

      const ATTEMPTS = 10;
      const results = await Promise.allSettled(
        Array.from({ length: ATTEMPTS }, () =>
          store.closeIssue('close-a'),
        ),
      );

      const successes = results.filter((r) => r.status === 'fulfilled');
      expect(successes).toHaveLength(ATTEMPTS);

      const detail = await store.showIssue('close-a');
      expect(detail.issue.status).toBe('closed');
      expect(detail.issue.closed_at).not.toBeNull();
    } finally {
      await destroy();
    }
  });

  // ─── Concurrent addLabel ───────────────────────────────────────────────
  //
  // addLabel is idempotent on duplicate — all concurrent calls adding the
  // same label should succeed, and the label should appear exactly once.

  it('concurrent addLabel: no duplicate rows', async () => {
    const { store, destroy } = await createTestEnv({ board: 'lbl' });
    try {
      await store.createIssueWithId('lbl-a', { board: 'lbl', title: 'A' });

      const ATTEMPTS = 10;
      const results = await Promise.allSettled(
        Array.from({ length: ATTEMPTS }, () =>
          store.addLabel('lbl-a', 'urgent'),
        ),
      );

      const successes = results.filter((r) => r.status === 'fulfilled');
      expect(successes).toHaveLength(ATTEMPTS);

      const detail = await store.showIssue('lbl-a');
      const urgentCount = detail.issue.labels.filter((l) => l === 'urgent').length;
      expect(urgentCount).toBe(1);
    } finally {
      await destroy();
    }
  });
});
