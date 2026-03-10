// bd label add/remove

import { Command } from '@commander-js/extra-typings';
import { BoardsError } from '@saliagadotcom/boards-core';
import { resolveConfig } from '../config.js';
import { resolveStore } from '../resolve-store.js';
import { jsonOutput, jsonError } from '../json.js';

export const labelCommand = new Command('label').description(
  'Manage issue labels',
);

labelCommand
  .command('add')
  .description('Add a label to an issue')
  .argument('<issue-id>', 'Issue to label')
  .argument('<label>', 'Label to add')
  .option('--json', 'Output as JSON')
  .action(async (issueId, label, opts, command) => {
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const config = resolveConfig({ json: opts.json, server: globalOpts.server });
    const isJson = config.output === 'json';
    const { store, destroy } = await resolveStore(config);

    try {
      await store.addLabel(issueId, label);

      if (isJson) {
        console.log(jsonOutput({ status: 'added', issue_id: issueId, label }));
      } else {
        console.log(`Label "${label}" added to ${issueId}.`);
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

labelCommand
  .command('remove')
  .description('Remove a label from an issue')
  .argument('<issue-id>', 'Issue to unlabel')
  .argument('<label>', 'Label to remove')
  .option('--json', 'Output as JSON')
  .action(async (issueId, label, opts, command) => {
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const config = resolveConfig({ json: opts.json, server: globalOpts.server });
    const isJson = config.output === 'json';
    const { store, destroy } = await resolveStore(config);

    try {
      await store.removeLabel(issueId, label);

      if (isJson) {
        console.log(jsonOutput({ status: 'removed', issue_id: issueId, label }));
      } else {
        console.log(`Label "${label}" removed from ${issueId}.`);
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
