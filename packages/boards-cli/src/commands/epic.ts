// bd epic status / bd epic close-eligible

import { Command } from '@commander-js/extra-typings';
import { BoardsError } from '@saliagadotcom/boards-core';
import { resolveConfig } from '../config.js';
import { resolveStore } from '../resolve-store.js';
import { jsonOutput, jsonError } from '../json.js';

export const epicCommand = new Command('epic').description(
  'Epic lifecycle management',
);

epicCommand
  .command('status')
  .description('Show epic completion status')
  .option('--board <name>', 'Board name')
  .option('--eligible-only', 'Show only epics eligible for closure')
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

      let epics = await store.epicStatus(config.default_board);

      if (opts.eligibleOnly) {
        epics = epics.filter((e) => e.eligibleForClose);
      }

      if (isJson) {
        console.log(jsonOutput(epics));
        return;
      }

      if (epics.length === 0) {
        console.log('No open epics found.');
        return;
      }

      for (const epicStatus of epics) {
        const { epic, totalChildren, closedChildren, eligibleForClose } = epicStatus;
        const percentage = totalChildren > 0 ? Math.floor((closedChildren * 100) / totalChildren) : 0;
        const icon = eligibleForClose ? '✓' : percentage > 0 ? '◐' : '○';
        console.log(`${icon} ${epic.id}: ${epic.title}`);
        console.log(`   Progress: ${closedChildren}/${totalChildren} children closed (${percentage}%)`);
        if (eligibleForClose) {
          console.log('   Eligible for closure');
        }
        console.log();
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

epicCommand
  .command('close-eligible')
  .description('Close epics where all children are complete')
  .option('--board <name>', 'Board name')
  .option('--dry-run', 'Preview what would be closed without making changes')
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

      const allEpics = await store.epicStatus(config.default_board);
      const eligible = allEpics.filter((e) => e.eligibleForClose);

      if (eligible.length === 0) {
        if (isJson) {
          console.log(jsonOutput({ closed: [], count: 0 }));
        } else {
          console.log('No epics eligible for closure.');
        }
        return;
      }

      if (opts.dryRun) {
        if (isJson) {
          console.log(jsonOutput(eligible));
        } else {
          console.log(`Would close ${eligible.length} epic(s):`);
          for (const e of eligible) {
            console.log(`  - ${e.epic.id}: ${e.epic.title}`);
          }
        }
        return;
      }

      const closedIds: string[] = [];
      for (const e of eligible) {
        try {
          await store.closeIssue(e.epic.id, 'All children completed');
          closedIds.push(e.epic.id);
        } catch (closeErr) {
          console.error(`Error closing ${e.epic.id}: ${closeErr instanceof Error ? closeErr.message : closeErr}`);
        }
      }

      if (isJson) {
        console.log(jsonOutput({ closed: closedIds, count: closedIds.length }));
      } else {
        console.log(`✓ Closed ${closedIds.length} epic(s)`);
        for (const id of closedIds) {
          console.log(`  - ${id}`);
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
