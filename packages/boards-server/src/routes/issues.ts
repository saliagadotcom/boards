import { Hono } from 'hono';
import type { BoardsStore } from '@saliagadotcom/boards-core';
import type { ListIssuesFilter } from '@saliagadotcom/boards-core';
import { BoardsError } from '@saliagadotcom/boards-core';
import { parseStatus, parseIssueType, parsePriority, requireBoardIssue } from '../validation.js';

export function issueRoutes(store: BoardsStore): Hono {
  const app = new Hono();

  // POST /boards/:board/issues
  app.post('/boards/:board/issues', async (c) => {
    const board = c.req.param('board');
    const body = await c.req.json();
    const { parent_id, ...input } = body;
    if (parent_id) {
      const issue = await store.createIssueWithParent({ ...input, board }, parent_id);
      return c.json(issue, 201);
    }
    const issue = await store.createIssue({ ...input, board });
    return c.json(issue, 201);
  });

  // GET /boards/:board/issues
  app.get('/boards/:board/issues', async (c) => {
    const board = c.req.param('board');
    const q = c.req.query('q');

    if (q) {
      const results = await store.searchIssues(board, q);
      return c.json(results);
    }

    const filter: ListIssuesFilter = {};
    const status = c.req.query('status');
    const priority = c.req.query('priority');
    const issueType = c.req.query('issue_type');
    const assignee = c.req.query('assignee');
    const label = c.req.query('label');

    if (status) filter.status = parseStatus(status);
    if (priority) filter.priority = parsePriority(priority);
    if (issueType) filter.issue_type = parseIssueType(issueType);
    if (assignee) filter.assignee = assignee;
    if (label) filter.label = label;

    const issues = await store.listIssues(board, filter);
    return c.json(issues);
  });

  // GET /boards/:board/issues/:id
  app.get('/boards/:board/issues/:id', async (c) => {
    const { board, id } = c.req.param();
    const detail = await store.showIssue(id);
    if (board !== '_' && detail.issue.board !== board) {
      throw new BoardsError('not_found', `Issue "${id}" not found`);
    }
    return c.json(detail);
  });

  // PATCH /boards/:board/issues/:id
  app.patch('/boards/:board/issues/:id', async (c) => {
    const { board, id } = c.req.param();
    await requireBoardIssue(store, board, id);
    const body = await c.req.json();
    const issue = await store.updateIssue(id, body);
    return c.json(issue);
  });

  // POST /boards/:board/issues/:id/close
  app.post('/boards/:board/issues/:id/close', async (c) => {
    const { board, id } = c.req.param();
    await requireBoardIssue(store, board, id);
    const body = await c.req.json().catch(() => ({}));
    const issue = await store.closeIssue(id, body.reason, body.resolution);
    return c.json(issue);
  });

  // POST /boards/:board/issues/:id/reopen
  app.post('/boards/:board/issues/:id/reopen', async (c) => {
    const { board, id } = c.req.param();
    await requireBoardIssue(store, board, id);
    const body = await c.req.json().catch(() => ({}));
    const issue = await store.reopenIssue(id, body.status);
    return c.json(issue);
  });

  // DELETE /boards/:board/issues/:id
  app.delete('/boards/:board/issues/:id', async (c) => {
    const { board, id } = c.req.param();
    await requireBoardIssue(store, board, id);
    await store.deleteIssue(id);
    return c.body(null, 204);
  });

  // DELETE /boards/:board/issues (bulk delete)
  app.delete('/boards/:board/issues', async (c) => {
    const body = await c.req.json();
    const result = await store.deleteIssues(body.ids);
    return c.json(result);
  });

  return app;
}
