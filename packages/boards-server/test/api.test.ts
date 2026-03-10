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

// --- Board endpoints ---

describe('POST /boards', () => {
  it('creates a board and returns 201', async () => {
    const res = await json('/boards', { name: 'api', description: 'API issues' });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe('api');
    expect(body.prefix).toBe('api');
    expect(body.description).toBe('API issues');
    expect(body.created_at).toBeTruthy();
    expect(body.updated_at).toBeTruthy();
  });

  it('returns 409 for duplicate board name', async () => {
    await json('/boards', { name: 'api' });
    const res = await json('/boards', { name: 'api' });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('conflict');
  });

  it('returns 400 for invalid board name', async () => {
    const res = await json('/boards', { name: 'INVALID' });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_request');
  });
});

describe('GET /boards', () => {
  it('returns 200 with list including counts', async () => {
    await json('/boards', { name: 'api' });
    const res = await req('/boards');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0].id).toBe('api');
    expect(body[0].open_count).toBe(0);
    expect(body[0].in_progress_count).toBe(0);
    expect(body[0].closed_count).toBe(0);
  });

  it('returns empty array when no boards', async () => {
    const res = await req('/boards');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });
});

describe('DELETE /boards/:name', () => {
  it('returns 204', async () => {
    await json('/boards', { name: 'api' });
    const res = await req('/boards/api', { method: 'DELETE' });
    expect(res.status).toBe(204);
  });
});

// --- Issue endpoints ---

