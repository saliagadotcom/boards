import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadToml, saveConfig } from '../src/config.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'boards-config-cmd-test-'));
}

describe('config set', () => {
  let dir: string;
  let configPath: string;

  beforeEach(() => {
    dir = makeTmpDir();
    configPath = join(dir, '.boards', 'config.toml');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it('writes key=value to config file', () => {
    saveConfig(configPath, { default_board: 'api' });

    const loaded = loadToml(configPath);
    expect(loaded).not.toBeNull();
    expect(loaded!.default_board).toBe('api');
  });

  it('writes to a different path for global', () => {
    const globalPath = join(dir, 'global', '.boards', 'config.toml');
    saveConfig(globalPath, { db_path: '/custom/db.sqlite' });

    const loaded = loadToml(globalPath);
    expect(loaded).not.toBeNull();
    expect(loaded!.db_path).toBe('/custom/db.sqlite');
  });

});

describe('config get', () => {
  let dir: string;
  let configPath: string;

  beforeEach(() => {
    dir = makeTmpDir();
    configPath = join(dir, '.boards', 'config.toml');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it('returns resolved value from config', () => {
    saveConfig(configPath, { default_board: 'myboard' });
    const loaded = loadToml(configPath);
    expect(loaded!.default_board).toBe('myboard');
  });

  it('returns undefined for unset keys', () => {
    saveConfig(configPath, { output: 'json' });
    const loaded = loadToml(configPath);
    expect(loaded!.default_board).toBeUndefined();
  });
});

describe('config list', () => {
  let dir: string;
  let configPath: string;

  beforeEach(() => {
    dir = makeTmpDir();
    configPath = join(dir, '.boards', 'config.toml');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it('shows all keys from config', () => {
    saveConfig(configPath, {
      default_board: 'api',
      db_path: '/my/db.sqlite',
      output: 'json',
    });

    const loaded = loadToml(configPath);
    expect(loaded).toEqual({
      default_board: 'api',
      db_path: '/my/db.sqlite',
      output: 'json',
    });

    // All known keys should be present
    expect(loaded!.default_board).toBeDefined();
    expect(loaded!.db_path).toBeDefined();
    expect(loaded!.output).toBeDefined();
  });
});

describe('config unset', () => {
  let dir: string;
  let configPath: string;

  beforeEach(() => {
    dir = makeTmpDir();
    configPath = join(dir, '.boards', 'config.toml');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true });
  });

  it('removes a key from config', () => {
    saveConfig(configPath, {
      default_board: 'api',
      db_path: '/my/db.sqlite',
      output: 'json',
    });

    // Simulate unset by rewriting without the key
    const existing = loadToml(configPath)!;
    delete existing.default_board;

    const KNOWN_KEYS = ['default_board', 'db_path', 'output'] as const;
    const lines: string[] = [];
    for (const k of KNOWN_KEYS) {
      const value = existing[k];
      if (value !== undefined) {
        lines.push(`${k} = "${value}"`);
      }
    }
    mkdirSync(join(dir, '.boards'), { recursive: true });
    writeFileSync(configPath, lines.join('\n') + '\n', 'utf-8');

    const loaded = loadToml(configPath);
    expect(loaded!.default_board).toBeUndefined();
    expect(loaded!.db_path).toBe('/my/db.sqlite');
    expect(loaded!.output).toBe('json');
  });

  it('handles removing from empty config gracefully', () => {
    // File doesn't exist yet - loadToml returns null
    const loaded = loadToml(configPath);
    expect(loaded).toBeNull();
  });
});
