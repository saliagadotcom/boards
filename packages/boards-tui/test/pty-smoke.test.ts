/**
 * End-to-end PTY smoke tests for `bd tui`.
 *
 * Spawns the TUI in a real pseudo-terminal via a Python pty helper,
 * verifying that Ink renders correctly and signal handling works.
 *
 * NOTE: Keystroke tests (q to quit) are intentionally omitted.
 * Bun + Ink has a known dual-package issue where stdin written to
 * the PTY master does not reach Ink's useInput callbacks. Interactive
 * keyboard logic is tested via pure-function unit tests instead.
 */

import { describe, expect, it, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WORKSPACE_ROOT = join(import.meta.dir, '..', '..', '..');
const CLI = join(WORKSPACE_ROOT, 'packages', 'boards-cli', 'bin', 'bd.ts');
const PTY_HARNESS = join(import.meta.dir, 'pty-harness.py');

interface PtyResult {
  pid: number;
  output_bytes: number;
  has_content: boolean;
  clean_text: string;
  action: string;
  exit_code?: number | null;
  error?: string;
}

async function runPty(
  action: 'render' | 'sigint',
  args: string[],
  env: Record<string, string>,
  timeoutS = 8,
): Promise<PtyResult> {
  const proc = Bun.spawn(
    ['uv', 'run', '--script', PTY_HARNESS, action, String(timeoutS), 'bun', 'run', CLI, ...args],
    {
      cwd: WORKSPACE_ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, ...env },
    },
  );

  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new Error(`PTY harness exited with code ${exitCode}: ${stderr}`);
  }

  return JSON.parse(stdout.trim()) as PtyResult;
}

describe('bd tui PTY smoke tests', () => {
  let tmpDir: string;
  let testEnv: Record<string, string>;

  beforeAll(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'boards-pty-'));
    testEnv = { BOARDS_HOME: tmpDir };

    // Initialize DB and create a board with an issue
    const init = Bun.spawn(['bun', 'run', CLI, 'init'], {
      cwd: WORKSPACE_ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, ...testEnv },
    });
    await init.exited;

    const board = Bun.spawn(['bun', 'run', CLI, 'board', 'create', 'smoketest'], {
      cwd: WORKSPACE_ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, ...testEnv },
    });
    await board.exited;

    const issue = Bun.spawn(
      ['bun', 'run', CLI, 'create', 'Smoke test issue', '--board', 'smoketest'],
      {
        cwd: WORKSPACE_ROOT,
        stdout: 'pipe',
        stderr: 'pipe',
        env: { ...process.env, ...testEnv },
      },
    );
    await issue.exited;
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // Ink sometimes fails to flush its first render frame in CI PTY environments,
  // producing only alternate-screen + hide-cursor escapes with no visible content.
  // See: https://github.com/saliagadotcom/boards/actions/runs/23547036091
  it.skipIf(!!process.env.CI)('renders board content in a real PTY', async () => {
    const result = await runPty('render', ['tui', '--board', 'smoketest'], testEnv, 15);

    expect(result.output_bytes).toBeGreaterThan(0);
    expect(result.has_content).toBe(true);
    expect(result.clean_text).toContain('Open (1)');
    expect(result.clean_text).toContain('Smoke test issue');
    expect(result.clean_text).toContain('[q] quit');
  }, 30_000);

  it('exits with code 130 on SIGINT (ctrl+c)', async () => {
    const result = await runPty('sigint', ['tui', '--board', 'smoketest'], testEnv);

    expect(result.exit_code).toBe(130);
    expect(result.error).toBeUndefined();
  }, 20_000);

  it('rejects non-TTY invocation', async () => {
    // Spawn without PTY (piped stdout) to verify TTY check
    const proc = Bun.spawn(['bun', 'run', CLI, 'tui', '--board', 'smoketest'], {
      cwd: WORKSPACE_ROOT,
      stdout: 'pipe',
      stderr: 'pipe',
      env: { ...process.env, ...testEnv },
    });

    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(1);
    expect(stderr).toContain('bd tui requires an interactive terminal (TTY)');
  });

  it('rejects nonexistent board', async () => {
    const result = await runPty('render', ['tui', '--board', 'does-not-exist'], testEnv);

    // The error message goes to stderr which is captured via PTY
    expect(result.clean_text).toContain('not found');
  }, 20_000);
});
