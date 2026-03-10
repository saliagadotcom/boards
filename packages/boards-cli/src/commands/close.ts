// bd close

import { Command } from '@commander-js/extra-typings';
import { BoardsError, parseResolution } from '@saliagadotcom/boards-core';
import { resolveConfig } from '../config.js';
import { resolveStore } from '../resolve-store.js';
import { jsonOutput, jsonError } from '../json.js';

export const closeCommand = new Command('close')
  .description('Close an issue')
  .argument('<id>', 'Issue ID')
  .option('--reason <text>', 'Reason for closing')
  .option('--resolution <resolution>', 'Close resolution (completed, fixed, duplicate, failed, rejected, canceled)', 'completed')
  .option('--json', 'Output as JSON')
  .action(async (id, opts, command) => {
    const isJson = !!opts.json;
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const config = resolveConfig({ json: isJson, server: globalOpts.server });
    const { store, destroy } = await resolveStore(config);

    try {
      const resolution = parseResolution(opts.resolution);
      const issue = await store.closeIssue(id, opts.reason, resolution);

      if (isJson) {
        console.log(jsonOutput(issue));
      } else {
        console.log(`Closed ${issue.id}: ${issue.title} (${resolution})`);
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
