import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type { Kysely } from 'kysely';
import type { Database } from '../src/schema.js';
import { createStore, BoardsStore } from '../src/store.js';
import { migrate } from '../src/migrate.js';
import { createTestDb, BunDatabase } from './helpers.js';

describe('BoardsStore', () => {
  let db: Kysely<Database>;
  let raw: BunDatabase;
  let store: BoardsStore;

  beforeEach(async () => {
    const result = createTestDb();
    db = result.db;
    raw = result.raw;
    store = createStore(db);
    await migrate(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it('createStore returns a BoardsStore instance', () => {
    expect(store).toBeInstanceOf(BoardsStore);
  });

  it('createBoard + listBoards integration', async () => {
    const board = await store.createBoard({ name: 'myboard' });
    expect(board.id).toBe('myboard');

    const boards = await store.listBoards();
    expect(boards).toHaveLength(1);
    expect(boards[0].id).toBe('myboard');
    expect(boards[0].open_count).toBe(0);
  });

  it('createIssue + showIssue integration', async () => {
    await store.createBoard({ name: 'myboard' });
    const issue = await store.createIssue({ board: 'myboard', title: 'Test issue' });
    expect(issue.title).toBe('Test issue');
    expect(issue.status).toBe('open');

    const detail = await store.showIssue(issue.id);
    expect(detail.issue.title).toBe('Test issue');
  });
});
