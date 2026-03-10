import { describe, expect, it } from 'bun:test';
import type { Issue, Status } from '@saliagadotcom/boards-core';
import { deriveStatusColumns } from '../src/status-columns.js';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'test-1',
    board: 'test',
    title: 'Test issue',
    description: '',
    design: '',
    acceptance_criteria: '',
    notes: '',
    status: 'open',
    priority: 2,
    issue_type: 'task',
    assignee: '',
    owner: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    closed_at: null,
    close_reason: '',
    labels: [],
    ...overrides,
  };
}

describe('deriveStatusColumns', () => {
  it('returns empty array for empty input', () => {
    expect(deriveStatusColumns([])).toEqual([]);
  });

  it('returns one column for single-status input', () => {
    const issues = [makeIssue({ id: 'a-1' }), makeIssue({ id: 'a-2' })];
    const columns = deriveStatusColumns(issues);

    expect(columns).toHaveLength(1);
    expect(columns[0].status).toBe('open');
    expect(columns[0].issues).toHaveLength(2);
  });

  it('returns columns in canonical order', () => {
    const issues = [
      makeIssue({ id: 'c-1', status: 'closed', closed_at: '2026-01-02T00:00:00Z' }),
      makeIssue({ id: 'o-1', status: 'open' }),
      makeIssue({ id: 'b-1', status: 'blocked' }),
      makeIssue({ id: 'i-1', status: 'in_progress' }),
      makeIssue({ id: 'd-1', status: 'deferred' }),
    ];
    const columns = deriveStatusColumns(issues);
    const statuses = columns.map((c) => c.status);

    expect(statuses).toEqual(['open', 'in_progress', 'blocked', 'deferred', 'closed']);
  });

  it('excludes statuses with no issues', () => {
    const issues = [
      makeIssue({ id: 'o-1', status: 'open' }),
      makeIssue({ id: 'b-1', status: 'blocked' }),
    ];
    const columns = deriveStatusColumns(issues);
    const statuses = columns.map((c) => c.status);

    expect(statuses).toEqual(['open', 'blocked']);
    expect(statuses).not.toContain('in_progress');
    expect(statuses).not.toContain('deferred');
    expect(statuses).not.toContain('closed');
  });

  it('sorts by priority ascending (P0 before P4)', () => {
    const issues = [
      makeIssue({ id: 'a-1', priority: 4 }),
      makeIssue({ id: 'a-2', priority: 0 }),
      makeIssue({ id: 'a-3', priority: 2 }),
    ];
    const columns = deriveStatusColumns(issues);
    const ids = columns[0].issues.map((i) => i.id);

    expect(ids).toEqual(['a-2', 'a-3', 'a-1']);
  });

  it('breaks priority tie with updated_at descending (newer first)', () => {
    const issues = [
      makeIssue({ id: 'a-1', priority: 1, updated_at: '2026-01-01T00:00:00Z' }),
      makeIssue({ id: 'a-2', priority: 1, updated_at: '2026-03-01T00:00:00Z' }),
      makeIssue({ id: 'a-3', priority: 1, updated_at: '2026-02-01T00:00:00Z' }),
    ];
    const columns = deriveStatusColumns(issues);
    const ids = columns[0].issues.map((i) => i.id);

    expect(ids).toEqual(['a-2', 'a-3', 'a-1']);
  });

  it('breaks updated_at tie with id ascending (lexicographic)', () => {
    const issues = [
      makeIssue({ id: 'c-1', priority: 1, updated_at: '2026-01-01T00:00:00Z' }),
      makeIssue({ id: 'a-1', priority: 1, updated_at: '2026-01-01T00:00:00Z' }),
      makeIssue({ id: 'b-1', priority: 1, updated_at: '2026-01-01T00:00:00Z' }),
    ];
    const columns = deriveStatusColumns(issues);
    const ids = columns[0].issues.map((i) => i.id);

    expect(ids).toEqual(['a-1', 'b-1', 'c-1']);
  });
});
