import { Hono } from 'hono';
import type { BoardsStore } from '@saliagadotcom/boards-core';
import { errorHandler } from './errors.js';
import { boardRoutes } from './routes/boards.js';
import { issueRoutes } from './routes/issues.js';
import { depRoutes } from './routes/deps.js';
import { labelRoutes } from './routes/labels.js';
import { readyRoutes } from './routes/ready.js';
import { claimRoutes } from './routes/claim.js';
import { commentRoutes } from './routes/comments.js';
import { epicRoutes } from './routes/epics.js';
import { metadataRoutes } from './routes/metadata.js';

export function createApp(store: BoardsStore): Hono {
  const app = new Hono().basePath('/api/v1');
  app.onError(errorHandler);

  app.route('/boards', boardRoutes(store));
  app.route('/', issueRoutes(store));
  app.route('/', depRoutes(store));
  app.route('/', labelRoutes(store));
  app.route('/', readyRoutes(store));
  app.route('/', claimRoutes(store));
  app.route('/', commentRoutes(store));
  app.route('/', epicRoutes(store));
  app.route('/', metadataRoutes(store));

  return app;
}
