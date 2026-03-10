// bd ready

import { Command } from '@commander-js/extra-typings';
import { BoardsError } from '@saliagadotcom/boards-core';
import type { IssueType } from '@saliagadotcom/boards-core';
import { resolveConfig } from '../config.js';
import { resolveStore } from '../resolve-store.js';
import { jsonOutput, jsonError } from '../json.js';
import { formatIssueList } from '../format.js';

export const readyCommand = new Command('ready')
  .description('Show issues ready to work on (no blockers)')
  .option('--board <name>', 'Board name')
  .option('--assignee <name>', 'Filter by assignee')
  .option('--unassigned', 'Show only unassigned issues')
  .option('--priority <n>', 'Filter by priority', parseInt)
  .option('--type <type>', 'Filter by issue type')
  .option('--label <label>', 'Filter by label')
  .option('--include-epics', 'Include epic issues in results')
  .option('--json', 'Output as JSON')
  .action(async (opts, command) => {
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

      const filter: {
        assignee?: string;
        unassigned?: boolean;
        priority?: number;
        issue_type?: IssueType;
        label?: string;
        include_epics?: boolean;
      } = {};
      if (opts.assignee) filter.assignee = opts.assignee;
      if (opts.unassigned) filter.unassigned = true;
      if (opts.priority !== undefined) filter.priority = opts.priority;
      if (opts.type) filter.issue_type = opts.type as IssueType;
      if (opts.label) filter.label = opts.label;
      if (opts.includeEpics) filter.include_epics = true;

      const issues = await store.readyWork(config.default_board, filter);

      if (isJson) {
        console.log(jsonOutput(issues));
      } else {
        const output = formatIssueList(issues);
        if (output) {
          console.log(output);
        } else {
          console.log('No issues ready.');
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
