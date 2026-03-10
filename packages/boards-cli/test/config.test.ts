import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  realpathSync,
  renameSync,
  existsSync,
} from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import {
  boardsHome,
  loadToml,
  saveConfig,
  resolveConfig,
  findRepoConfig,
} from '../src/config.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'boards-config-test-'));
}

describe('loadToml', () => {
  it('returns null for non-existent file', () => {
    expect(loadToml('/no/such/file.toml')).toBeNull();
  });

  it('parses valid TOML correctly', () => {
    const dir = makeTmpDir();
    const path = join(dir, 'config.toml');
    writeFileSync(
      path,
      `default_board = "api"\ndb_path = "/custom/path.db"\noutput = "json"\n`,
    );

    const result = loadToml(path);
    expect(result).toEqual({
      default_board: 'api',
      db_path: '/custom/path.db',
      output: 'json',
    });

    rmSync(dir, { recursive: true });
  });

  it('skips comments and blank lines', () => {
    const dir = makeTmpDir();
    const path = join(dir, 'config.toml');
    writeFileSync(
      path,
      `# This is a comment\n\ndefault_board = "main"\n# another comment\n`,
    );

    const result = loadToml(path);
    expect(result).toEqual({ default_board: 'main' });

    rmSync(dir, { recursive: true });
  });

  it('ignores unknown keys', () => {
    const dir = makeTmpDir();
    const path = join(dir, 'config.toml');
    writeFileSync(path, `unknown_key = "value"\ndefault_board = "x"\n`);

    const result = loadToml(path);
    expect(result).toEqual({ default_board: 'x' });

    rmSync(dir, { recursive: true });
  });

  it('handles single-quoted values', () => {
    const dir = makeTmpDir();
    const path = join(dir, 'config.toml');
    writeFileSync(path, `default_board = 'api'\n`);

    const result = loadToml(path);
    expect(result).toEqual({ default_board: 'api' });

    rmSync(dir, { recursive: true });
  });

  it('handles empty TOML file', () => {
    const dir = makeTmpDir();
    const path = join(dir, 'config.toml');
    writeFileSync(path, '');

    const result = loadToml(path);
    expect(result).toEqual({});

    rmSync(dir, { recursive: true });
  });
});

describe('resolveConfig', () => {
  let originalCwd: string;
  let isolatedDir: string;
  const globalConfig = join(homedir(), '.boards', 'config.toml');
  const globalConfigBackup = globalConfig + '.bak';
  let hadGlobalConfig = false;

  beforeEach(() => {
    originalCwd = process.cwd();
    isolatedDir = realpathSync(makeTmpDir());
    process.chdir(isolatedDir);
    hadGlobalConfig = existsSync(globalConfig);
    if (hadGlobalConfig) {
      renameSync(globalConfig, globalConfigBackup);
    }
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(isolatedDir, { recursive: true });
    if (hadGlobalConfig) {
      renameSync(globalConfigBackup, globalConfig);
    }
  });

  it('returns defaults when no config files exist', () => {
    const result = resolveConfig({});
    expect(result.default_board).toBeUndefined();
    expect(result.db_path).toContain('.boards');
    expect(result.db_path).toContain('store.db');
    expect(result.output).toBe('text');
  });

  it('flags override defaults', () => {
    const result = resolveConfig({
      board: 'flagged',
      json: true,
    });
    expect(result.default_board).toBe('flagged');
    expect(result.output).toBe('json');
  });

  it('json flag sets output to json', () => {
    const result = resolveConfig({ json: true });
    expect(result.output).toBe('json');
  });

  it('json false does not override config output', () => {
    const result = resolveConfig({ json: false });
    expect(result.output).toBe('text');
  });

  it('partial config inherits missing keys from defaults', () => {
    const result = resolveConfig({});
    expect(result.db_path).toContain('store.db');
    expect(result.output).toBe('text');
    expect(result.default_board).toBeUndefined();
  });

  it('BOARDS_HOME overrides default paths', () => {
    const tmp = makeTmpDir();
    const original = process.env.BOARDS_HOME;
    try {
      process.env.BOARDS_HOME = tmp;
      expect(boardsHome()).toBe(tmp);
      const result = resolveConfig({});
      expect(result.db_path).toBe(join(tmp, 'store.db'));
    } finally {
      if (original === undefined) {
        delete process.env.BOARDS_HOME;
      } else {
        process.env.BOARDS_HOME = original;
      }
      rmSync(tmp, { recursive: true });
    }
  });
});

