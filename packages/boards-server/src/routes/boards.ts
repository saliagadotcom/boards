import { Hono } from 'hono';
import type { BoardsStore } from '@saliagadotcom/boards-core';

export function boardRoutes(store: BoardsStore): Hono {
  const app = new Hono();

  app.post('/', async (c) => {
    const body = await c.req.json();
    const board = await store.createBoard(body);
    return c.json(board, 201);
  });

  app.get('/', async (c) => {
    const boards = await store.listBoards();
    return c.json(boards);
  });

  app.delete('/:name', async (c) => {
    const name = c.req.param('name');
    await store.deleteBoard(name);
    return c.body(null, 204);
  });

  return app;
}
