import { Hono } from 'hono';
import type { BoardsStore } from '@saliagadotcom/boards-core';
import { parseDependencyType, parseDirection, requireBoardIssue } from '../validation.js';

export function depRoutes(store: BoardsStore): Hono {
  const app = new Hono();

  app.post('/boards/:board/issues/:id/dependencies', async (c) => {
    const { board, id } = c.req.param();
    await requireBoardIssue(store, board, id);
    const body = await c.req.json();
    const type = parseDependencyType(body.type ?? 'blocks');
    await store.addDependency({
      issue_id: id,
      depends_on_id: body.depends_on_id,
      type,
    });
    return c.body(null, 201);
  });

  app.get('/boards/:board/issues/:id/dependencies', async (c) => {
    const { board, id } = c.req.param();
    await requireBoardIssue(store, board, id);
    const direction = parseDirection(c.req.query('direction') ?? 'down');
    const rawType = c.req.query('type');
    const type = rawType ? parseDependencyType(rawType) : undefined;
    const deps = await store.listDependencies(id, direction, type);
    return c.json(deps, 200);
  });

  app.delete(
    '/boards/:board/issues/:id/dependencies/:depends_on_id',
    async (c) => {
      const { board, id, depends_on_id } = c.req.param();
      await requireBoardIssue(store, board, id);
      await store.removeDependency(id, depends_on_id);
      return c.body(null, 204);
    },
  );

  return app;
}
