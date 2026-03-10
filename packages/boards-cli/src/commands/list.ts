// bd list

import { Command } from '@commander-js/extra-typings';
import { BoardsError, parseStatus, parseIssueType } from '@saliagadotcom/boards-core';
import type { ListIssuesFilter } from '@saliagadotcom/boards-core';
import { resolveConfig } from '../config.js';
import { resolveStore } from '../resolve-store.js';
import { jsonOutput, jsonError } from '../json.js';
import { formatIssueList } from '../format.js';

export const listCommand = new Command('list')
  .description('List issues')
  .option('--board <name>', 'Board name')
  .option('--status <status>', 'Filter by status')
  .option('--priority <n>', 'Filter by priority', parseInt)
  .option('--type <type>', 'Filter by issue type')
  .option('--assignee <name>', 'Filter by assignee')
  .option('--label <label>', 'Filter by label')
  .option('--json', 'Output as JSON')
  .action(async (opts, command) => {
    const isJson = !!opts.json;
    const flags: { board?: string; json?: boolean; server?: string } = { json: isJson };
    if (opts.board) flags.board = opts.board;
    const globalOpts = command.optsWithGlobals() as { server?: string };
    flags.server = globalOpts.server;
    const config = resolveConfig(flags);
    const { store, destroy } = await resolveStore(config);

    try {
      const board = config.default_board;

      if (!board) {
        if (isJson) {
          console.log(jsonError('invalid_request', 'No board specified. Use --board or set a default with `bd board use <name>`.'));
        } else {
          console.error('No board specified. Use --board or set a default with `bd board use <name>`.');
        }
        process.exitCode = 1;
        return;
      }

      const filter: ListIssuesFilter = {};
      if (opts.status) filter.status = parseStatus(opts.status);
      if (opts.priority !== undefined) filter.priority = opts.priority;
      if (opts.type) filter.issue_type = parseIssueType(opts.type);
      if (opts.assignee) filter.assignee = opts.assignee;
      if (opts.label) filter.label = opts.label;

      const issues = await store.listIssues(board, filter);

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
