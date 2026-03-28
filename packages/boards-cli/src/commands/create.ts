// bd create

import { Command } from '@commander-js/extra-typings';
import { BoardsError, parseIssueType } from '@saliagadotcom/boards-core';
import { resolveStore } from '../resolve-store.js';
import type { CreateIssueInput } from '@saliagadotcom/boards-core';
import { resolveConfig } from '../config.js';
import { jsonOutput, jsonError } from '../json.js';

export const createCommand = new Command('create')
  .description('Create a new issue')
  .argument('<title>', 'Issue title')
  .option('--board <name>', 'Board name')
  .option('-p, --priority <n>', 'Priority (0-4)', parseInt, 1)
  .option('-t, --type <type>', 'Issue type', 'task')
  .option('-d, --description <text>', 'Description')
  .option('--design <text>', 'Design notes')
  .option('--acceptance-criteria <text>', 'Acceptance criteria')
  .option('--notes <text>', 'Notes')
  .option('-a, --assignee <name>', 'Assignee')
  .option('--owner <name>', 'Owner')
  .option('-l, --label <label>', 'Add label (repeatable)', (val: string, prev: string[]) => {
    prev.push(val);
    return prev;
  }, [] as string[])
  .option('--parent <id>', 'Parent issue ID (creates parent-child dependency)')
  .option('--json', 'Output as JSON')
  .action(async (title, opts, command) => {
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const isJson = !!opts.json;
    const flags: { board?: string; json?: boolean; server?: string } = { json: isJson, server: globalOpts.server };
    if (opts.board) flags.board = opts.board;
    const config = resolveConfig(flags);
    const board = config.default_board;

    if (!board) {
      if (isJson) {
        console.log(jsonError('invalid_request', 'No board specified. Use --board or set a default with `bd use <name>`.'));
                } else {
                  console.error('No board specified. Use --board or set a default with `bd use <name>`.');
      }
      process.exitCode = 1;
      return;
    }

    const { store, destroy } = await resolveStore(config);

    try {
      const priority = isNaN(opts.priority) ? 1 : opts.priority;
      const input: CreateIssueInput = {
        board,
        title,
        priority,
        issue_type: parseIssueType(opts.type),
      };
      if (opts.description) input.description = opts.description;
      if (opts.design) input.design = opts.design;
      if (opts.acceptanceCriteria) input.acceptance_criteria = opts.acceptanceCriteria;
      if (opts.notes) input.notes = opts.notes;
      if (opts.assignee) input.assignee = opts.assignee;
      if (opts.owner) input.owner = opts.owner;
      if (opts.label.length > 0) input.labels = opts.label;

      const issue = opts.parent
        ? await store.createIssueWithParent(input, opts.parent)
        : await store.createIssue(input);

      if (isJson) {
        console.log(jsonOutput(issue));
      } else {
        console.log(`Created ${issue.id}: ${issue.title}`);
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
