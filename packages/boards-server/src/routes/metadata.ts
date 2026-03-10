import { Hono } from 'hono';
import type { BoardsStore } from '@saliagadotcom/boards-core';

export function metadataRoutes(store: BoardsStore): Hono {
  const app = new Hono();

  // GET /metadata
  app.get('/metadata', async (c) => {
    const metadata = await store.getMetadata();
    return c.json(metadata);
  });

  return app;
}
