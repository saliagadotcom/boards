// bd reopen

import { Command } from '@commander-js/extra-typings';
import { BoardsError } from '@saliagadotcom/boards-core';
import { resolveConfig } from '../config.js';
import { resolveStore } from '../resolve-store.js';
import { jsonOutput, jsonError } from '../json.js';

export const reopenCommand = new Command('reopen')
  .description('Reopen a closed issue')
  .argument('<id>', 'Issue ID')
  .option('--status <status>', 'Target status (open or in_progress)', 'open')
  .option('--json', 'Output as JSON')
  .action(async (id, opts, command) => {
    const isJson = !!opts.json;
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const config = resolveConfig({ json: isJson, server: globalOpts.server });
    const { store, destroy } = await resolveStore(config);

    try {
      const status = opts.status as 'open' | 'in_progress';
      const issue = await store.reopenIssue(id, status);

      if (isJson) {
        console.log(jsonOutput(issue));
      } else {
        console.log(`Reopened ${issue.id}: ${issue.title} → ${issue.status}`);
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
