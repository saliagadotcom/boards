import { Hono } from 'hono';
import type { BoardsStore } from '@saliagadotcom/boards-core';
import { requireBoardIssue } from '../validation.js';

export function labelRoutes(store: BoardsStore): Hono {
  const app = new Hono();

  app.post('/boards/:board/issues/:id/labels', async (c) => {
    const { board, id } = c.req.param();
    await requireBoardIssue(store, board, id);
    const body = await c.req.json();
    await store.addLabel(id, body.label);
    return c.body(null, 201);
  });

  app.delete('/boards/:board/issues/:id/labels/:label', async (c) => {
    const { board, id, label } = c.req.param();
    await requireBoardIssue(store, board, id);
    await store.removeLabel(id, label);
    return c.body(null, 204);
  });

  return app;
}
