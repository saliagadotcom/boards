// bd delete

import { Command } from '@commander-js/extra-typings';
import { createInterface } from 'node:readline/promises';
import { BoardsError } from '@saliagadotcom/boards-core';
import { resolveConfig } from '../config.js';
import { resolveStore } from '../resolve-store.js';
import { jsonOutput, jsonError } from '../json.js';

async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${message} [y/N] `);
    return answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}

export const deleteCommand = new Command('delete')
  .description('Delete one or more issues')
  .argument('<ids...>', 'Issue IDs')
  .option('--force', 'Skip confirmation prompt')
  .option('--json', 'Output as JSON')
  .action(async (ids, opts, command) => {
    const isJson = !!opts.json;
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const config = resolveConfig({ json: isJson, server: globalOpts.server });
    const { store, destroy } = await resolveStore(config);

    try {
      if (ids.length === 1) {
        const id = ids[0]!;
        if (!opts.force) {
          const yes = await confirm(`Delete issue ${id}?`);
          if (!yes) {
            console.log('Aborted.');
            return;
          }
        }

        await store.deleteIssue(id);

        if (isJson) {
          console.log(jsonOutput({ status: 'deleted', id: ids[0] }));
        } else {
          console.log(`Deleted ${ids[0]}`);
        }
      } else {
        if (!opts.force) {
          const yes = await confirm(`Delete ${ids.length} issues (${ids.join(', ')})?`);
          if (!yes) {
            console.log('Aborted.');
            return;
          }
        }

        const result = await store.deleteIssues(ids);

        if (isJson) {
          console.log(jsonOutput(result));
        } else {
          if (result.deleted.length > 0) {
            console.log(`Deleted: ${result.deleted.join(', ')}`);
          }
          if (result.not_found.length > 0) {
            console.log(`Not found: ${result.not_found.join(', ')}`);
          }
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
