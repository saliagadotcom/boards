// bd claim

import { Command } from '@commander-js/extra-typings';
import { BoardsError } from '@saliagadotcom/boards-core';
import { resolveConfig } from '../config.js';
import { resolveStore } from '../resolve-store.js';
import { jsonOutput, jsonError } from '../json.js';

export const claimCommand = new Command('claim')
  .description('Claim an issue by assigning it')
  .argument('<id>', 'Issue ID to claim')
  .requiredOption('--assignee <name>', 'Assignee name')
  .option('--json', 'Output as JSON')
  .action(async (id, opts, command) => {
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const config = resolveConfig({ json: opts.json, server: globalOpts.server });
    const isJson = config.output === 'json';
    const { store, destroy } = await resolveStore(config);

    try {
      const issue = await store.claimIssue(id, opts.assignee);

      if (isJson) {
        console.log(jsonOutput(issue));
      } else {
        console.log(`Issue ${issue.id} claimed by @${opts.assignee}.`);
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
