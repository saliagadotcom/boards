/**
 * Server API Validation & Contract Tests
 *
 * Tests the HTTP contract layer that api.test.ts doesn't cover:
 *   - Request validation (missing fields, wrong types, bad content types)
 *   - HTTP method enforcement
 *   - ErrorCode → HTTP status mapping through the full middleware stack
 *   - Response shape conformance
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { Database as BunDatabase } from 'bun:sqlite';
import { Kysely } from 'kysely';
import type { Database } from '@saliagadotcom/boards-core';
import { createStore, migrate } from '@saliagadotcom/boards-core';
import { createApp } from '../src/app.js';
import type { Hono } from 'hono';
import { BunSqliteDialect } from '../../boards-core/test/helpers.js';

// --- Test helpers ---

let kyselyDb: Kysely<Database>;
let app: Hono;

function req(path: string, init?: RequestInit) {
  return app.request(`/api/v1${path}`, init);
}

function json(path: string, body: unknown, method = 'POST') {
  return req(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(async () => {
  const raw = new BunDatabase(':memory:');
  raw.run('PRAGMA foreign_keys = ON');
  kyselyDb = new Kysely<Database>({ dialect: new BunSqliteDialect(raw) });
  await migrate(kyselyDb);
  const store = createStore(kyselyDb);
  app = createApp(store);
});

afterEach(async () => {
  await kyselyDb.destroy();
});

// ─── Request Validation ──────────────────────────────────────────────────────

describe('request validation', () => {
  it('POST /boards with empty body returns 400', async () => {
    const res = await json('/boards', {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_request');
  });

  it('POST /boards/:board/issues with no title returns 400', async () => {
    await json('/boards', { name: 'api' });
    const res = await json('/boards/api/issues', {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_request');
  });

  it('POST /boards/:board/issues with empty title returns 400', async () => {
    await json('/boards', { name: 'api' });
    const res = await json('/boards/api/issues', { title: '' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_request');
  });

  it('POST /boards/:board/issues with whitespace-only title returns 400', async () => {
    await json('/boards', { name: 'api' });
    const res = await json('/boards/api/issues', { title: '   ' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_request');
  });

  it('POST /boards/:board/issues with invalid issue_type returns 400', async () => {
    await json('/boards', { name: 'api' });
    const res = await json('/boards/api/issues', { title: 'X', issue_type: 'invalid' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_request');
  });

  it('POST /boards/:board/issues/:id/claim with no assignee returns error', async () => {
    await json('/boards', { name: 'api' });
    const c = await json('/boards/api/issues', { title: 'A' });
    const issue = await c.json();
    const res = await json(`/boards/api/issues/${issue.id}/claim`, {});
    // Core requires a non-empty assignee
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('non-JSON content type returns error', async () => {
    const res = await app.request('/api/v1/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'not json',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('POST with malformed JSON returns error', async () => {
    const res = await app.request('/api/v1/boards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid json',
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ─── HTTP Method Enforcement ─────────────────────────────────────────────────

describe('method enforcement', () => {
  it('PUT /boards returns 404 or 405', async () => {
    const res = await req('/boards', { method: 'PUT' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('PATCH /boards/:name returns 404 or 405', async () => {
    const res = await req('/boards/api', { method: 'PATCH' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('PUT on issue endpoint returns 404 or 405', async () => {
    await json('/boards', { name: 'api' });
    const c = await json('/boards/api/issues', { title: 'A' });
    const issue = await c.json();
    const res = await req(`/boards/api/issues/${issue.id}`, { method: 'PUT' });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});

// ─── HTTP Status Code Contract ───────────────────────────────────────────────
//
// Verifies that each ErrorCode produces the correct HTTP status through the
// full Hono middleware stack (not just the HTTP_STATUS map).

describe('HTTP status code contract', () => {
  const scenarios: Array<{
    name: string;
    setup: () => Promise<void>;
    request: () => Promise<Response>;
    expectedStatus: number;
    expectedCode: string;
  }> = [
    {
      name: 'not_found → 404 (nonexistent issue)',
      setup: async () => { await json('/boards', { name: 'api' }); },
      request: () => req('/boards/api/issues/nonexistent'),
      expectedStatus: 404,
      expectedCode: 'not_found',
    },
    {
      name: 'not_found → 404 (nonexistent board for issue creation)',
      setup: async () => {},
      request: () => json('/boards/no-board/issues', { title: 'X' }),
      expectedStatus: 404,
      expectedCode: 'not_found',
    },
    {
      name: 'conflict → 409 (duplicate board)',
      setup: async () => { await json('/boards', { name: 'api' }); },
      request: () => json('/boards', { name: 'api' }),
      expectedStatus: 409,
      expectedCode: 'conflict',
    },
    {
      name: 'invalid_request → 400 (bad board name)',
      setup: async () => {},
      request: () => json('/boards', { name: 'INVALID' }),
      expectedStatus: 400,
      expectedCode: 'invalid_request',
    },
    {
      name: 'invalid_request → 400 (missing title)',
      setup: async () => { await json('/boards', { name: 'api' }); },
      request: () => json('/boards/api/issues', {}),
      expectedStatus: 400,
      expectedCode: 'invalid_request',
    },
    {
      name: 'invalid_request → 400 (bad status filter)',
      setup: async () => { await json('/boards', { name: 'api' }); },
      request: () => req('/boards/api/issues?status=banana'),
      expectedStatus: 400,
      expectedCode: 'invalid_request',
    },
    {
      name: 'self_dependency → 400',
      setup: async () => {
        await json('/boards', { name: 'api' });
        await json('/boards/api/issues', { title: 'A' });
      },
      request: async () => {
        const list = await req('/boards/api/issues');
        const issues = await list.json();
        return json(`/boards/api/issues/${issues[0].id}/dependencies`, {
          depends_on_id: issues[0].id,
        });
      },
      expectedStatus: 400,
      expectedCode: 'self_dependency',
    },
  ];

  for (const s of scenarios) {
    it(s.name, async () => {
      await s.setup();
      const res = await s.request();
      expect(res.status).toBe(s.expectedStatus);
      const body = await res.json();
      expect(body.error.code).toBe(s.expectedCode);
    });
  }
});

// ─── Response Shape Conformance ──────────────────────────────────────────────

describe('response shape conformance', () => {
  it('issue response has all required fields', async () => {
    await json('/boards', { name: 'api' });
    const res = await json('/boards/api/issues', { title: 'Test' });
    const issue = await res.json();

    const requiredFields = [
      'id', 'board', 'title', 'description', 'design',
      'acceptance_criteria', 'notes', 'status', 'priority',
      'issue_type', 'assignee', 'owner', 'created_at',
      'updated_at', 'closed_at', 'close_reason', 'labels',
    ];
    for (const field of requiredFields) {
      expect(issue).toHaveProperty(field);
    }
  });

  it('board response has all required fields', async () => {
    await json('/boards', { name: 'api', description: 'API board' });
    const res = await req('/boards');
    const boards = await res.json();
    const board = boards[0];

    const requiredFields = [
      'id', 'prefix', 'description', 'created_at', 'updated_at',
      'open_count', 'in_progress_count', 'closed_count',
    ];
    for (const field of requiredFields) {
      expect(board).toHaveProperty(field);
    }
  });

  it('issue detail response has dependencies, dependents, comments', async () => {
    await json('/boards', { name: 'api' });
    const c = await json('/boards/api/issues', { title: 'Test' });
    const created = await c.json();
    const res = await req(`/boards/api/issues/${created.id}`);
    const detail = await res.json();

    expect(detail).toHaveProperty('issue');
    expect(detail).toHaveProperty('dependencies');
    expect(detail).toHaveProperty('dependents');
    expect(detail).toHaveProperty('comments');
    expect(Array.isArray(detail.dependencies)).toBe(true);
    expect(Array.isArray(detail.dependents)).toBe(true);
    expect(Array.isArray(detail.comments)).toBe(true);
  });

  it('error response always has { error: { code, message } }', async () => {
    // 404 case
    const res = await req('/boards/nonexistent/issues/fake');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(typeof body.error.code).toBe('string');
    expect(typeof body.error.message).toBe('string');
  });
});
