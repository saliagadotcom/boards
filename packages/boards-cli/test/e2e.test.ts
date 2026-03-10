import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CLI = join(import.meta.dir, '..', 'bin', 'bd.ts');

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'boards-e2e-'));
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

// ─── Init Tests ──────────────────────────────────────────────────────────────

describe('boards init', () => {
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

  const env = () => ({ BOARDS_HOME: join(home, '.boards') });

  it('creates ~/.boards/ with store.db and config.toml', async () => {
    const result = await run(['init'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Initialized boards');
    expect(existsSync(join(home, '.boards', 'store.db'))).toBe(true);
    expect(existsSync(join(home, '.boards', 'config.toml'))).toBe(true);
  });

  it('is idempotent (second run prints "Already initialized")', async () => {
    await run(['init'], { env: env(), cwd });
    const result = await run(['init'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Already initialized');
  });

  it('creates a board and sets as default', async () => {
    await run(['init'], { env: env(), cwd });
    const result = await run(['board', 'create', 'myboard'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Board "myboard" created');
    expect(result.stdout).toContain('Set as default board');
  });

  it('returns JSON output with --json', async () => {
    await run(['init'], { env: env(), cwd });
    const result = await run(['board', 'create', 'myboard', '--json'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.id).toBe('myboard');
    expect(data.prefix).toBeDefined();
  });

  it('--json output for bare init', async () => {
    const result = await run(['init', '--json'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.status).toBe('initialized');
    expect(data.path).toContain('.boards');
  });

  it('--json output for already initialized', async () => {
    await run(['init'], { env: env(), cwd });
    const result = await run(['init', '--json'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.status).toBe('already_initialized');
  });
});

// ─── Use Tests ───────────────────────────────────────────────────────────────

describe('boards use', () => {
  let home: string;
  let cwd: string;

  beforeEach(async () => {
    home = makeTmpDir();
    cwd = makeTmpDir();
    // Initialize and create a board
    const e = { BOARDS_HOME: join(home, '.boards') };
    await run(['init'], { env: e, cwd });
    await run(['board', 'create', 'testboard'], { env: e, cwd });
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  const env = () => ({ BOARDS_HOME: join(home, '.boards') });

  it('shows current board when no args', async () => {
    const result = await run(['board', 'use'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Current board: testboard');
  });

  it('sets global default with --global', async () => {
    const result = await run(['board', 'use', 'testboard', '--global'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Default board set to "testboard"');
    expect(result.stdout).toContain('global');
  });

  it('sets repo-level default', async () => {
    const result = await run(['board', 'use', 'testboard'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Default board set to "testboard"');
    expect(result.stdout).toContain('repo');
    expect(existsSync(join(cwd, '.boards', 'config.toml'))).toBe(true);
  });

  it('errors on nonexistent board', async () => {
    const result = await run(['board', 'use', 'nonexistent'], { env: env(), cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Board not found');
  });

  it('--clear removes repo-level default', async () => {
    await run(['board', 'use', 'testboard'], { env: env(), cwd });
    const result = await run(['board', 'use', '--clear'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Repo default cleared');
  });
});

// ─── Issue Command Tests ─────────────────────────────────────────────────────

describe('issue commands', () => {
  let home: string;
  let cwd: string;

  beforeEach(async () => {
    home = makeTmpDir();
    cwd = makeTmpDir();
    await run(['init'], { env: { BOARDS_HOME: join(home, '.boards') }, cwd });
    await run(['board', 'create', 'testboard'], { env: { BOARDS_HOME: join(home, '.boards') }, cwd });
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  const env = () => ({ BOARDS_HOME: join(home, '.boards') });

  it('creates an issue with default board', async () => {
    const result = await run(['create', 'My Task', '--board', 'testboard'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Created');
    expect(result.stdout).toContain('My Task');
  });

  it('creates an issue with explicit --board', async () => {
    const result = await run(['create', 'Task Two', '--board', 'testboard'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Created');
    expect(result.stdout).toContain('Task Two');
  });

  it('show prints issue detail', async () => {
    const createResult = await run(['create', 'Show Test', '--board', 'testboard', '--json'], { env: env(), cwd });
    const issue = JSON.parse(createResult.stdout);

    const result = await run(['show', issue.id], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(issue.id);
    expect(result.stdout).toContain('Show Test');
    expect(result.stdout).toContain('Status: open');
  });

  it('list issues for a board', async () => {
    await run(['create', 'List Item', '--board', 'testboard'], { env: env(), cwd });
    const result = await run(['list', '--board', 'testboard'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('List Item');
  });

  it('update changes issue title', async () => {
    const createResult = await run(['create', 'Old Title', '--board', 'testboard', '--json'], { env: env(), cwd });
    const issue = JSON.parse(createResult.stdout);

    const result = await run(['update', issue.id, '--title', 'New Title'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Updated');
    expect(result.stdout).toContain('New Title');
  });

  it('close closes an issue', async () => {
    const createResult = await run(['create', 'To Close', '--board', 'testboard', '--json'], { env: env(), cwd });
    const issue = JSON.parse(createResult.stdout);

    const result = await run(['close', issue.id], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Closed');
    expect(result.stdout).toContain(issue.id);
  });

  it('delete with --force deletes', async () => {
    const createResult = await run(['create', 'To Delete', '--board', 'testboard', '--json'], { env: env(), cwd });
    const issue = JSON.parse(createResult.stdout);

    const result = await run(['delete', issue.id, '--force'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Deleted');
    expect(result.stdout).toContain(issue.id);

    // Verify it's gone
    const showResult = await run(['show', issue.id], { env: env(), cwd });
    expect(showResult.exitCode).toBe(1);
  });
});

// ─── Dependency Tests ────────────────────────────────────────────────────────

describe('dependency commands', () => {
  let home: string;
  let cwd: string;
  let issueId1: string;
  let issueId2: string;

  beforeEach(async () => {
    home = makeTmpDir();
    cwd = makeTmpDir();
    await run(['init'], { env: { BOARDS_HOME: join(home, '.boards') }, cwd });
    await run(['board', 'create', 'depboard'], { env: { BOARDS_HOME: join(home, '.boards') }, cwd });

    const r1 = await run(['create', 'Dep Parent', '--board', 'depboard', '--json'], { env: { BOARDS_HOME: join(home, '.boards') }, cwd });
    issueId1 = JSON.parse(r1.stdout).id;

    const r2 = await run(['create', 'Dep Child', '--board', 'depboard', '--json'], { env: { BOARDS_HOME: join(home, '.boards') }, cwd });
    issueId2 = JSON.parse(r2.stdout).id;
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  const env = () => ({ BOARDS_HOME: join(home, '.boards') });

  it('adds a dependency', async () => {
    const result = await run(['dep', 'add', issueId1, issueId2], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Dependency added');
    expect(result.stdout).toContain(issueId1);
    expect(result.stdout).toContain(issueId2);
  });

  it('lists dependencies', async () => {
    await run(['dep', 'add', issueId1, issueId2], { env: env(), cwd });
    const result = await run(['dep', 'list', issueId1], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(issueId2);
  });

  it('removes a dependency', async () => {
    await run(['dep', 'add', issueId1, issueId2], { env: env(), cwd });
    const result = await run(['dep', 'remove', issueId1, issueId2], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Dependency removed');

    // Verify it's gone
    const listResult = await run(['dep', 'list', issueId1], { env: env(), cwd });
    expect(listResult.stdout).toContain('No dependencies found');
  });
});

// ─── Label Tests ─────────────────────────────────────────────────────────────

describe('label commands', () => {
  let home: string;
  let cwd: string;
  let issueId: string;

  beforeEach(async () => {
    home = makeTmpDir();
    cwd = makeTmpDir();
    await run(['init'], { env: { BOARDS_HOME: join(home, '.boards') }, cwd });
    await run(['board', 'create', 'labelboard'], { env: { BOARDS_HOME: join(home, '.boards') }, cwd });

    const r = await run(['create', 'Label Test', '--board', 'labelboard', '--json'], { env: { BOARDS_HOME: join(home, '.boards') }, cwd });
    issueId = JSON.parse(r.stdout).id;
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  const env = () => ({ BOARDS_HOME: join(home, '.boards') });

  it('adds a label', async () => {
    const result = await run(['label', 'add', issueId, 'urgent'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Label "urgent" added');
  });

  it('removes a label', async () => {
    await run(['label', 'add', issueId, 'urgent'], { env: env(), cwd });
    const result = await run(['label', 'remove', issueId, 'urgent'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Label "urgent" removed');
  });

  it('label shows in issue detail', async () => {
    await run(['label', 'add', issueId, 'urgent'], { env: env(), cwd });
    const result = await run(['show', issueId], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('urgent');
  });
});

// ─── Ready / Claim / Search Tests ────────────────────────────────────────────

describe('ready, claim, search', () => {
  let home: string;
  let cwd: string;
  let issueId: string;

  beforeEach(async () => {
    home = makeTmpDir();
    cwd = makeTmpDir();
    await run(['init'], { env: { BOARDS_HOME: join(home, '.boards') }, cwd });
    await run(['board', 'create', 'workboard'], { env: { BOARDS_HOME: join(home, '.boards') }, cwd });

    const r = await run(['create', 'Ready Task', '--board', 'workboard', '--json'], { env: { BOARDS_HOME: join(home, '.boards') }, cwd });
    issueId = JSON.parse(r.stdout).id;
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  const env = () => ({ BOARDS_HOME: join(home, '.boards') });

  it('ready shows issues with no blockers', async () => {
    const result = await run(['ready', '--board', 'workboard'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Ready Task');
  });

  it('claim assigns an issue', async () => {
    const result = await run(['claim', issueId, '--assignee', 'agent1'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(issueId);
    expect(result.stdout).toContain('agent1');
  });

  it('search finds issues by text', async () => {
    const result = await run(['search', 'Ready', '--board', 'workboard'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Ready Task');
  });

  it('search returns no results for unmatched query', async () => {
    const result = await run(['search', 'zzzznonexistent', '--board', 'workboard'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('No issues found');
  });
});

// ─── --json Flag Tests ──────────────────────────────────────────────────────

describe('--json output', () => {
  let home: string;
  let cwd: string;
  let issueId: string;

  beforeEach(async () => {
    home = makeTmpDir();
    cwd = makeTmpDir();
    await run(['init'], { env: { BOARDS_HOME: join(home, '.boards') }, cwd });
    await run(['board', 'create', 'jsonboard'], { env: { BOARDS_HOME: join(home, '.boards') }, cwd });

    const r = await run(['create', 'JSON Test', '--board', 'jsonboard', '--json'], { env: { BOARDS_HOME: join(home, '.boards') }, cwd });
    const data = JSON.parse(r.stdout);
    issueId = data.id;
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  const env = () => ({ BOARDS_HOME: join(home, '.boards') });

  it('create --json returns valid JSON with id', async () => {
    const result = await run(['create', 'Another', '--board', 'jsonboard', '--json'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.id).toBeDefined();
    expect(data.title).toBe('Another');
    expect(data.board).toBe('jsonboard');
  });

  it('show --json returns valid JSON', async () => {
    const result = await run(['show', issueId, '--json'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.issue).toBeDefined();
    expect(data.issue.id).toBe(issueId);
    expect(data.dependencies).toBeDefined();
  });

  it('list --json returns array', async () => {
    const result = await run(['list', '--board', 'jsonboard', '--json'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(1);
  });

  it('close --json returns closed issue', async () => {
    const result = await run(['close', issueId, '--json'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.id).toBe(issueId);
    expect(data.status).toBe('closed');
  });

  it('ready --json returns array', async () => {
    const result = await run(['ready', '--board', 'jsonboard', '--json'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(Array.isArray(data)).toBe(true);
  });

  it('claim --json returns claimed issue', async () => {
    const r = await run(['create', 'Claim JSON', '--board', 'jsonboard', '--json'], { env: env(), cwd });
    const newId = JSON.parse(r.stdout).id;

    const result = await run(['claim', newId, '--assignee', 'bot', '--json'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.id).toBe(newId);
    expect(data.assignee).toBe('bot');
  });

  it('search --json returns array', async () => {
    const result = await run(['search', 'JSON', '--board', 'jsonboard', '--json'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(Array.isArray(data)).toBe(true);
  });

  it('dep add --json returns status', async () => {
    const r2 = await run(['create', 'Dep Target', '--board', 'jsonboard', '--json'], { env: env(), cwd });
    const id2 = JSON.parse(r2.stdout).id;

    const result = await run(['dep', 'add', issueId, id2, '--json'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.status).toBe('added');
  });

  it('dep list --json returns array', async () => {
    const result = await run(['dep', 'list', issueId, '--json'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(Array.isArray(data)).toBe(true);
  });

  it('label add --json returns status', async () => {
    const result = await run(['label', 'add', issueId, 'bug', '--json'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.status).toBe('added');
    expect(data.label).toBe('bug');
  });

  it('delete --json returns status', async () => {
    const r = await run(['create', 'Del JSON', '--board', 'jsonboard', '--json'], { env: env(), cwd });
    const delId = JSON.parse(r.stdout).id;

    const result = await run(['delete', delId, '--force', '--json'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.status).toBe('deleted');
    expect(data.id).toBe(delId);
  });

  it('update --json returns updated issue', async () => {
    const result = await run(['update', issueId, '--title', 'Updated', '--json'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.id).toBe(issueId);
    expect(data.title).toBe('Updated');
  });
});

// ─── Error Handling Tests ────────────────────────────────────────────────────

describe('error handling', () => {
  let home: string;
  let cwd: string;

  beforeEach(async () => {
    home = makeTmpDir();
    cwd = makeTmpDir();
    await run(['init'], { env: { BOARDS_HOME: join(home, '.boards') }, cwd });
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  const env = () => ({ BOARDS_HOME: join(home, '.boards') });

  it('create without board gives helpful error', async () => {
    const result = await run(['create', 'No Board'], { env: env(), cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No board specified');
  });

  it('show nonexistent issue exits with code 1', async () => {
    const result = await run(['show', 'fake-999'], { env: env(), cwd });
    expect(result.exitCode).toBe(1);
  });

  it('ready without board gives error', async () => {
    const result = await run(['ready'], { env: env(), cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No board specified');
  });

  it('search without board gives error', async () => {
    const result = await run(['search', 'query'], { env: env(), cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No board specified');
  });

  it('--json error output is valid JSON with error object', async () => {
    const result = await run(['create', 'No Board', '--json'], { env: env(), cwd });
    expect(result.exitCode).toBe(1);
    const data = JSON.parse(result.stdout);
    expect(data.error).toBeDefined();
    expect(data.error.code).toBeDefined();
    expect(data.error.message).toBeDefined();
  });

  it('--json error for show nonexistent issue', async () => {
    const result = await run(['show', 'fake-999', '--json'], { env: env(), cwd });
    expect(result.exitCode).toBe(1);
    const data = JSON.parse(result.stdout);
    expect(data.error).toBeDefined();
    expect(data.error.code).toBeDefined();
  });

  it('--json error for ready without board', async () => {
    const result = await run(['ready', '--json'], { env: env(), cwd });
    expect(result.exitCode).toBe(1);
    const data = JSON.parse(result.stdout);
    expect(data.error).toBeDefined();
    expect(data.error.code).toBe('invalid_request');
  });
});

// ─── Status Tests ────────────────────────────────────────────────────────────

describe('boards status', () => {
  let home: string;
  let cwd: string;

  beforeEach(async () => {
    home = makeTmpDir();
    cwd = makeTmpDir();
    await run(['init'], { env: { BOARDS_HOME: join(home, '.boards') }, cwd });
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  });

  const env = () => ({ BOARDS_HOME: join(home, '.boards') });

  it('errors when no board configured', async () => {
    const result = await run(['status'], { env: env(), cwd });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('No board configured');
    expect(result.stderr).toContain('bd board use');
  });

  it('shows board with all counts zero when empty', async () => {
    await run(['board', 'create', 'myproject'], { env: env(), cwd });
    await run(['board', 'use', 'myproject'], { env: env(), cwd });
    const result = await run(['status'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('myproject');
    expect(result.stdout).toContain('0 open');
    expect(result.stdout).toContain('0 in progress');
    expect(result.stdout).toContain('0 closed');
    expect(result.stdout).toContain('Ready to work: 0 issues');
  });

  it('shows correct counts with mixed issues', async () => {
    await run(['board', 'create', 'myproject'], { env: env(), cwd });
    await run(['board', 'use', 'myproject'], { env: env(), cwd });
    await run(['create', 'Task one'], { env: env(), cwd });
    const r2 = await run(['create', 'Task two'], { env: env(), cwd });
    const id2 = r2.stdout.match(/([a-z0-9-]+):/)?.[1];
    await run(['create', 'Task three'], { env: env(), cwd });
    const r4 = await run(['create', 'Task four'], { env: env(), cwd });
    const id4 = r4.stdout.match(/([a-z0-9-]+):/)?.[1];
    // Move one to in_progress, close another
    if (id2) await run(['update', id2, '--status', 'in_progress'], { env: env(), cwd });
    if (id4) await run(['close', id4!], { env: env(), cwd });

    const result = await run(['status'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('2 open');
    expect(result.stdout).toContain('1 in progress');
    expect(result.stdout).toContain('1 closed');
  });

  it('shows ready count differing from open count when blockers exist', async () => {
    await run(['board', 'create', 'myproject'], { env: env(), cwd });
    await run(['board', 'use', 'myproject'], { env: env(), cwd });
    const r1 = await run(['create', 'Blocked task'], { env: env(), cwd });
    const id1 = r1.stdout.match(/([a-z0-9-]+):/)?.[1];
    const r2 = await run(['create', 'Blocker task'], { env: env(), cwd });
    const id2 = r2.stdout.match(/([a-z0-9-]+):/)?.[1];
    // id2 blocks id1
    if (id1 && id2) await run(['dep', 'add', id1, id2], { env: env(), cwd });

    const result = await run(['status'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('2 open');
    expect(result.stdout).toContain('Ready to work: 1 issue');
  });

  it('shows database path', async () => {
    await run(['board', 'create', 'myproject'], { env: env(), cwd });
    await run(['board', 'use', 'myproject'], { env: env(), cwd });
    const result = await run(['status'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Database:');
    expect(result.stdout).toContain('store.db');
  });

  it('--json returns valid structure', async () => {
    await run(['board', 'create', 'myproject'], { env: env(), cwd });
    await run(['board', 'use', 'myproject'], { env: env(), cwd });
    await run(['create', 'A task'], { env: env(), cwd });

    const result = await run(['status', '--json'], { env: env(), cwd });
    expect(result.exitCode).toBe(0);
    const data = JSON.parse(result.stdout);
    expect(data.board).toBe('myproject');
    expect(data.database).toContain('store.db');
    expect(data.source).toBeDefined();
    expect(data.source_type).toBeDefined();
    expect(data.counts.open).toBe(1);
    expect(data.counts.in_progress).toBe(0);
    expect(data.counts.closed).toBe(0);
    expect(data.ready).toBe(1);
  });

  it('--json error when no board configured', async () => {
    const result = await run(['status', '--json'], { env: env(), cwd });
    expect(result.exitCode).toBe(1);
    const data = JSON.parse(result.stdout);
    expect(data.error).toBeDefined();
    expect(data.error.code).toBe('invalid_request');
  });
});
