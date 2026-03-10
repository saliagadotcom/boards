import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DependencyType } from '../src/index.js';
import { BoardsStore, createStore, BoardsError, migrate } from '../src/index.js';
import { createTestDb } from './helpers.js';

// --- Fixture types ---

interface FixtureAction {
  action: string;
  args: Record<string, any>;
}

interface Scenario {
  name: string;
  description: string;
  setup: FixtureAction[];
  test_action: FixtureAction;
  expected: { result: 'success' | 'error'; error_code?: string };
}

interface FixtureFile {
  spec_version: string;
  suite: string;
  description: string;
  scenarios: Scenario[];
}

// --- Action executor ---

async function executeAction(
  store: BoardsStore,
  action: FixtureAction,
): Promise<void> {
  switch (action.action) {
    case 'create_board':
      await store.createBoard({ name: action.args.name, prefix: action.args.prefix });
      break;
    case 'create_issue':
      await store.createIssueWithId(action.args.id, { board: action.args.board, title: action.args.title });
      break;
    case 'add_dependency':
      await store.addDependency({
        issue_id: action.args.from,
        depends_on_id: action.args.to,
        type: action.args.type as DependencyType,
      });
      break;
    case 'update_status':
      await store.updateIssue(action.args.id, { status: action.args.status });
      break;
    case 'close_issue':
      await store.closeIssue(action.args.id);
      break;
    default:
      throw new Error(`Unknown action: ${action.action}`);
  }
}

// --- Helper to create a fresh store ---

async function createTestStore(): Promise<{ store: BoardsStore; destroy: () => Promise<void> }> {
  const { db } = createTestDb();
  await migrate(db);
  const store = createStore(db);
  return { store, destroy: () => db.destroy() };
}

// --- Auto-discover and run fixtures ---

const fixturesDir = join(import.meta.dir, 'fixtures');
const fixtureFiles = readdirSync(fixturesDir).filter((f) => f.endsWith('.json'));

for (const file of fixtureFiles) {
  const fixture: FixtureFile = JSON.parse(readFileSync(join(fixturesDir, file), 'utf-8'));

  describe(`conformance: ${fixture.suite}`, () => {
    for (const scenario of fixture.scenarios) {
      it(scenario.name, async () => {
        const { store, destroy } = await createTestStore();
        try {
          for (const step of scenario.setup) {
            await executeAction(store, step);
          }

          if (scenario.expected.result === 'success') {
            await executeAction(store, scenario.test_action);
          } else {
            try {
              await executeAction(store, scenario.test_action);
              expect.unreachable('Expected error but action succeeded');
            } catch (err) {
              expect(err).toBeInstanceOf(BoardsError);
              if (scenario.expected.error_code) {
                expect((err as BoardsError).code).toBe(scenario.expected.error_code);
              }
            }
          }
        } finally {
          await destroy();
        }
      });
    }
  });
}
