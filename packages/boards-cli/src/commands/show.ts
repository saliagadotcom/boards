// bd show

import { Command } from '@commander-js/extra-typings';
import { BoardsError } from '@saliagadotcom/boards-core';
import { resolveConfig } from '../config.js';
import { resolveStore } from '../resolve-store.js';
import { jsonOutput, jsonError } from '../json.js';
import { formatIssueDetail } from '../format.js';

export const showCommand = new Command('show')
  .description('Show issue details')
  .argument('<id>', 'Issue ID')
  .option('--json', 'Output as JSON')
  .action(async (id, opts, command) => {
    const isJson = !!opts.json;
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const config = resolveConfig({ json: isJson, server: globalOpts.server });
    const { store, destroy } = await resolveStore(config);

    try {
      const detail = await store.showIssue(id);

      if (isJson) {
        console.log(jsonOutput(detail));
      } else {
        console.log(formatIssueDetail(detail));
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
