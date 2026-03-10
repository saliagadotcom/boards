import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { Database as BunDatabase } from 'bun:sqlite';
import { Kysely } from 'kysely';
import type { Database } from '@saliagadotcom/boards-core';
import { createStore, migrate, BoardsError } from '@saliagadotcom/boards-core';
import { createApp } from '@saliagadotcom/boards-server';
import { RemoteBoardsStore } from '../src/remote-store.js';
import { BunSqliteDialect } from '../../boards-core/test/helpers.js';

// --- Test setup: run a real Hono server, test RemoteBoardsStore against it ---

let kyselyDb: Kysely<Database>;
let server: ReturnType<typeof Bun.serve>;
let remote: RemoteBoardsStore;

beforeEach(async () => {
  const raw = new BunDatabase(':memory:');
  raw.run('PRAGMA foreign_keys = ON');
  kyselyDb = new Kysely<Database>({ dialect: new BunSqliteDialect(raw) });
  await migrate(kyselyDb);
  const store = createStore(kyselyDb);
  const app = createApp(store);
  server = Bun.serve({ port: 0, fetch: app.fetch });
  remote = new RemoteBoardsStore(`http://localhost:${server.port}`);
});

afterEach(async () => {
  server.stop(true);
  await kyselyDb.destroy();
});

// --- Tests ---

