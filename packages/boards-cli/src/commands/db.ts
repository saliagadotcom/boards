// bd db restore

import { Command } from '@commander-js/extra-typings';
import { existsSync, statSync } from 'node:fs';
import { resolveConfig } from '../config.js';
import { backupPath, restoreBackup } from '../resolve-store.js';

export const dbCommand = new Command('db')
  .description('Database management')
  .addCommand(
    new Command('restore')
      .description('Restore database from backup')
      .action(async (_opts, command) => {
        const globalOpts = command.optsWithGlobals() as { server?: string };
        const config = resolveConfig({ server: globalOpts.server });
        const bak = backupPath(config.db_path);

        if (!existsSync(bak) || statSync(bak).size === 0) {
          console.error('No backup found.');
          process.exitCode = 1;
          return;
        }

        const restored = restoreBackup(config.db_path);
        if (restored) {
          console.log(`Restored database from ${bak}`);
        }
      }),
  );