describe('POST /boards/:board/issues', () => {
  it('creates an issue and returns 201', async () => {
    await json('/boards', { name: 'api' });
    const res = await json('/boards/api/issues', {
      title: 'Fix login',
      priority: 0,
      issue_type: 'bug',
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.title).toBe('Fix login');
    expect(body.board).toBe('api');
    expect(body.status).toBe('open');
    expect(body.priority).toBe(0);
    expect(body.issue_type).toBe('bug');
  });
});

describe('GET /boards/:board/issues', () => {
  it('returns 200 with list', async () => {
    await json('/boards', { name: 'api' });
    await json('/boards/api/issues', { title: 'Issue 1' });
    await json('/boards/api/issues', { title: 'Issue 2' });
    const res = await req('/boards/api/issues');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
  });

  it('filters by status', async () => {
    await json('/boards', { name: 'api' });
    const create1 = await json('/boards/api/issues', { title: 'Issue 1' });
    const issue1 = await create1.json();
    await json(`/boards/api/issues/${issue1.id}`, { status: 'in_progress' }, 'PATCH');
    await json('/boards/api/issues', { title: 'Issue 2' });

    const res = await req('/boards/api/issues?status=open');
    const body = await res.json();
    expect(body.length).toBe(1);
    expect(body[0].title).toBe('Issue 2');
  });

  it('returns 400 for invalid status', async () => {
    await json('/boards', { name: 'api' });
    const res = await req('/boards/api/issues?status=banana');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_request');
    expect(body.error.message).toContain('Invalid status');
  });

  it('returns 400 for invalid issue_type', async () => {
    await json('/boards', { name: 'api' });
    const res = await req('/boards/api/issues?issue_type=invalid');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_request');
    expect(body.error.message).toContain('Invalid issue_type');
  });

  it('returns 400 for invalid priority', async () => {
    await json('/boards', { name: 'api' });
    const res = await req('/boards/api/issues?priority=abc');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_request');
    expect(body.error.message).toContain('Invalid priority');
  });

  it('searches with q param', async () => {
    await json('/boards', { name: 'api' });
    await json('/boards/api/issues', { title: 'Login bug', description: 'timeout issue' });
    await json('/boards/api/issues', { title: 'Signup flow' });

    const res = await req('/boards/api/issues?q=login');
    const body = await res.json();
    expect(body.length).toBe(1);
    expect(body[0].title).toBe('Login bug');
  });
});

describe('GET /boards/:board/issues/:id', () => {
  it('returns 200 with IssueDetail', async () => {
    await json('/boards', { name: 'api' });
    const create = await json('/boards/api/issues', { title: 'Test issue' });
    const issue = await create.json();
    const res = await req(`/boards/api/issues/${issue.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.issue.id).toBe(issue.id);
    expect(body.dependencies).toEqual([]);
    expect(body.dependents).toEqual([]);
  });

  it('returns 404 for non-existent issue', async () => {
    await json('/boards', { name: 'api' });
    const res = await req('/boards/api/issues/nonexistent');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('not_found');
  });

  it('returns 404 when issue belongs to a different board', async () => {
    await json('/boards', { name: 'api' });
    await json('/boards', { name: 'web' });
    const create = await json('/boards/api/issues', { title: 'API issue' });
    const issue = await create.json();
    const res = await req(`/boards/web/issues/${issue.id}`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('not_found');
  });
});

describe('PATCH /boards/:board/issues/:id', () => {
  it('returns 200 with updated issue', async () => {
    await json('/boards', { name: 'api' });
    const create = await json('/boards/api/issues', { title: 'Old title' });
    const issue = await create.json();
    const res = await json(`/boards/api/issues/${issue.id}`, { title: 'New title' }, 'PATCH');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.title).toBe('New title');
  });

  it('allows closed → in_progress transition', async () => {
    await json('/boards', { name: 'api' });
    const create = await json('/boards/api/issues', { title: 'Test' });
    const issue = await create.json();
    // Close first
    await json(`/boards/api/issues/${issue.id}/close`, {});
    // closed → in_progress should succeed
    const res = await json(`/boards/api/issues/${issue.id}`, { status: 'in_progress' }, 'PATCH');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('in_progress');
  });
});

describe('POST /boards/:board/issues/:id/close', () => {
  it('returns 200 with closed issue', async () => {
    await json('/boards', { name: 'api' });
    const create = await json('/boards/api/issues', { title: 'To close' });
    const issue = await create.json();
    const res = await json(`/boards/api/issues/${issue.id}/close`, { reason: 'Done' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('closed');
    expect(body.close_reason).toBe('Done');
  });
});

describe('DELETE /boards/:board/issues/:id', () => {
  it('returns 204', async () => {
    await json('/boards', { name: 'api' });
    const create = await json('/boards/api/issues', { title: 'To delete' });
    const issue = await create.json();
    const res = await req(`/boards/api/issues/${issue.id}`, { method: 'DELETE' });
    expect(res.status).toBe(204);
  });
});

// --- Dependency endpoints ---

describe('POST /boards/:board/issues/:id/dependencies', () => {
  it('returns 201', async () => {
    await json('/boards', { name: 'api' });
    const c1 = await json('/boards/api/issues', { title: 'A' });
    const c2 = await json('/boards/api/issues', { title: 'B' });
    const a = await c1.json();
    const b = await c2.json();
    const res = await json(`/boards/api/issues/${a.id}/dependencies`, {
      depends_on_id: b.id,
      type: 'blocks',
    });
    expect(res.status).toBe(201);
  });

  it('returns 400 for self-dependency', async () => {
    await json('/boards', { name: 'api' });
    const c = await json('/boards/api/issues', { title: 'A' });
    const a = await c.json();
    const res = await json(`/boards/api/issues/${a.id}/dependencies`, {
      depends_on_id: a.id,
      type: 'blocks',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('self_dependency');
  });

  it('returns 400 for circular dependency', async () => {
    await json('/boards', { name: 'api' });
    const c1 = await json('/boards/api/issues', { title: 'A' });
    const c2 = await json('/boards/api/issues', { title: 'B' });
    const a = await c1.json();
    const b = await c2.json();
    await json(`/boards/api/issues/${a.id}/dependencies`, {
      depends_on_id: b.id,
      type: 'blocks',
    });
    const res = await json(`/boards/api/issues/${b.id}/dependencies`, {
      depends_on_id: a.id,
      type: 'blocks',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('circular_dependency');
  });

  it('returns 400 for cross-board dependency', async () => {
    await json('/boards', { name: 'api' });
    await json('/boards', { name: 'web' });
    const c1 = await json('/boards/api/issues', { title: 'API issue' });
    const c2 = await json('/boards/web/issues', { title: 'Web issue' });
    const a = await c1.json();
    const b = await c2.json();
    const res = await json(`/boards/api/issues/${a.id}/dependencies`, {
      depends_on_id: b.id,
      type: 'blocks',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('cross_board');
  });
});

describe('GET /boards/:board/issues/:id/dependencies', () => {
  it('returns 200 with dependencies', async () => {
    await json('/boards', { name: 'api' });
    const c1 = await json('/boards/api/issues', { title: 'A' });
    const c2 = await json('/boards/api/issues', { title: 'B' });
    const a = await c1.json();
    const b = await c2.json();
    await json(`/boards/api/issues/${a.id}/dependencies`, {
      depends_on_id: b.id,
      type: 'blocks',
    });
    const res = await req(`/boards/api/issues/${a.id}/dependencies`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0].type).toBe('blocks');
    expect(body[0].issue.id).toBe(b.id);
  });
});

describe('GET /boards/:board/issues/:id/dependencies validation', () => {
  it('returns 400 for invalid direction', async () => {
    await json('/boards', { name: 'api' });
    const c = await json('/boards/api/issues', { title: 'A' });
    const a = await c.json();
    const res = await req(
      `/boards/api/issues/${a.id}/dependencies?direction=sideways`,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_request');
    expect(body.error.message).toContain('Invalid direction');
  });

  it('returns 400 for invalid type', async () => {
    await json('/boards', { name: 'api' });
    const c = await json('/boards/api/issues', { title: 'A' });
    const a = await c.json();
    const res = await req(
      `/boards/api/issues/${a.id}/dependencies?type=invalid`,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_request');
    expect(body.error.message).toContain('Invalid dependency type');
  });
});

describe('DELETE /boards/:board/issues/:id/dependencies/:depends_on_id', () => {
  it('returns 204', async () => {
    await json('/boards', { name: 'api' });
    const c1 = await json('/boards/api/issues', { title: 'A' });
    const c2 = await json('/boards/api/issues', { title: 'B' });
    const a = await c1.json();
    const b = await c2.json();
    await json(`/boards/api/issues/${a.id}/dependencies`, {
      depends_on_id: b.id,
    });
    const res = await req(`/boards/api/issues/${a.id}/dependencies/${b.id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(204);
  });
});

// --- Label endpoints ---

describe('POST /boards/:board/issues/:id/labels', () => {
  it('returns 201', async () => {
    await json('/boards', { name: 'api' });
    const c = await json('/boards/api/issues', { title: 'A' });
    const a = await c.json();
    const res = await json(`/boards/api/issues/${a.id}/labels`, { label: 'urgent' });
    expect(res.status).toBe(201);
  });
});

describe('DELETE /boards/:board/issues/:id/labels/:label', () => {
  it('returns 204', async () => {
    await json('/boards', { name: 'api' });
    const c = await json('/boards/api/issues', { title: 'A' });
    const a = await c.json();
    await json(`/boards/api/issues/${a.id}/labels`, { label: 'urgent' });
    const res = await req(`/boards/api/issues/${a.id}/labels/urgent`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(204);
  });
});

// --- Ready + Claim endpoints ---

describe('GET /boards/:board/ready', () => {
  it('returns 200 with unblocked issues', async () => {
    await json('/boards', { name: 'api' });
    await json('/boards/api/issues', { title: 'Ready issue' });
    const res = await req('/boards/api/ready');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0].title).toBe('Ready issue');
  });
});

describe('POST /boards/:board/issues/:id/claim', () => {
  it('returns 200 with claimed issue', async () => {
    await json('/boards', { name: 'api' });
    const c = await json('/boards/api/issues', { title: 'Claimable' });
    const issue = await c.json();
    const res = await json(`/boards/api/issues/${issue.id}/claim`, {
      assignee: 'agent-1',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assignee).toBe('agent-1');
    expect(body.status).toBe('in_progress');
  });

  it('returns 409 for already assigned issue', async () => {
    await json('/boards', { name: 'api' });
    const c = await json('/boards/api/issues', { title: 'Claimable' });
    const issue = await c.json();
    await json(`/boards/api/issues/${issue.id}/claim`, { assignee: 'agent-1' });
    const res = await json(`/boards/api/issues/${issue.id}/claim`, {
      assignee: 'agent-2',
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('conflict');
  });
});

// --- Reopen endpoint ---

describe('POST /boards/:board/issues/:id/reopen', () => {
  it('reopens a closed issue and returns 200', async () => {
    await json('/boards', { name: 'api' });
    const create = await json('/boards/api/issues', { title: 'To reopen' });
    const issue = await create.json();
    await json(`/boards/api/issues/${issue.id}/close`, { reason: 'Done' });
    const res = await json(`/boards/api/issues/${issue.id}/reopen`, {});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('open');
  });

  it('reopens with a specific status', async () => {
    await json('/boards', { name: 'api' });
    const create = await json('/boards/api/issues', { title: 'To reopen' });
    const issue = await create.json();
    await json(`/boards/api/issues/${issue.id}/close`, {});
    const res = await json(`/boards/api/issues/${issue.id}/reopen`, { status: 'in_progress' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('in_progress');
  });
});

// --- Comment endpoints ---

describe('POST /boards/:board/issues/:id/comments', () => {
  it('creates a comment and returns 201', async () => {
    await json('/boards', { name: 'api' });
    const create = await json('/boards/api/issues', { title: 'Issue' });
    const issue = await create.json();
    const res = await json(`/boards/api/issues/${issue.id}/comments`, {
      author: 'alice',
      text: 'Looks good',
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.author).toBe('alice');
    expect(body.text).toBe('Looks good');
    expect(body.issue_id).toBe(issue.id);
  });
});

describe('GET /boards/:board/issues/:id/comments', () => {
  it('returns 200 with comments list', async () => {
    await json('/boards', { name: 'api' });
    const create = await json('/boards/api/issues', { title: 'Issue' });
    const issue = await create.json();
    await json(`/boards/api/issues/${issue.id}/comments`, { author: 'alice', text: 'First' });
    await json(`/boards/api/issues/${issue.id}/comments`, { author: 'bob', text: 'Second' });
    const res = await req(`/boards/api/issues/${issue.id}/comments`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(2);
  });
});

describe('DELETE /boards/:board/issues/:id/comments/:commentId', () => {
  it('returns 204', async () => {
    await json('/boards', { name: 'api' });
    const create = await json('/boards/api/issues', { title: 'Issue' });
    const issue = await create.json();
    const commentRes = await json(`/boards/api/issues/${issue.id}/comments`, {
      author: 'alice',
      text: 'To delete',
    });
    const comment = await commentRes.json();
    const res = await req(`/boards/api/issues/${issue.id}/comments/${comment.id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(204);
  });
});

// --- Epic status endpoint ---

describe('GET /boards/:board/epics', () => {
  it('returns 200 with epic status list', async () => {
    await json('/boards', { name: 'api' });
    const res = await req('/boards/api/epics');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

// --- Bulk delete endpoint ---

describe('DELETE /boards/:board/issues', () => {
  it('returns 200 with delete result', async () => {
    await json('/boards', { name: 'api' });
    const c1 = await json('/boards/api/issues', { title: 'A' });
    const c2 = await json('/boards/api/issues', { title: 'B' });
    const a = await c1.json();
    const b = await c2.json();
    const res = await req('/boards/api/issues', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [a.id, b.id, 'nonexistent'] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toContain(a.id);
    expect(body.deleted).toContain(b.id);
    expect(body.not_found).toContain('nonexistent');
  });
});

// --- Metadata endpoint ---

describe('GET /metadata', () => {
  it('returns 200 with version and schema_version', async () => {
    const res = await req('/metadata');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.version).toBe('string');
    expect(typeof body.schema_version).toBe('number');
  });
});

// --- Create with parent_id ---

describe('POST /boards/:board/issues with parent_id', () => {
  it('creates issue with parent dependency', async () => {
    await json('/boards', { name: 'api' });
    const parentRes = await json('/boards/api/issues', { title: 'Epic', issue_type: 'epic' });
    const parent = await parentRes.json();
    const res = await json('/boards/api/issues', {
      title: 'Child task',
      parent_id: parent.id,
    });
    expect(res.status).toBe(201);
    const child = await res.json();
    expect(child.title).toBe('Child task');
  });
});

// --- Error format ---

describe('error format', () => {
  it('all errors return { error: { code, message } }', async () => {
    const res = await req('/boards/nonexistent/issues/fake');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(typeof body.error.code).toBe('string');
    expect(typeof body.error.message).toBe('string');
  });

  it('responses use snake_case JSON keys', async () => {
    await json('/boards', { name: 'api' });
    const c = await json('/boards/api/issues', { title: 'Test' });
    const issue = await c.json();
    expect(issue.issue_type).toBe('task');
    expect(issue.created_at).toBeTruthy();
    expect(issue.updated_at).toBeTruthy();
    expect(issue.closed_at).toBeNull();
    expect(issue.close_reason).toBeDefined();
  });

  it('timestamps are ISO 8601', async () => {
    await json('/boards', { name: 'api' });
    const c = await json('/boards/api/issues', { title: 'Test' });
    const issue = await c.json();
    expect(issue.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
