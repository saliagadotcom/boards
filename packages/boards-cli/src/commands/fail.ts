// bd fail

import { Command } from '@commander-js/extra-typings';
import { BoardsError } from '@saliagadotcom/boards-core';
import { resolveConfig } from '../config.js';
import { resolveStore } from '../resolve-store.js';
import { jsonOutput, jsonError } from '../json.js';

export const failCommand = new Command('fail')
  .description('Close an issue as failed (shorthand for close --resolution failed)')
  .argument('<id>', 'Issue ID')
  .option('--reason <text>', 'Reason for failure')
  .option('--json', 'Output as JSON')
  .action(async (id, opts, command) => {
    const isJson = !!opts.json;
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const config = resolveConfig({ json: isJson, server: globalOpts.server });
    const { store, destroy } = await resolveStore(config);

    try {
      const issue = await store.closeIssue(id, opts.reason, 'failed');

      if (isJson) {
        console.log(jsonOutput(issue));
      } else {
        console.log(`Failed ${issue.id}: ${issue.title}`);
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
