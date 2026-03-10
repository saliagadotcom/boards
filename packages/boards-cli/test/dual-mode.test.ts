import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveConfig } from '../src/config.js';
import { resolveStore } from '../src/resolve-store.js';

const CLI = join(import.meta.dir, '..', 'bin', 'bd.ts');

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'boards-dual-mode-'));
}

async function run(
  args: string[],
  opts: { env?: Record<string, string>; cwd?: string } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['bun', 'run', CLI, ...args], {
    env: { ...process.env, ...opts.env },
    cwd: opts.cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

// ─── resolveStore Unit Tests ─────────────────────────────────────────────────

describe('resolveStore', () => {
  it('returns local mode when no server is configured', async () => {
    const config = resolveConfig({});
    config.db_path = ':memory:';
    const { store, mode, destroy } = await resolveStore(config);
    expect(mode).toBe('local');
    expect(store).toBeDefined();
    await destroy();
  });

  it('returns remote mode when server is configured', async () => {
    const config = resolveConfig({ server: 'http://localhost:9999' });
    const { store, mode, destroy } = await resolveStore(config);
    expect(mode).toBe('remote');
    expect(store).toBeDefined();
    await destroy();
  });

  it('remote store destroy is a no-op', async () => {
    const config = resolveConfig({ server: 'http://localhost:9999' });
    const { destroy } = await resolveStore(config);
    // Should not throw
    await destroy();
  });
});

// ─── resolveConfig Precedence Tests ──────────────────────────────────────────

describe('resolveConfig server precedence', () => {
  it('--server flag takes precedence over env var', () => {
    const originalEnv = process.env.BOARDS_SERVER;
    process.env.BOARDS_SERVER = 'http://env.example.com';
    try {
      const config = resolveConfig({ server: 'http://flag.example.com' });
      expect(config.server).toBe('http://flag.example.com');
    } finally {
      if (originalEnv !== undefined) {
        process.env.BOARDS_SERVER = originalEnv;
      } else {
        delete process.env.BOARDS_SERVER;
      }
    }
  });

  it('BOARDS_SERVER env var used when no flag', () => {
    const originalEnv = process.env.BOARDS_SERVER;
    process.env.BOARDS_SERVER = 'http://env.example.com';
    try {
      const config = resolveConfig({});
      expect(config.server).toBe('http://env.example.com');
    } finally {
      if (originalEnv !== undefined) {
        process.env.BOARDS_SERVER = originalEnv;
      } else {
        delete process.env.BOARDS_SERVER;
      }
    }
  });

  it('server is undefined when nothing configured', () => {
    const originalEnv = process.env.BOARDS_SERVER;
    delete process.env.BOARDS_SERVER;
    try {
      const config = resolveConfig({});
      expect(config.server).toBeUndefined();
    } finally {
      if (originalEnv !== undefined) {
        process.env.BOARDS_SERVER = originalEnv;
      }
    }
  });
});

// ─── CLI Flag Tests ──────────────────────────────────────────────────────────

describe('CLI --server and --db flags', () => {
  let home: string;
  let cwd: string;

  beforeEach(() => {
    home = makeTmpDir();
    cwd = makeTmpDir();
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  const env = () => ({ HOME: home });

  it('--server flag reaches remote store (connection refused)', async () => {
    const result = await run(
      ['--server', 'http://localhost:59999', 'list', '--board', 'test'],
      { env: env(), cwd },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Connection failed');
  });

  it('BOARDS_SERVER env var reaches remote store', async () => {
    const result = await run(
      ['list', '--board', 'test'],
      { env: { ...env(), BOARDS_SERVER: 'http://localhost:59999' }, cwd },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Connection failed');
  });

});

// ─── Local-Only Command Guards ───────────────────────────────────────────────

describe('local-only command guards', () => {
  let home: string;
  let cwd: string;

  beforeEach(() => {
    home = makeTmpDir();
    cwd = makeTmpDir();
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  const env = () => ({ HOME: home });

  it('init errors in remote mode via --server', async () => {
    const result = await run(
      ['--server', 'http://localhost:3000', 'init'],
      { env: env(), cwd },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('init is not available in remote mode');
  });

  it('init errors in remote mode via BOARDS_SERVER', async () => {
    const result = await run(
      ['init'],
      { env: { ...env(), BOARDS_SERVER: 'http://localhost:3000' }, cwd },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('init is not available in remote mode');
  });

  it('config works in remote mode (manages local config)', async () => {
    const result = await run(
      ['--server', 'http://localhost:3000', 'config', 'list'],
      { env: env(), cwd },
    );
    expect(result.exitCode).toBe(0);
  });
});

// ─── Regression: Local Mode Still Works ──────────────────────────────────────

describe('local mode regression', () => {
  let home: string;
  let cwd: string;

  beforeEach(async () => {
    home = makeTmpDir();
    cwd = makeTmpDir();
    await run(['init'], { env: { HOME: home }, cwd });
    await run(['board', 'create', 'regtest'], { env: { HOME: home }, cwd });
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  const env = () => ({ HOME: home });

  it('create + list + show + close full cycle', async () => {
    const createResult = await run(
      ['create', 'Regression Test', '--board', 'regtest', '--json'],
      { env: env(), cwd },
    );
    expect(createResult.exitCode).toBe(0);
    const issue = JSON.parse(createResult.stdout);

    const listResult = await run(
      ['list', '--board', 'regtest'],
      { env: env(), cwd },
    );
    expect(listResult.exitCode).toBe(0);
    expect(listResult.stdout).toContain('Regression Test');

    const showResult = await run(
      ['show', issue.id],
      { env: env(), cwd },
    );
    expect(showResult.exitCode).toBe(0);
    expect(showResult.stdout).toContain(issue.id);

    const closeResult = await run(
      ['close', issue.id],
      { env: env(), cwd },
    );
    expect(closeResult.exitCode).toBe(0);
    expect(closeResult.stdout).toContain('Closed');
  });

  it('version works in local mode', async () => {
    const result = await run(['version'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Boards v');
    expect(result.stdout).toContain('schema v');
  });
});
