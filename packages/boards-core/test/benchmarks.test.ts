/**
 * Performance Benchmarks
 *
 * Measures ops/sec for key store operations at scale.  Not run by default
 * with `just test` — use `just bench` instead.
 *
 * These are not correctness tests.  They exist to catch performance
 * regressions (e.g., an O(n) query becoming O(n²)) by providing stable
 * baseline numbers on in-memory SQLite.
 */

import { describe, it } from 'bun:test';
import { createTestEnv } from './helpers.js';

/**
 * Simple benchmark wrapper.  Runs `fn` repeatedly for `durationMs` and
 * reports ops/sec.
 */
async function bench(
  name: string,
  fn: () => Promise<void>,
  durationMs = 2000,
) {
  // Warmup
  for (let i = 0; i < 5; i++) await fn();

  const start = performance.now();
  let ops = 0;
  while (performance.now() - start < durationMs) {
    await fn();
    ops++;
  }
  const elapsed = performance.now() - start;
  const opsPerSec = (ops / elapsed) * 1000;
  console.log(
    `  [bench] ${name}: ${opsPerSec.toFixed(0)} ops/sec (${ops} ops in ${elapsed.toFixed(0)}ms)`,
  );
}

describe('benchmarks', () => {
  // 1. createIssue throughput
  //
  // Measures how many issues per second the store can create.
  // Baseline expectation: >1000 ops/sec on in-memory SQLite.
  it('createIssue throughput', async () => {
    const { store, destroy } = await createTestEnv({ board: 'bench' });
    let i = 0;
    await bench('createIssue', async () => {
      await store.createIssue({ board: 'bench', title: `Issue ${i++}` });
    });
    await destroy();
  });

  // 2. readyWork with 1000 issues (no dependencies)
  //
  // Measures the ready queue query performance with a large issue set.
  // This catches O(n²) regressions in the ready-queue SQL.
  it('readyWork with 1000 issues', async () => {
    const { store, destroy } = await createTestEnv({ board: 'bench' });
    for (let i = 0; i < 1000; i++) {
      await store.createIssueWithId(`bench-r${String(i).padStart(4, '0')}`, {
        board: 'bench',
        title: `Issue ${i}`,
      });
    }
    await bench('readyWork (1000 issues)', () => store.readyWork('bench'));
    await destroy();
  });

  // 3. readyWork with complex dependency graph
  //
  // Creates a 200-issue dependency chain and measures how fast the ready
  // queue resolves.  This catches regressions in dependency-aware filtering.
  it('readyWork with dependency chain', async () => {
    const { store, destroy } = await createTestEnv({ board: 'bench' });
    const COUNT = 200;
    for (let i = 0; i < COUNT; i++) {
      await store.createIssueWithId(
        `bench-c${String(i).padStart(4, '0')}`,
        { board: 'bench', title: `Chain ${i}` },
      );
    }
    for (let i = 0; i < COUNT - 1; i++) {
      await store.addDependency({
        issue_id: `bench-c${String(i).padStart(4, '0')}`,
        depends_on_id: `bench-c${String(i + 1).padStart(4, '0')}`,
        type: 'blocks',
      });
    }
    await bench('readyWork (200-node chain)', () =>
      store.readyWork('bench'),
    );
    await destroy();
  });

  // 4. addDependency cycle detection at depth
  //
  // Creates a long chain then repeatedly attempts to close the cycle.
  // Measures how fast the recursive CTE cycle-detection runs.
  it('cycle detection at depth 100', async () => {
    const { store, destroy } = await createTestEnv({ board: 'bench' });
    const DEPTH = 100;
    for (let i = 0; i < DEPTH; i++) {
      await store.createIssueWithId(
        `bench-d${String(i).padStart(4, '0')}`,
        { board: 'bench', title: `Depth ${i}` },
      );
    }
    for (let i = 0; i < DEPTH - 1; i++) {
      await store.addDependency({
        issue_id: `bench-d${String(i).padStart(4, '0')}`,
        depends_on_id: `bench-d${String(i + 1).padStart(4, '0')}`,
        type: 'blocks',
      });
    }
    await bench('cycle detection (depth 100)', async () => {
      try {
        await store.addDependency({
          issue_id: `bench-d${String(DEPTH - 1).padStart(4, '0')}`,
          depends_on_id: 'bench-d0000',
          type: 'blocks',
        });
      } catch {
        // Expected: circular_dependency
      }
    });
    await destroy();
  });

  // 5. searchIssues with 1000 issues
  //
  // Measures full-text LIKE search performance across a large dataset.
  it('searchIssues across 1000 issues', async () => {
    const { store, destroy } = await createTestEnv({ board: 'bench' });
    for (let i = 0; i < 1000; i++) {
      await store.createIssueWithId(
        `bench-s${String(i).padStart(4, '0')}`,
        {
          board: 'bench',
          title: `Issue about topic-${i % 50} and area-${i % 20}`,
          description: `Detailed description for issue ${i} covering various aspects`,
        },
      );
    }
    await bench('searchIssues (1000 issues)', () =>
      store.searchIssues('bench', 'topic-25'),
    );
    await destroy();
  });

  // 6. listBoards with aggregated counts
  //
  // Measures the board listing query with aggregated counts across many
  // issues.  This catches GROUP BY / JOIN performance regressions.
  it('listBoards with 500 issues', async () => {
    const { store, destroy } = await createTestEnv({ board: 'bench' });
    for (let i = 0; i < 500; i++) {
      await store.createIssue({ board: 'bench', title: `Issue ${i}` });
    }
    const issues = await store.listIssues('bench');
    for (let i = 0; i < 250; i++) {
      await store.closeIssue(issues[i].id);
    }
    await bench('listBoards (500 issues)', () => store.listBoards());
    await destroy();
  });
});
