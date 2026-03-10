import { Hono } from 'hono';
import type { BoardsStore } from '@saliagadotcom/boards-core';
import { requireBoardIssue } from '../validation.js';

export function claimRoutes(store: BoardsStore): Hono {
  const app = new Hono();

  app.post('/boards/:board/issues/:id/claim', async (c) => {
    const { board, id } = c.req.param();
    await requireBoardIssue(store, board, id);
    const body = await c.req.json();
    const issue = await store.claimIssue(id, body.assignee);
    return c.json(issue, 200);
  });

  return app;
}
