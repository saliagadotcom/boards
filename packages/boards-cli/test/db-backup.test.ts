import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  existsSync,
  statSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(import.meta.dir, '..', 'bin', 'bd.ts');

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'boards-db-backup-'));
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

describe('db backup', () => {
  let home: string;
  let cwd: string;
  let boardsDir: string;

  const env = () => ({ BOARDS_HOME: boardsDir });

  beforeEach(() => {
    home = makeTmpDir();
    cwd = makeTmpDir();
    boardsDir = join(home, '.boards');
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  it('creates store.db.bak after a command opens the store', async () => {
    await run(['init'], { env: env(), cwd });
    // init bypasses resolveStore; run a store-opening command
    await run(['board', 'list'], { env: env(), cwd });

    const dbPath = join(boardsDir, 'store.db');
    const bakPath = dbPath + '.bak';

    expect(existsSync(dbPath)).toBe(true);
    expect(existsSync(bakPath)).toBe(true);
    expect(statSync(bakPath).size).toBeGreaterThan(0);
  });

  it('backup updates on subsequent commands', async () => {
    await run(['init'], { env: env(), cwd });
    await run(['board', 'create', 'test-board'], { env: env(), cwd });

    const dbPath = join(boardsDir, 'store.db');
    const bakPath = dbPath + '.bak';

    // After creating a board the backup should reflect the latest state
    const bakSize = statSync(bakPath).size;
    expect(bakSize).toBeGreaterThan(0);

    // Create another board and verify backup is refreshed
    await run(['board', 'create', 'another-board'], { env: env(), cwd });
    const newBakSize = statSync(bakPath).size;
    expect(newBakSize).toBeGreaterThanOrEqual(bakSize);
  });

  it('no backup created for remote stores', async () => {
    // With --server set, resolveStore uses remote mode — no local db involved
    mkdirSync(boardsDir, { recursive: true });
    const result = await run(['list', '--server', 'http://localhost:99999'], {
      env: env(),
      cwd,
    });
    // The command will fail (no server), but no .bak should exist
    const bakPath = join(boardsDir, 'store.db.bak');
    expect(existsSync(bakPath)).toBe(false);
  });
});

describe('bd db restore', () => {
  let home: string;
  let cwd: string;
  let boardsDir: string;

  const env = () => ({ BOARDS_HOME: boardsDir });

  beforeEach(() => {
    home = makeTmpDir();
    cwd = makeTmpDir();
    boardsDir = join(home, '.boards');
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  it('restores db from backup after deletion', async () => {
    // Init and create a board so db has real data
    await run(['init'], { env: env(), cwd });
    await run(['board', 'create', 'my-board'], { env: env(), cwd });

    const dbPath = join(boardsDir, 'store.db');
    const bakPath = dbPath + '.bak';

    expect(existsSync(bakPath)).toBe(true);
    const bakContents = readFileSync(bakPath);

    // Simulate agent deleting the db
    rmSync(dbPath, { force: true });
    expect(existsSync(dbPath)).toBe(false);

    // Restore
    const result = await run(['db', 'restore'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Restored database from');

    // Verify the db is back
    expect(existsSync(dbPath)).toBe(true);
    expect(statSync(dbPath).size).toBeGreaterThan(0);
  });

  it('restores db from backup when db is empty (0 bytes)', async () => {
    await run(['init'], { env: env(), cwd });
    await run(['board', 'list'], { env: env(), cwd });

    const dbPath = join(boardsDir, 'store.db');
    const bakPath = dbPath + '.bak';

    expect(existsSync(bakPath)).toBe(true);

    // Simulate agent truncating the db
    writeFileSync(dbPath, '');
    expect(statSync(dbPath).size).toBe(0);

    const result = await run(['db', 'restore'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Restored database from');
    expect(statSync(dbPath).size).toBeGreaterThan(0);
  });

  it('fails when no backup exists', async () => {
    mkdirSync(boardsDir, { recursive: true });
    const result = await run(['db', 'restore'], { env: env(), cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No backup found');
  });
});
