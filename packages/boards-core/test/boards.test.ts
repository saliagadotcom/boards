import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type { Kysely } from 'kysely';
import type { Database } from '../src/schema.js';
import { migrate } from '../src/migrate.js';
import { createBoard, listBoards, deleteBoard } from '../src/boards.js';
import { BoardsError } from '../src/errors.js';
import { createTestDb, BunDatabase } from './helpers.js';

describe('board CRUD operations', () => {
  let db: Kysely<Database>;
  let raw: BunDatabase;

  beforeEach(async () => {
    const result = createTestDb();
    db = result.db;
    raw = result.raw;
    await migrate(db);
  });

  afterEach(async () => {
    await db.destroy();
  });

  describe('createBoard', () => {
    it('creates a board with valid name and returns correct fields', async () => {
      const board = await createBoard(db, { name: 'api' });

      expect(board.id).toBe('api');
      expect(board.prefix).toBe('api');
      expect(board.description).toBe('');
      expect(board.created_at).toBeTruthy();
      expect(board.updated_at).toBeTruthy();
    });

    it('creates a board with custom prefix', async () => {
      const board = await createBoard(db, { name: 'api', prefix: 'ap' });

      expect(board.id).toBe('api');
      expect(board.prefix).toBe('ap');
    });

    it('creates a board with description', async () => {
      const board = await createBoard(db, {
        name: 'api',
        description: 'API board',
      });

      expect(board.description).toBe('API board');
    });

    it('rejects duplicate board name with conflict error', async () => {
      await createBoard(db, { name: 'api' });

      try {
        await createBoard(db, { name: 'api' });
        expect(true).toBe(false); // should not reach
      } catch (err) {
        expect(err).toBeInstanceOf(BoardsError);
        expect((err as BoardsError).code).toBe('conflict');
      }
    });

    it('rejects uppercase names', async () => {
      try {
        await createBoard(db, { name: 'API' });
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(BoardsError);
        expect((err as BoardsError).code).toBe('invalid_request');
      }
    });

    it('rejects leading hyphen', async () => {
      try {
        await createBoard(db, { name: '-api' });
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(BoardsError);
        expect((err as BoardsError).code).toBe('invalid_request');
      }
    });

    it('rejects trailing hyphen', async () => {
      try {
        await createBoard(db, { name: 'api-' });
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(BoardsError);
        expect((err as BoardsError).code).toBe('invalid_request');
      }
    });

    it('rejects empty string', async () => {
      try {
        await createBoard(db, { name: '' });
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(BoardsError);
        expect((err as BoardsError).code).toBe('invalid_request');
      }
    });

    it('rejects names with spaces', async () => {
      try {
        await createBoard(db, { name: 'my board' });
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(BoardsError);
        expect((err as BoardsError).code).toBe('invalid_request');
      }
    });

    it('rejects names with special characters', async () => {
      try {
        await createBoard(db, { name: 'api@1' });
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(BoardsError);
        expect((err as BoardsError).code).toBe('invalid_request');
      }
    });

    it('accepts valid names', async () => {
      const validInputs = [
        { name: 'api' },
        { name: 'my-project', prefix: 'myproject' },
        { name: 'v2' },
        { name: 'a' },
        { name: 'abc-def-ghi', prefix: 'adg' },
      ];

      for (const input of validInputs) {
        const board = await createBoard(db, input);
        expect(board.id).toBe(input.name);
      }
    });

    it('rejects invalid prefix with uppercase', async () => {
      try {
        await createBoard(db, { name: 'x', prefix: 'Bad' });
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(BoardsError);
        expect((err as BoardsError).code).toBe('invalid_request');
      }
    });

    it('rejects prefix with hyphens', async () => {
      try {
        await createBoard(db, { name: 'x', prefix: 'my-prefix' });
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(BoardsError);
        expect((err as BoardsError).code).toBe('invalid_request');
      }
    });

    it('accepts valid custom prefix', async () => {
      const board = await createBoard(db, { name: 'x', prefix: 'good' });
      expect(board.prefix).toBe('good');
    });

    it('rejects default prefix derived from name with hyphens', async () => {
      try {
        await createBoard(db, { name: 'my-board' });
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(BoardsError);
        expect((err as BoardsError).code).toBe('invalid_request');
      }
    });

    it('accepts default prefix from simple name', async () => {
      const board = await createBoard(db, { name: 'simple' });
      expect(board.prefix).toBe('simple');
    });
  });

  describe('listBoards', () => {
    it('returns empty array when no boards exist', async () => {
      const boards = await listBoards(db);
      expect(boards).toEqual([]);
    });

    it('returns boards with accurate issue counts', async () => {
      await createBoard(db, { name: 'api' });
      const now = new Date().toISOString();

      await db.insertInto('issues').values({
        id: 'api-1', board: 'api', title: 'Open issue',
        created_at: now, updated_at: now, status: 'open',
      }).execute();
      await db.insertInto('issues').values({
        id: 'api-2', board: 'api', title: 'In progress issue',
        created_at: now, updated_at: now, status: 'in_progress',
      }).execute();
      await db.insertInto('issues').values({
        id: 'api-3', board: 'api', title: 'Closed issue',
        created_at: now, updated_at: now, status: 'closed',
      }).execute();
      await db.insertInto('issues').values({
        id: 'api-4', board: 'api', title: 'Another open issue',
        created_at: now, updated_at: now, status: 'open',
      }).execute();

      const boards = await listBoards(db);
      expect(boards).toHaveLength(1);
      expect(boards[0].id).toBe('api');
      expect(boards[0].open_count).toBe(2);
      expect(boards[0].in_progress_count).toBe(1);
      expect(boards[0].closed_count).toBe(1);
    });

    it('counts update after issue status changes', async () => {
      await createBoard(db, { name: 'api' });
      const now = new Date().toISOString();

      await db.insertInto('issues').values({
        id: 'api-1', board: 'api', title: 'Issue 1',
        created_at: now, updated_at: now, status: 'open',
      }).execute();

      let boards = await listBoards(db);
      expect(boards[0].open_count).toBe(1);
      expect(boards[0].in_progress_count).toBe(0);

      await db.updateTable('issues')
        .set({ status: 'in_progress' })
        .where('id', '=', 'api-1')
        .execute();

      boards = await listBoards(db);
      expect(boards[0].open_count).toBe(0);
      expect(boards[0].in_progress_count).toBe(1);
    });
  });

  describe('deleteBoard', () => {
    it('removes board and all associated data', async () => {
      await createBoard(db, { name: 'api' });
      const now = new Date().toISOString();

      await db.insertInto('issues').values({
        id: 'api-1', board: 'api', title: 'Issue 1',
        created_at: now, updated_at: now, status: 'open',
      }).execute();
      await db.insertInto('issues').values({
        id: 'api-2', board: 'api', title: 'Issue 2',
        created_at: now, updated_at: now, status: 'open',
      }).execute();
      await db.insertInto('dependencies').values({
        issue_id: 'api-1', depends_on_id: 'api-2', type: 'blocks', created_at: now,
      }).execute();
      await db.insertInto('labels').values({
        issue_id: 'api-1', label: 'bug',
      }).execute();

      await deleteBoard(db, 'api');

      const boards = await db.selectFrom('boards').selectAll().execute();
      const issues = await db.selectFrom('issues').selectAll().execute();
      const deps = await db.selectFrom('dependencies').selectAll().execute();
      const labels = await db.selectFrom('labels').selectAll().execute();

      expect(boards).toHaveLength(0);
      expect(issues).toHaveLength(0);
      expect(deps).toHaveLength(0);
      expect(labels).toHaveLength(0);
    });

    it('is a no-op for non-existent board', async () => {
      await deleteBoard(db, 'nonexistent');
    });
  });
});
