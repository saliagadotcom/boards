// bd status

import { Command } from '@commander-js/extra-typings';
import { join } from 'node:path';
import { BoardsError } from '@saliagadotcom/boards-core';
import { boardsHome, resolveConfig, findRepoConfig, loadToml } from '../config.js';
import { resolveStore } from '../resolve-store.js';
import { jsonOutput, jsonError } from '../json.js';
import { statusIcon } from '../format.js';

function globalConfigPath(): string {
  return join(boardsHome(), 'config.toml');
}

function resolveSource(): { source: string; source_type: string } {
  const repoPath = findRepoConfig();
  const repoConfig = repoPath ? loadToml(repoPath) : null;
  if (repoConfig?.default_board) {
    return { source: repoPath!, source_type: 'repo' };
  }
  return { source: globalConfigPath(), source_type: 'global' };
}

export const statusCommand = new Command('status')
  .description('Show current board and issue summary')
  .option('--json', 'Output as JSON')
  .action(async (opts, command) => {
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const config = resolveConfig({ json: opts.json, server: globalOpts.server });
    const isJson = config.output === 'json';

    if (!config.default_board) {
      if (isJson) {
        console.log(jsonError('invalid_request', 'No board configured. Run `bd board use <name>` to set one.'));
      } else {
        console.error('No board configured. Run `bd board use <name>` to set one.');
      }
      process.exitCode = 1;
      return;
    }

    const { store, destroy } = await resolveStore(config);

    try {
      const boards = await store.listBoards();
      const board = boards.find((b) => b.id === config.default_board);

      if (!board) {
        if (isJson) {
          console.log(jsonError('not_found', `Board "${config.default_board}" not found.`));
        } else {
          console.error(`Board "${config.default_board}" not found.`);
        }
        process.exitCode = 1;
        return;
      }

      const readyIssues = await store.readyWork(config.default_board);
      const readyCount = readyIssues.length;
      const { source, source_type } = resolveSource();

      if (isJson) {
        console.log(jsonOutput({
          board: board.id,
          database: config.db_path,
          source,
          source_type,
          counts: {
            open: board.open_count,
            in_progress: board.in_progress_count,
            closed: board.closed_count,
          },
          ready: readyCount,
        }));
      } else {
        console.log(`Board:    ${board.id}`);
        console.log(`Database: ${config.db_path}`);
        console.log('');
        console.log(`  ${statusIcon('open')}  ${board.open_count} open  ${statusIcon('in_progress')}  ${board.in_progress_count} in progress  ${statusIcon('closed')} ${board.closed_count} closed  ${statusIcon('deferred')} ${board.deferred_count} deferred  ${statusIcon('blocked')} ${board.blocked_count} blocked`);
        console.log('');
        if (readyCount > 0) {
          console.log(`Ready to work: ${readyCount} ${readyCount === 1 ? 'issue' : 'issues'} (run \`bd ready\` to see them)`);
        } else {
          console.log('Ready to work: 0 issues');
        }
      }
    } catch (err) {
      if (err instanceof BoardsError) {
        if (isJson) {
          console.log(jsonError(err.code, err.message));
        } else {
          console.error(err.message);
        }
        process.exitCode = 1;
      } else {
        throw err;
      }
    } finally {
      await destroy();
    }
  });
