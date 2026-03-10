// bd search

import { Command } from '@commander-js/extra-typings';
import { BoardsError } from '@saliagadotcom/boards-core';
import { resolveConfig } from '../config.js';
import { resolveStore } from '../resolve-store.js';
import { jsonOutput, jsonError } from '../json.js';
import { formatIssueList } from '../format.js';

export const searchCommand = new Command('search')
  .description('Search issues by text')
  .argument('<query>', 'Search query')
  .option('--board <name>', 'Board name')
  .option('--json', 'Output as JSON')
  .action(async (query, opts, command) => {
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const config = resolveConfig({ board: opts.board, json: opts.json, server: globalOpts.server });
    const isJson = config.output === 'json';
    const { store, destroy } = await resolveStore(config);

    try {
      if (!config.default_board) {
        if (isJson) {
          console.log(jsonError('invalid_request', 'No board specified. Use --board or set a default with `bd use <name>`.'));
        } else {
          console.error('No board specified. Use --board or set a default with `bd use <name>`.');
        }
        process.exitCode = 1;
        return;
      }

      const issues = await store.searchIssues(config.default_board, query);

      if (isJson) {
        console.log(jsonOutput(issues));
      } else {
        const output = formatIssueList(issues);
        if (output) {
          console.log(output);
        } else {
          console.log('No issues found.');
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
