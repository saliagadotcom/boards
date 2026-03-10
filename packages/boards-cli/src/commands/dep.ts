// bd dep add/remove/list

import { Command } from '@commander-js/extra-typings';
import { BoardsError, parseDependencyType, parseDirection } from '@saliagadotcom/boards-core';
import { resolveConfig } from '../config.js';
import { resolveStore } from '../resolve-store.js';
import { jsonOutput, jsonError } from '../json.js';
import { formatDependency } from '../format.js';

export const depCommand = new Command('dep').description(
  'Manage issue dependencies',
);

depCommand
  .command('add')
  .description('Add a dependency between issues')
  .argument('<issue-id>', 'Issue that depends on another')
  .argument('<depends-on-id>', 'Issue that is depended on')
  .option('--type <type>', 'Dependency type', 'blocks')
  .option('--created-by <author>', 'Who created this dependency')
  .option('--metadata <json>', 'JSON metadata for the dependency')
  .option('--json', 'Output as JSON')
  .action(async (issueId, dependsOnId, opts, command) => {
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const config = resolveConfig({ json: opts.json, server: globalOpts.server });
    const isJson = config.output === 'json';
    const { store, destroy } = await resolveStore(config);

    try {
      await store.addDependency({
        issue_id: issueId,
        depends_on_id: dependsOnId,
        type: parseDependencyType(opts.type),
        created_by: opts.createdBy,
        metadata: opts.metadata ? JSON.parse(opts.metadata) : undefined,
      });

      if (isJson) {
        console.log(jsonOutput({ status: 'added', issue_id: issueId, depends_on_id: dependsOnId, type: opts.type }));
      } else {
        console.log(`Dependency added: ${issueId} → ${dependsOnId} (${opts.type})`);
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

depCommand
  .command('remove')
  .description('Remove a dependency between issues')
  .argument('<issue-id>', 'Issue that depends on another')
  .argument('<depends-on-id>', 'Issue that is depended on')
  .option('--json', 'Output as JSON')
  .action(async (issueId, dependsOnId, opts, command) => {
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const config = resolveConfig({ json: opts.json, server: globalOpts.server });
    const isJson = config.output === 'json';
    const { store, destroy } = await resolveStore(config);

    try {
      await store.removeDependency(issueId, dependsOnId);

      if (isJson) {
        console.log(jsonOutput({ status: 'removed', issue_id: issueId, depends_on_id: dependsOnId }));
      } else {
        console.log(`Dependency removed: ${issueId} → ${dependsOnId}`);
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

depCommand
  .command('list')
  .description('List dependencies for an issue')
  .argument('<issue-id>', 'Issue to list dependencies for')
  .option('--direction <direction>', 'Dependency direction (down or up)', 'down')
  .option('--type <type>', 'Filter by dependency type')
  .option('--json', 'Output as JSON')
  .action(async (issueId, opts, command) => {
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const config = resolveConfig({ json: opts.json, server: globalOpts.server });
    const isJson = config.output === 'json';
    const { store, destroy } = await resolveStore(config);

    try {
      const deps = await store.listDependencies(
        issueId,
        parseDirection(opts.direction),
        opts.type ? parseDependencyType(opts.type) : undefined,
      );

      if (isJson) {
        console.log(jsonOutput(deps));
      } else {
        if (deps.length === 0) {
          console.log('No dependencies found.');
        } else {
          for (const dep of deps) {
            console.log(formatDependency(dep));
          }
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
