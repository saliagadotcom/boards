// Layered config resolution (global + repo + flags)

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, parse as parsePath } from 'node:path';
import { homedir } from 'node:os';

export function boardsHome(): string {
  return process.env.BOARDS_HOME ?? join(homedir(), '.boards');
}

export interface BoardsConfig {
  default_board?: string;
  db_path?: string;
  server?: string;
  output?: 'text' | 'json';
}

export interface ResolvedConfig {
  default_board: string | undefined;
  db_path: string;
  server: string | undefined;
  output: 'text' | 'json';
}

const KNOWN_KEYS = new Set(['default_board', 'db_path', 'server', 'output']);

export function loadToml(path: string): BoardsConfig | null {
  if (!existsSync(path)) return null;

  const content = readFileSync(path, 'utf-8');
  const config: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    const match = trimmed.match(/^([\w]+)\s*=\s*(["'])(.*?)\2$/);
    if (match) {
      const [, key, , value] = match;
      if (key !== undefined && value !== undefined && KNOWN_KEYS.has(key)) {
        config[key] = value;
      }
    }
  }

  return config as BoardsConfig;
}

export function findRepoConfig(): string | null {
  let dir = process.cwd();

  while (true) {
    const candidate = join(dir, '.boards', 'config.toml');
    if (existsSync(candidate)) return candidate;

    const parsed = parsePath(dir);
    const parent = parsed.dir;
    if (parent === dir) return null;
    dir = parent;
  }
}

export function resolveConfig(flags: {
  board?: string | undefined;
  server?: string | undefined;
  json?: boolean | undefined;
}): ResolvedConfig {
  const globalPath = join(boardsHome(), 'config.toml');
  const globalConfig = loadToml(globalPath) ?? {};

  const repoPath = findRepoConfig();
  const repoConfig = repoPath ? (loadToml(repoPath) ?? {}) : {};

  const merged: ResolvedConfig = {
    default_board:
      flags.board ??
      repoConfig.default_board ??
      globalConfig.default_board ??
      undefined,
    db_path:
      repoConfig.db_path ??
      globalConfig.db_path ??
      join(boardsHome(), 'store.db'),
    server:
      flags.server ??
      process.env.BOARDS_SERVER ??
      repoConfig.server ??
      globalConfig.server ??
      undefined,
    output: flags.json
      ? 'json'
      : repoConfig.output ?? globalConfig.output ?? 'text',
  };

  return merged;
}

export function saveConfig(
  path: string,
  updates: Partial<BoardsConfig>,
): void {
  const existing = loadToml(path) ?? {};
  const merged = { ...existing, ...updates };

  const lines: string[] = [];
  for (const key of KNOWN_KEYS) {
    const value = merged[key as keyof BoardsConfig];
    if (value !== undefined) {
      const escaped = String(value)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n');
      lines.push(`${key} = "${escaped}"`);
    }
  }

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines.join('\n') + '\n', 'utf-8');
}
