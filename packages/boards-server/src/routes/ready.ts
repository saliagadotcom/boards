import { Hono } from 'hono';
import type { BoardsStore, ReadyWorkFilter } from '@saliagadotcom/boards-core';
import { parseIssueType, parsePriority } from '../validation.js';

export function readyRoutes(store: BoardsStore): Hono {
  const app = new Hono();

  app.get('/boards/:board/ready', async (c) => {
    const { board } = c.req.param();
    const filter: ReadyWorkFilter = {};

    const assignee = c.req.query('assignee');
    if (assignee !== undefined) filter.assignee = assignee;

    const unassigned = c.req.query('unassigned');
    if (unassigned === 'true' || unassigned === '1') filter.unassigned = true;

    const priority = c.req.query('priority');
    if (priority !== undefined) filter.priority = parsePriority(priority);

    const issueType = c.req.query('issue_type');
    if (issueType !== undefined) filter.issue_type = parseIssueType(issueType);

    const label = c.req.query('label');
    if (label !== undefined) filter.label = label;

    const includeEpics = c.req.query('include_epics');
    if (includeEpics === 'true' || includeEpics === '1') filter.include_epics = true;

    const issues = await store.readyWork(board, filter);
    return c.json(issues, 200);
  });

  return app;
}
