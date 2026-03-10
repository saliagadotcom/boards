// bd config set/get/list/unset

import { Command } from '@commander-js/extra-typings';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  boardsHome,
  loadToml,
  saveConfig,
  findRepoConfig,
  resolveConfig,
} from '../config.js';
import { formatConfig } from '../format.js';

const VALID_KEYS = ['default_board', 'db_path', 'server', 'output'] as const;
type ConfigKey = (typeof VALID_KEYS)[number];

function isValidKey(key: string): key is ConfigKey {
  return (VALID_KEYS as readonly string[]).includes(key);
}

function globalConfigPath(): string {
  return join(boardsHome(), 'config.toml');
}

function repoConfigPath(): string {
  return findRepoConfig() ?? join(process.cwd(), '.boards', 'config.toml');
}

function resolveOrigin(
  key: ConfigKey,
): { value: string | undefined; file: string | null; label: string } {
  // For 'server', check env var first (higher priority than config files)
  if (key === 'server' && process.env.BOARDS_SERVER) {
    return { value: process.env.BOARDS_SERVER, file: null, label: 'env (BOARDS_SERVER)' };
  }

  const repoPath = findRepoConfig();
  if (repoPath) {
    const repoConfig = loadToml(repoPath);
    if (repoConfig && repoConfig[key] !== undefined) {
      return { value: repoConfig[key], file: repoPath, label: 'repo' };
    }
  }

  const gPath = globalConfigPath();
  const globalConfig = loadToml(gPath);
  if (globalConfig && globalConfig[key] !== undefined) {
    return { value: globalConfig[key], file: gPath, label: 'global' };
  }

  const resolved = resolveConfig({});
  const defaultValue = resolved[key];
  return {
    value: defaultValue !== undefined ? String(defaultValue) : undefined,
    file: null,
    label: 'default',
  };
}

function removeConfig(path: string, key: ConfigKey): void {
  const existing = loadToml(path);
  if (!existing) return;

  delete existing[key];

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

export const configCommand = new Command('config').description(
  'Manage configuration',
);

configCommand
  .command('set')
  .description('Set a configuration value')
  .argument('<key>', 'Configuration key')
  .argument('<value>', 'Configuration value')
  .option('--global', 'Write to global config (~/.boards/config.toml)')
  .action((key, value, opts) => {
    if (!isValidKey(key)) {
      console.error(
        `Unknown config key: ${key}. Valid keys: ${VALID_KEYS.join(', ')}`,
      );
      process.exitCode = 1;
      return;
    }

    if (key === 'output' && value !== 'text' && value !== 'json') {
      console.error(`Invalid value for output: ${value}. Must be 'text' or 'json'`);
      process.exitCode = 1;
      return;
    }

    if (key === 'server') {
      try {
        new URL(value);
      } catch {
        console.error(`Invalid server URL: ${value}`);
        process.exitCode = 1;
        return;
      }
    }

    const path = opts.global ? globalConfigPath() : repoConfigPath();
    saveConfig(path, { [key]: value });

    const label = opts.global
      ? globalConfigPath()
      : '.boards/config.toml';
    console.log(`Set ${key} = ${value} in ${label}`);
  });

configCommand
  .command('get')
  .description('Get a configuration value')
  .argument('<key>', 'Configuration key')
  .option('--show-origin', 'Show where the value comes from')
  .action((key, opts) => {
    if (!isValidKey(key)) {
      console.error(
        `Unknown config key: ${key}. Valid keys: ${VALID_KEYS.join(', ')}`,
      );
      process.exitCode = 1;
      return;
    }

    const origin = resolveOrigin(key);

    if (opts.showOrigin) {
      const display = origin.value ?? '(not set)';
      const source = origin.file ?? origin.label;
      console.log(`${display}\t${source} (${origin.label})`);
    } else {
      console.log(origin.value ?? '(not set)');
    }
  });

configCommand
  .command('list')
  .description('List all configuration values')
  .option('--show-origin', 'Show where each value comes from')
  .action((opts) => {
    const resolved = resolveConfig({});

    if (opts.showOrigin) {
      const origins = new Map<string, string>();
      for (const key of VALID_KEYS) {
        const o = resolveOrigin(key);
        const source = o.file ? `${o.file} (${o.label})` : `(${o.label})`;
        origins.set(key, source);
      }
      console.log(formatConfig(resolved, origins));
    } else {
      console.log(formatConfig(resolved));
    }
  });

configCommand
  .command('unset')
  .description('Remove a configuration key')
  .argument('<key>', 'Configuration key to remove')
  .option('--global', 'Remove from global config (~/.boards/config.toml)')
  .action((key, opts) => {
    if (!isValidKey(key)) {
      console.error(
        `Unknown config key: ${key}. Valid keys: ${VALID_KEYS.join(', ')}`,
      );
      process.exitCode = 1;
      return;
    }

    const path = opts.global ? globalConfigPath() : repoConfigPath();
    removeConfig(path, key);

    const label = opts.global
      ? globalConfigPath()
      : '.boards/config.toml';
    console.log(`Removed ${key} from ${label}`);
  });