describe('saveConfig', () => {
  it('creates file and parent dirs', () => {
    const dir = makeTmpDir();
    const path = join(dir, 'nested', 'deep', 'config.toml');

    saveConfig(path, { default_board: 'test' });

    const loaded = loadToml(path);
    expect(loaded).not.toBeNull();
    expect(loaded!.default_board).toBe('test');

    rmSync(dir, { recursive: true });
  });

  it('round-trips save then load', () => {
    const dir = makeTmpDir();
    const path = join(dir, 'config.toml');

    const original = {
      default_board: 'api' as const,
      db_path: '/my/db.sqlite' as const,
      output: 'json' as const,
    };

    saveConfig(path, original);
    const loaded = loadToml(path);

    expect(loaded).toEqual(original);

    rmSync(dir, { recursive: true });
  });

  it('merges updates into existing config', () => {
    const dir = makeTmpDir();
    const path = join(dir, 'config.toml');

    saveConfig(path, { default_board: 'first' });
    saveConfig(path, { output: 'json' });

    const loaded = loadToml(path);
    expect(loaded!.default_board).toBe('first');
    expect(loaded!.output).toBe('json');

    rmSync(dir, { recursive: true });
  });

  it('silently ignores unknown keys', () => {
    const dir = makeTmpDir();
    const path = join(dir, 'config.toml');

    // Cast to bypass TypeScript to simulate unknown keys at runtime
    saveConfig(path, {
      default_board: 'valid',
      bogus_key: 'should be dropped',
    } as any);

    const loaded = loadToml(path);
    expect(loaded).toEqual({ default_board: 'valid' });

    // Also verify the raw file doesn't contain the unknown key
    const raw = readFileSync(path, 'utf-8');
    expect(raw).not.toContain('bogus_key');

    rmSync(dir, { recursive: true });
  });
});

describe('findRepoConfig', () => {
  let originalCwd: string;
  let dir: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    dir = realpathSync(makeTmpDir());
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(dir, { recursive: true });
  });

  it('finds .boards/config.toml in current directory', () => {
    const configDir = join(dir, '.boards');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'config.toml'), `default_board = "here"\n`);

    process.chdir(dir);
    const result = findRepoConfig();
    expect(result).toBe(join(dir, '.boards', 'config.toml'));
  });

  it('finds .boards/config.toml in parent directory (walk-up)', () => {
    const configDir = join(dir, '.boards');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'config.toml'),
      `default_board = "parent"\n`,
    );

    const child = join(dir, 'deep', 'nested');
    mkdirSync(child, { recursive: true });

    process.chdir(child);
    const result = findRepoConfig();
    expect(result).toBe(join(dir, '.boards', 'config.toml'));
  });

  it('returns null when no config found anywhere', () => {
    // Use a bare temp dir with no .boards anywhere in it
    const empty = realpathSync(makeTmpDir());
    process.chdir(empty);

    const result = findRepoConfig();
    expect(result).toBeNull();

    rmSync(empty, { recursive: true });
  });

  it('uses closest config (first found walking up)', () => {
    // Parent config
    const parentConfig = join(dir, '.boards');
    mkdirSync(parentConfig, { recursive: true });
    writeFileSync(
      join(parentConfig, 'config.toml'),
      `default_board = "parent"\n`,
    );

    // Child config (closer)
    const child = join(dir, 'sub');
    const childConfig = join(child, '.boards');
    mkdirSync(childConfig, { recursive: true });
    writeFileSync(
      join(childConfig, 'config.toml'),
      `default_board = "child"\n`,
    );

    process.chdir(child);
    const result = findRepoConfig();
    expect(result).toBe(join(child, '.boards', 'config.toml'));
  });
});
