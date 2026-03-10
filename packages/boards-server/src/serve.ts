import { createStore, migrate, openDatabase } from '@saliagadotcom/boards-core';
import { createApp } from './app.js';

// --- Entrypoint ---

const dbPath = process.env.BOARDS_DB ?? 'boards.db';
const port = Number(process.env.PORT ?? 3000);

const kyselyDb = openDatabase(dbPath);

const store = createStore(kyselyDb);
await migrate(kyselyDb);

const app = createApp(store);

const server = Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`boards-server listening on http://localhost:${server.port}`);

const shutdown = async () => {
  server.stop();
  await kyselyDb.destroy();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
