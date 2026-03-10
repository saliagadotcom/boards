import { Hono } from 'hono';
import type { BoardsStore } from '@saliagadotcom/boards-core';
import { requireBoardIssue } from '../validation.js';

export function commentRoutes(store: BoardsStore): Hono {
  const app = new Hono();

  // POST /boards/:board/issues/:id/comments
  app.post('/boards/:board/issues/:id/comments', async (c) => {
    const { board, id } = c.req.param();
    await requireBoardIssue(store, board, id);
    const body = await c.req.json();
    const comment = await store.addComment(id, body.author, body.text);
    return c.json(comment, 201);
  });

  // GET /boards/:board/issues/:id/comments
  app.get('/boards/:board/issues/:id/comments', async (c) => {
    const { board, id } = c.req.param();
    await requireBoardIssue(store, board, id);
    const comments = await store.listComments(id);
    return c.json(comments);
  });

  // DELETE /boards/:board/issues/:id/comments/:commentId
  app.delete('/boards/:board/issues/:id/comments/:commentId', async (c) => {
    const { board, id, commentId } = c.req.param();
    await requireBoardIssue(store, board, id);
    await store.deleteComment(Number(commentId));
    return c.body(null, 204);
  });

  return app;
}
