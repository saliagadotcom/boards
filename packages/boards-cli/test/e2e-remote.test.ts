import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { Database as BunDatabase } from 'bun:sqlite';
import { Kysely } from 'kysely';
import type { Database } from '@saliagadotcom/boards-core';
import { createStore, migrate } from '@saliagadotcom/boards-core';
import { createApp } from '@saliagadotcom/boards-server';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BunSqliteDialect } from '../../boards-core/test/helpers.js';

// --- Test infra ---

const CLI = join(import.meta.dir, '..', 'bin', 'bd.ts');

let kyselyDb: Kysely<Database>;
let server: ReturnType<typeof Bun.serve>;
let serverUrl: string;
let home: string;
let cwd: string;

beforeAll(async () => {
  const raw = new BunDatabase(':memory:');
  raw.run('PRAGMA foreign_keys = ON');
  kyselyDb = new Kysely<Database>({ dialect: new BunSqliteDialect(raw) });
  await migrate(kyselyDb);
  const store = createStore(kyselyDb);
  const app = createApp(store);
  server = Bun.serve({ port: 0, fetch: app.fetch });
  serverUrl = `http://localhost:${server.port}`;

  home = mkdtempSync(join(tmpdir(), 'boards-e2e-remote-'));
  cwd = mkdtempSync(join(tmpdir(), 'boards-e2e-remote-cwd-'));
});

