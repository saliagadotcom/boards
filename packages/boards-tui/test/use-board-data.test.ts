import { describe, expect, it } from 'bun:test';
import type { Issue, Status } from '@saliagadotcom/boards-core';
import type { StatusColumn, SelectedIssueByStatus } from '../src/types.js';
import { restoreSelection } from '../src/use-board-data.js';

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

function makeColumn(status: Status, ids: string[]): StatusColumn {
  return {
    status,
    issues: ids.map((id) => makeIssue({ id, status })),
  };
}

describe('restoreSelection', () => {
  it('returns empty selection when no columns', () => {
    const prev: SelectedIssueByStatus = { open: 'a-1' };
    expect(restoreSelection(prev, [])).toEqual({});
  });

  it('initializes selection for all columns when prev is empty', () => {
    const columns = [makeColumn('open', ['a-1', 'a-2']), makeColumn('closed', ['b-1'])];
    const result = restoreSelection({}, columns);

    expect(result).toEqual({ open: 'a-1', closed: 'b-1' });
  });

  // Rule 1: ID still in same status column → keep it
  it('keeps selection when ID still exists in same column', () => {
    const prev: SelectedIssueByStatus = { open: 'a-2' };
    const columns = [makeColumn('open', ['a-1', 'a-2', 'a-3'])];

    const result = restoreSelection(prev, columns);
    expect(result.open).toBe('a-2');
  });

  // Rule 2: ID moved to different status → drop from old
  it('drops selection from old status when issue moved to new status', () => {
    const prev: SelectedIssueByStatus = { open: 'a-1' };
    // a-1 moved to in_progress
    const columns = [
      makeColumn('open', ['a-2', 'a-3']),
      makeColumn('in_progress', ['a-1']),
    ];

    const result = restoreSelection(prev, columns);
    // open should fall through to first issue (a-2) since a-1 moved away
    expect(result.open).toBe('a-2');
    // in_progress should get default selection (a-1)
    expect(result.in_progress).toBe('a-1');
  });

  // Rule 3: ID gone → pick first issue in column
  it('falls back to first issue when selected ID is deleted', () => {
    const prev: SelectedIssueByStatus = { open: 'deleted-1' };
    const columns = [makeColumn('open', ['a-1', 'a-2'])];

    const result = restoreSelection(prev, columns);
    expect(result.open).toBe('a-1');
  });

  // Rule 4: status column disappeared → other columns still get selection
  it('handles disappeared status column gracefully', () => {
    const prev: SelectedIssueByStatus = { open: 'a-1', in_progress: 'b-1' };
    // in_progress column gone (all issues closed or moved)
    const columns = [makeColumn('open', ['a-1']), makeColumn('closed', ['b-1'])];

    const result = restoreSelection(prev, columns);
    expect(result.open).toBe('a-1');
    expect(result.closed).toBe('b-1');
    expect(result.in_progress).toBeUndefined();
  });

  it('preserves selection across multiple columns', () => {
    const prev: SelectedIssueByStatus = {
      open: 'a-2',
      in_progress: 'b-3',
      blocked: 'c-1',
    };
    const columns = [
      makeColumn('open', ['a-1', 'a-2', 'a-3']),
      makeColumn('in_progress', ['b-1', 'b-2', 'b-3']),
      makeColumn('blocked', ['c-1', 'c-2']),
    ];

    const result = restoreSelection(prev, columns);
    expect(result.open).toBe('a-2');
    expect(result.in_progress).toBe('b-3');
    expect(result.blocked).toBe('c-1');
  });

  it('handles all issues deleted from a column (column still exists with new issues)', () => {
    const prev: SelectedIssueByStatus = { open: 'old-1' };
    const columns = [makeColumn('open', ['new-1', 'new-2'])];

    const result = restoreSelection(prev, columns);
    expect(result.open).toBe('new-1');
  });

  it('handles new columns appearing', () => {
    const prev: SelectedIssueByStatus = { open: 'a-1' };
    const columns = [
      makeColumn('open', ['a-1']),
      makeColumn('blocked', ['b-1', 'b-2']),
    ];

    const result = restoreSelection(prev, columns);
    expect(result.open).toBe('a-1');
    expect(result.blocked).toBe('b-1');
  });
});
