// bd update

import { Command } from '@commander-js/extra-typings';
import { BoardsError, parseStatus, parseIssueType } from '@saliagadotcom/boards-core';
import type { UpdateIssueInput } from '@saliagadotcom/boards-core';
import { resolveConfig } from '../config.js';
import { resolveStore } from '../resolve-store.js';
import { jsonOutput, jsonError } from '../json.js';
import { formatIssue } from '../format.js';

export const updateCommand = new Command('update')
  .description('Update an issue')
  .argument('<id>', 'Issue ID')
  .option('--title <text>', 'New title')
  .option('--description <text>', 'New description')
  .option('--design <text>', 'New design notes')
  .option('--acceptance-criteria <text>', 'New acceptance criteria')
  .option('--notes <text>', 'New notes')
  .option('--status <status>', 'New status')
  .option('--priority <n>', 'New priority', parseInt)
  .option('--type <type>', 'New issue type')
  .option('--assignee <name>', 'New assignee')
  .option('--owner <name>', 'New owner')
  .option('-l, --label <label>', 'Set labels (repeatable)', (val: string, prev: string[]) => {
    prev.push(val);
    return prev;
  }, [] as string[])
  .option('--set-labels <label>', 'Atomically replace labels (repeatable)', (val: string, prev: string[]) => {
    prev.push(val);
    return prev;
  }, [] as string[])
  .option('--clear-labels', 'Remove all labels')
  .option('--json', 'Output as JSON')
  .action(async (id, opts, command) => {
    const isJson = !!opts.json;
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const config = resolveConfig({ json: isJson, server: globalOpts.server });
    const { store, destroy } = await resolveStore(config);

    try {
      if (opts.label.length > 0 && opts.setLabels.length > 0) {
        const msg = 'Cannot use both -l/--label and --set-labels';
        if (isJson) {
          console.log(jsonError('invalid_request', msg));
        } else {
          console.error(msg);
        }
        process.exitCode = 1;
        return;
      }

      const input: UpdateIssueInput = {};
      if (opts.title) input.title = opts.title;
      if (opts.description) input.description = opts.description;
      if (opts.design) input.design = opts.design;
      if (opts.acceptanceCriteria) input.acceptance_criteria = opts.acceptanceCriteria;
      if (opts.notes) input.notes = opts.notes;
      if (opts.status) input.status = parseStatus(opts.status);
      if (opts.priority !== undefined) input.priority = opts.priority;
      if (opts.type) input.issue_type = parseIssueType(opts.type);
      if (opts.assignee) input.assignee = opts.assignee;
      if (opts.owner) input.owner = opts.owner;
      if (opts.label.length > 0) input.labels = opts.label;
      if (opts.setLabels.length > 0) input.labels = opts.setLabels;
      if (opts.clearLabels) input.labels = [];

      const issue = await store.updateIssue(id, input);

      if (isJson) {
        console.log(jsonOutput(issue));
      } else {
        console.log(`Updated ${issue.id}`);
        console.log(formatIssue(issue));
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
