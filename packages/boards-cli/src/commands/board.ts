// bd board create/list/delete/use

import { Command } from '@commander-js/extra-typings';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { BoardsError } from '@saliagadotcom/boards-core';
import {
  boardsHome,
  loadToml,
  saveConfig,
  findRepoConfig,
  resolveConfig,
} from '../config.js';
import { resolveStore } from '../resolve-store.js';
import { jsonOutput, jsonError } from '../json.js';
import { formatBoard } from '../format.js';

const VALID_KEYS = ['default_board', 'db_path', 'output'] as const;

function globalConfigPath(): string {
  return join(boardsHome(), 'config.toml');
}

function removeDefaultBoard(path: string): void {
  const existing = loadToml(path);
  if (!existing) return;

  delete existing.default_board;

  const lines: string[] = [];
  for (const k of VALID_KEYS) {
    const value = existing[k];
    if (value !== undefined) {
      lines.push(`${k} = "${value}"`);
    }
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines.length > 0 ? lines.join('\n') + '\n' : '', 'utf-8');
}

async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${message} [y/N] `);
    return answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes';
  } finally {
    rl.close();
  }
}

export const boardCommand = new Command('board').description(
  'Manage boards (create, list, delete, use)',
);

boardCommand
  .command('create')
  .description('Create a new board')
  .argument('<name>', 'Board name')
  .option('--prefix <prefix>', 'Issue ID prefix')
  .option('--description <text>', 'Board description')
  .option('--json', 'Output as JSON')
  .action(async (name, opts, command) => {
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const config = resolveConfig({ server: globalOpts.server });
    const { store, destroy } = await resolveStore(config);

    try {
      const input: { name: string; prefix?: string; description?: string } = { name };
      if (opts.prefix) input.prefix = opts.prefix;
      if (opts.description) input.description = opts.description;
      const board = await store.createBoard(input);

      const configPath = join(boardsHome(), 'config.toml');
      if (!config.default_board) {
        saveConfig(configPath, { default_board: name });
      }

      if (opts.json) {
        console.log(jsonOutput(board));
      } else {
        console.log(`Board "${name}" created.`);
        if (!config.default_board) {
          console.log('Set as default board.');
        }
      }
    } catch (err) {
      if (err instanceof BoardsError) {
        if (opts.json) {
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

boardCommand
  .command('list')
  .description('List all boards')
  .option('--json', 'Output as JSON')
  .action(async (opts, command) => {
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const isJson = !!opts.json;
    const config = resolveConfig({ json: isJson, server: globalOpts.server });
    const { store, destroy } = await resolveStore(config);

    try {
      const boards = await store.listBoards();

      if (isJson) {
        console.log(jsonOutput(boards));
      } else {
        if (boards.length === 0) {
          console.log('No boards found.');
        } else {
          for (const b of boards) {
            console.log(formatBoard(b));
            console.log();
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

boardCommand
  .command('delete')
  .description('Delete a board')
  .argument('<name>', 'Board name to delete')
  .option('--force', 'Skip confirmation')
  .option('--json', 'Output as JSON')
  .action(async (name, opts, command) => {
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const config = resolveConfig({ json: opts.json, server: globalOpts.server });
    const isJson = config.output === 'json';
    const { store, destroy } = await resolveStore(config);

    try {
      if (!opts.force) {
        const yes = await confirm(`Delete board "${name}" and all its data?`);
        if (!yes) {
          console.log('Aborted.');
          return;
        }
      }

      await store.deleteBoard(name);

      if (isJson) {
        console.log(jsonOutput({ status: 'deleted', board: name }));
      } else {
        console.log(`Board "${name}" deleted.`);
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

boardCommand
  .command('use')
  .description('Set or show the default board')
  .argument('[name]', 'Board name to set as default')
  .option('--global', 'Write to global config (~/.boards/config.toml)')
  .option('--clear', 'Remove repo-level default board override')
  .action(async (name, opts, command) => {
    const globalOpts = command.optsWithGlobals() as { server?: string };
    const config = resolveConfig({ server: globalOpts.server });

    if (opts.clear) {
      const repoPath = findRepoConfig();
      if (repoPath) {
        removeDefaultBoard(repoPath);
      }

      const globalConfig = loadToml(globalConfigPath());
      if (globalConfig?.default_board) {
        console.log(
          `Repo default cleared. Falling back to global: "${globalConfig.default_board}"`,
        );
      } else {
        console.log('Repo default cleared. No global default set.');
      }
      return;
    }

    if (!name) {
      if (!config.default_board) {
        console.log(
          'No default board configured. Run `bd board use <name>` to set one.',
        );
        return;
      }

      const repoPath = findRepoConfig();
      const repoConfig = repoPath ? loadToml(repoPath) : null;
      let source: string;
      let label: string;
      if (repoConfig?.default_board) {
        source = repoPath!;
        label = 'repo';
      } else {
        source = globalConfigPath();
        label = 'global';
      }

      console.log(`Current board: ${config.default_board}`);
      console.log(`Source: ${source} (${label})`);
      console.log(`Database: ${config.db_path}`);
      return;
    }

    const { store, destroy } = await resolveStore(config);
    const boards = await store.listBoards();
    const found = boards.find((b) => b.id === name);
    if (!found) {
      console.error(`Board not found: ${name}`);
      process.exitCode = 1;
      await destroy();
      return;
    }

    if (opts.global) {
      saveConfig(globalConfigPath(), { default_board: name });
      console.log(
        `Default board set to "${name}" (global: ${globalConfigPath()})`,
      );
    } else {
      const repoPath = join(process.cwd(), '.boards', 'config.toml');
      saveConfig(repoPath, { default_board: name });
      console.log(`Default board set to "${name}" (repo: .boards/config.toml)`);
    }

    await destroy();
  });