describe('RemoteBoardsStore', () => {
  describe('boards', () => {
    it('creates and lists boards', async () => {
      const board = await remote.createBoard({ name: 'api', description: 'API' });
      expect(board.id).toBe('api');
      expect(board.description).toBe('API');

      const boards = await remote.listBoards();
      expect(boards.length).toBe(1);
      expect(boards[0]!.id).toBe('api');
      expect(boards[0]!.open_count).toBe(0);
    });

    it('deletes a board', async () => {
      await remote.createBoard({ name: 'api' });
      await remote.deleteBoard('api');
      const boards = await remote.listBoards();
      expect(boards.length).toBe(0);
    });
  });

  describe('issues', () => {
    it('creates, shows, and lists issues', async () => {
      await remote.createBoard({ name: 'api' });
      const issue = await remote.createIssue({ board: 'api', title: 'Fix login' });
      expect(issue.title).toBe('Fix login');
      expect(issue.board).toBe('api');
      expect(issue.status).toBe('open');

      const detail = await remote.showIssue(issue.id);
      expect(detail.issue.title).toBe('Fix login');

      const issues = await remote.listIssues('api');
      expect(issues.length).toBe(1);
    });

    it('updates an issue', async () => {
      await remote.createBoard({ name: 'api' });
      const issue = await remote.createIssue({ board: 'api', title: 'Old' });
      const updated = await remote.updateIssue(issue.id, { title: 'New' });
      expect(updated.title).toBe('New');
    });

    it('closes and reopens an issue', async () => {
      await remote.createBoard({ name: 'api' });
      const issue = await remote.createIssue({ board: 'api', title: 'Task' });
      const closed = await remote.closeIssue(issue.id, 'Done');
      expect(closed.status).toBe('closed');

      const reopened = await remote.reopenIssue(issue.id);
      expect(reopened.status).toBe('open');
    });

    it('deletes an issue', async () => {
      await remote.createBoard({ name: 'api' });
      const issue = await remote.createIssue({ board: 'api', title: 'To delete' });
      await remote.deleteIssue(issue.id);
      const issues = await remote.listIssues('api');
      expect(issues.length).toBe(0);
    });

    it('bulk deletes issues', async () => {
      await remote.createBoard({ name: 'api' });
      const a = await remote.createIssue({ board: 'api', title: 'A' });
      const b = await remote.createIssue({ board: 'api', title: 'B' });
      const result = await remote.deleteIssues([a.id, b.id, 'nonexistent']);
      expect(result.deleted).toContain(a.id);
      expect(result.deleted).toContain(b.id);
      expect(result.not_found).toContain('nonexistent');
    });

    it('creates an issue with parent', async () => {
      await remote.createBoard({ name: 'api' });
      const parent = await remote.createIssue({ board: 'api', title: 'Epic', issue_type: 'epic' });
      const child = await remote.createIssueWithParent({ board: 'api', title: 'Child' }, parent.id);
      expect(child.title).toBe('Child');
    });
  });

  describe('comments', () => {
    it('adds, lists, and deletes comments', async () => {
      await remote.createBoard({ name: 'api' });
      const issue = await remote.createIssue({ board: 'api', title: 'Task' });

      const comment = await remote.addComment(issue.id, 'alice', 'Hello');
      expect(comment.author).toBe('alice');
      expect(comment.text).toBe('Hello');

      const comments = await remote.listComments(issue.id);
      expect(comments.length).toBe(1);

      await remote.deleteComment(comment.id);
      const after = await remote.listComments(issue.id);
      expect(after.length).toBe(0);
    });
  });

  describe('dependencies', () => {
    it('adds, lists, and removes dependencies', async () => {
      await remote.createBoard({ name: 'api' });
      const a = await remote.createIssue({ board: 'api', title: 'A' });
      const b = await remote.createIssue({ board: 'api', title: 'B' });

      await remote.addDependency({ issue_id: a.id, depends_on_id: b.id, type: 'blocks' });
      const deps = await remote.listDependencies(a.id, 'down');
      expect(deps.length).toBe(1);
      expect(deps[0]!.type).toBe('blocks');

      await remote.removeDependency(a.id, b.id);
      const after = await remote.listDependencies(a.id, 'down');
      expect(after.length).toBe(0);
    });
  });

  describe('labels', () => {
    it('adds and removes labels', async () => {
      await remote.createBoard({ name: 'api' });
      const issue = await remote.createIssue({ board: 'api', title: 'Task' });
      await remote.addLabel(issue.id, 'urgent');

      const detail = await remote.showIssue(issue.id);
      expect(detail.issue.labels).toContain('urgent');

      await remote.removeLabel(issue.id, 'urgent');
      const after = await remote.showIssue(issue.id);
      expect(after.issue.labels).not.toContain('urgent');
    });
  });

  describe('epics', () => {
    it('returns epic status', async () => {
      await remote.createBoard({ name: 'api' });
      const epics = await remote.epicStatus('api');
      expect(Array.isArray(epics)).toBe(true);
    });
  });

  describe('ready + claim', () => {
    it('finds ready work and claims it', async () => {
      await remote.createBoard({ name: 'api' });
      await remote.createIssue({ board: 'api', title: 'Ready task' });
      const ready = await remote.readyWork('api');
      expect(ready.length).toBe(1);

      const claimed = await remote.claimIssue(ready[0]!.id, 'agent-1');
      expect(claimed.assignee).toBe('agent-1');
      expect(claimed.status).toBe('in_progress');
    });
  });

  describe('search', () => {
    it('searches issues', async () => {
      await remote.createBoard({ name: 'api' });
      await remote.createIssue({ board: 'api', title: 'Fix login bug' });
      await remote.createIssue({ board: 'api', title: 'Add signup' });
      const results = await remote.searchIssues('api', 'login');
      expect(results.length).toBe(1);
      expect(results[0]!.title).toBe('Fix login bug');
    });
  });

  describe('metadata', () => {
    it('returns metadata', async () => {
      const meta = await remote.getMetadata();
      expect(typeof meta.version).toBe('string');
      expect(typeof meta.schema_version).toBe('number');
    });
  });

  describe('error handling', () => {
    it('reconstructs BoardsError from server error response', async () => {
      try {
        await remote.showIssue('nonexistent');
        expect(true).toBe(false); // should not reach
      } catch (err) {
        expect(err).toBeInstanceOf(BoardsError);
        expect((err as BoardsError).code).toBe('not_found');
      }
    });

    it('throws internal_error on connection failure', async () => {
      const bad = new RemoteBoardsStore('http://localhost:1');
      try {
        await bad.listBoards();
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(BoardsError);
        expect((err as BoardsError).code).toBe('internal_error');
        expect((err as BoardsError).message).toContain('Connection failed');
      }
    });
  });
});