afterAll(async () => {
  server.stop(true);
  await kyselyDb.destroy();
  rmSync(home, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

async function run(
  args: string[],
  opts: { env?: Record<string, string> } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(['bun', 'run', CLI, '--server', serverUrl, ...args], {
    env: { ...process.env, HOME: home, ...opts.env },
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

// ─── End-to-End CLI-over-HTTP Tests ──────────────────────────────────────────

describe('CLI over remote server', () => {
  // --- Boards ---

  it('board create + list', async () => {
    const create = await run(['board', 'create', 'e2etest']);
    expect(create.exitCode).toBe(0);
    expect(create.stdout).toContain('Board "e2etest" created');

    const list = await run(['board', 'list']);
    expect(list.exitCode).toBe(0);
    expect(list.stdout).toContain('e2etest');
  });

  // --- Issues: full lifecycle ---

  let issueId: string;

  it('create an issue', async () => {
    const result = await run(['create', 'Remote Task', '--board', 'e2etest', '--json']);
    expect(result.exitCode).toBe(0);
    const issue = JSON.parse(result.stdout);
    expect(issue.title).toBe('Remote Task');
    expect(issue.board).toBe('e2etest');
    expect(issue.status).toBe('open');
    issueId = issue.id;
  });

  it('list issues', async () => {
    const result = await run(['list', '--board', 'e2etest']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Remote Task');
  });

  it('show issue', async () => {
    const result = await run(['show', issueId]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(issueId);
    expect(result.stdout).toContain('Remote Task');
  });

  it('update issue', async () => {
    const result = await run(['update', issueId, '--title', 'Updated Remote Task', '--json']);
    expect(result.exitCode).toBe(0);
    const issue = JSON.parse(result.stdout);
    expect(issue.title).toBe('Updated Remote Task');
  });

  it('close issue', async () => {
    const result = await run(['close', issueId]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Closed');
  });

  it('reopen issue', async () => {
    const result = await run(['reopen', issueId, '--json']);
    expect(result.exitCode).toBe(0);
    const issue = JSON.parse(result.stdout);
    expect(issue.status).toBe('open');
  });

  // --- Comments ---

  let commentId: number;

  it('comment add', async () => {
    const result = await run(['comment', 'add', issueId, 'Hello from remote', '--author', 'agent', '--json']);
    expect(result.exitCode).toBe(0);
    const comment = JSON.parse(result.stdout);
    expect(comment.author).toBe('agent');
    expect(comment.text).toBe('Hello from remote');
    commentId = comment.id;
  });

  it('comment list', async () => {
    const result = await run(['comment', 'list', issueId]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Hello from remote');
    expect(result.stdout).toContain('@agent');
  });

  it('comment delete', async () => {
    const result = await run(['comment', 'delete', String(commentId)]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('deleted');
  });

  // --- Labels ---

  it('label add + show', async () => {
    const add = await run(['label', 'add', issueId, 'critical']);
    expect(add.exitCode).toBe(0);

    const show = await run(['show', issueId, '--json']);
    expect(show.exitCode).toBe(0);
    const detail = JSON.parse(show.stdout);
    expect(detail.issue.labels).toContain('critical');
  });

  it('label remove', async () => {
    const result = await run(['label', 'remove', issueId, 'critical']);
    expect(result.exitCode).toBe(0);

    const show = await run(['show', issueId, '--json']);
    const detail = JSON.parse(show.stdout);
    expect(detail.issue.labels).not.toContain('critical');
  });

  // --- Dependencies ---

  let depIssueId: string;

  it('dep add + list', async () => {
    const r = await run(['create', 'Blocker Task', '--board', 'e2etest', '--json']);
    depIssueId = JSON.parse(r.stdout).id;

    const add = await run(['dep', 'add', issueId, depIssueId]);
    expect(add.exitCode).toBe(0);

    const list = await run(['dep', 'list', issueId]);
    expect(list.exitCode).toBe(0);
    expect(list.stdout).toContain(depIssueId);
  });

  it('dep remove', async () => {
    const result = await run(['dep', 'remove', issueId, depIssueId]);
    expect(result.exitCode).toBe(0);
  });

  // --- Ready + Claim ---

  it('ready lists unblocked issues', async () => {
    const result = await run(['ready', '--board', 'e2etest']);
    expect(result.exitCode).toBe(0);
    // At least one of our issues should be ready
    expect(result.stdout).toContain('e2etest-');
  });

  it('claim issue', async () => {
    const result = await run(['claim', depIssueId, '--assignee', 'bot', '--json']);
    expect(result.exitCode).toBe(0);
    const issue = JSON.parse(result.stdout);
    expect(issue.assignee).toBe('bot');
    expect(issue.status).toBe('in_progress');
  });

  // --- Search ---

  it('search issues', async () => {
    const result = await run(['search', 'Updated Remote', '--board', 'e2etest']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Updated Remote Task');
  });

  // --- Epic status ---

  it('epic status', async () => {
    const result = await run(['epic', 'status', '--board', 'e2etest']);
    expect(result.exitCode).toBe(0);
    // No epics yet, should not error
  });

  // --- Version ---

  it('version shows server metadata', async () => {
    const result = await run(['version']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Boards v');
    expect(result.stdout).toContain('schema v');
  });

  it('version --json returns metadata', async () => {
    const result = await run(['version', '--json']);
    expect(result.exitCode).toBe(0);
    const meta = JSON.parse(result.stdout);
    expect(typeof meta.version).toBe('string');
    expect(typeof meta.schema_version).toBe('number');
  });

  // --- Delete ---

  it('delete issue', async () => {
    const r = await run(['create', 'To Delete', '--board', 'e2etest', '--json']);
    const id = JSON.parse(r.stdout).id;

    const del = await run(['delete', id, '--force']);
    expect(del.exitCode).toBe(0);
    expect(del.stdout).toContain('Deleted');

    const show = await run(['show', id]);
    expect(show.exitCode).toBe(1);
  });

  // --- Error handling over HTTP ---

  it('show nonexistent issue returns error', async () => {
    const result = await run(['show', 'fake-999999']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('not found');
  });

  // --- Local-only guards in remote mode ---

  it('init errors in remote mode', async () => {
    const result = await run(['init']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('init is not available in remote mode');
  });

  it('config works in remote mode', async () => {
    const result = await run(['config', 'list']);
    expect(result.exitCode).toBe(0);
  });

  // --- Board delete ---

  it('board delete', async () => {
    await run(['board', 'create', 'todelete']);
    const result = await run(['board', 'delete', 'todelete', '--force']);
    expect(result.exitCode).toBe(0);
  });
});
