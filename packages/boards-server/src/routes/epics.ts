import { Hono } from 'hono';
import type { BoardsStore } from '@saliagadotcom/boards-core';

export function epicRoutes(store: BoardsStore): Hono {
  const app = new Hono();

  // GET /boards/:board/epics
  app.get('/boards/:board/epics', async (c) => {
    const { board } = c.req.param();
    const epics = await store.epicStatus(board);
    return c.json(epics);
  });

  return app;
}
