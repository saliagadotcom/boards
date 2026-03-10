// bd init

import { Command } from '@commander-js/extra-typings';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { openDatabase } from '../db.js';
import { createStore } from '@saliagadotcom/boards-core';
import { resolveConfig, saveConfig, boardsHome } from '../config.js';
import { jsonOutput } from '../json.js';

export const initCommand = new Command('init')
  .description('Initialize workspace')
  .option('--json', 'Output as JSON')
  .action(async (opts, command) => {
    const config = resolveConfig({ server: (command.optsWithGlobals() as { server?: string }).server });
    if (config.server) {
      console.error('init is not available in remote mode');
      process.exitCode = 1;
      return;
    }

    const boardsDir = boardsHome();
    const configPath = join(boardsDir, 'config.toml');
    const alreadyExists = existsSync(boardsDir);

    if (!alreadyExists) {
      mkdirSync(boardsDir, { recursive: true });
    }

    const dbPath = config.db_path;
    const db = openDatabase(dbPath);
    const store = createStore(db);
    await store.migrate();

    if (!existsSync(configPath)) {
      saveConfig(configPath, {});
    }

    if (alreadyExists) {
      if (opts.json) {
        console.log(jsonOutput({ status: 'already_initialized', path: boardsDir }));
      } else {
        console.log('Already initialized.');
      }
    } else {
      if (opts.json) {
        console.log(jsonOutput({ status: 'initialized', path: boardsDir }));
      } else {
        console.log(`Initialized boards at ${boardsDir}/`);
        console.log('Create a board with: bd board create <name>');
      }
    }

    await db.destroy();
  });
