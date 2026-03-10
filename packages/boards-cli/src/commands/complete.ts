// bd complete

import { Command } from '@commander-js/extra-typings';
import { BoardsError } from '@saliagadotcom/boards-core';
import { resolveConfig } from '../config.js';
import { resolveStore } from '../resolve-store.js';
import { jsonOutput, jsonError } from '../json.js';

export const completeCommand = new Command('complete')
  .description('Close an issue as completed (shorthand for close --resolution completed)')
  .argument('<id>', 'Issue ID')
  .option('--reason <text>', 'Reason for completion')
  .option('--json', 'Output as JSON')
  .action(async (id, opts, command) => {
    const isJson = !!opts.json;
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const config = resolveConfig({ json: isJson, server: globalOpts.server });
    const { store, destroy } = await resolveStore(config);

    try {
      const issue = await store.closeIssue(id, opts.reason, 'completed');

      if (isJson) {
        console.log(jsonOutput(issue));
      } else {
        console.log(`Completed ${issue.id}: ${issue.title}`);
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
