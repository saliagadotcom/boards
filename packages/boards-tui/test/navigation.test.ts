import { describe, expect, it } from 'bun:test';
import type { Issue, Status } from '@saliagadotcom/boards-core';
import type { SelectedIssueByStatus, StatusColumn } from '../src/types.js';
import { deriveViewMode, INITIAL_NAV_STATE, navReduce } from '../src/navigation.js';
import type { NavState } from '../src/navigation.js';

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

const columns = [
  makeColumn('open', ['a-1', 'a-2', 'a-3']),
  makeColumn('in_progress', ['b-1']),
  makeColumn('blocked', ['c-1', 'c-2']),
];

const polled: SelectedIssueByStatus = { open: 'a-1', in_progress: 'b-1', blocked: 'c-1' };

const boardState: NavState = {
  viewMode: 'board',
  focusedColumnIndex: 0,
  selectedIssueId: null,
  localSelection: {},
  treeDirection: 'down',
  previousViewMode: null,
};

// ── deriveViewMode ─────────────────────────────────────────

describe('deriveViewMode', () => {
  it('transitions loading → board when data is idle', () => {
    expect(deriveViewMode('loading', 'idle')).toBe('board');
  });

  it('stays loading while refreshState is loading', () => {
    expect(deriveViewMode('loading', 'loading')).toBe('loading');
  });

  it('stays loading on error refreshState', () => {
    expect(deriveViewMode('loading', 'error')).toBe('loading');
  });

  it('passes through non-loading viewModes', () => {
    expect(deriveViewMode('board', 'idle')).toBe('board');
    expect(deriveViewMode('detail', 'refreshing')).toBe('detail');
    expect(deriveViewMode('tree', 'error')).toBe('tree');
  });
});

// ── navReduce: column navigation ───────────────────────────

describe('navReduce column navigation', () => {
  it('moves right', () => {
    const next = navReduce(boardState, { type: 'column', direction: 1 }, columns, polled);
    expect(next.focusedColumnIndex).toBe(1);
  });

  it('moves left', () => {
    const state = { ...boardState, focusedColumnIndex: 2 };
    const next = navReduce(state, { type: 'column', direction: -1 }, columns, polled);
    expect(next.focusedColumnIndex).toBe(1);
  });

  it('clamps at 0', () => {
    const next = navReduce(boardState, { type: 'column', direction: -1 }, columns, polled);
    expect(next.focusedColumnIndex).toBe(0);
  });

  it('clamps at last column', () => {
    const state = { ...boardState, focusedColumnIndex: 2 };
    const next = navReduce(state, { type: 'column', direction: 1 }, columns, polled);
    expect(next.focusedColumnIndex).toBe(2);
  });
});

// ── navReduce: issue navigation ────────────────────────────

describe('navReduce issue navigation', () => {
  it('moves down within column', () => {
    const next = navReduce(boardState, { type: 'issue', direction: 1 }, columns, polled);
    expect(next.localSelection.open).toBe('a-2');
  });

  it('moves up within column', () => {
    const state = { ...boardState, localSelection: { open: 'a-3' } };
    const next = navReduce(state, { type: 'issue', direction: -1 }, columns, polled);
    expect(next.localSelection.open).toBe('a-2');
  });

  it('clamps at top of column', () => {
    const next = navReduce(boardState, { type: 'issue', direction: -1 }, columns, polled);
    expect(next.localSelection.open).toBeUndefined();
  });

  it('clamps at bottom of column', () => {
    const state = { ...boardState, localSelection: { open: 'a-3' } };
    const next = navReduce(state, { type: 'issue', direction: 1 }, columns, polled);
    expect(next.localSelection.open).toBe('a-3');
  });

  it('does nothing when column is empty', () => {
    const next = navReduce(boardState, { type: 'issue', direction: 1 }, [], polled);
    expect(next).toEqual(boardState);
  });
});

// ── navReduce: select ──────────────────────────────────────

describe('navReduce select', () => {
  it('transitions to detail and sets selectedIssueId', () => {
    const next = navReduce(boardState, { type: 'select', issueId: 'a-2' }, columns, polled);
    expect(next.viewMode).toBe('detail');
    expect(next.selectedIssueId).toBe('a-2');
  });
});

// ── navReduce: escape ──────────────────────────────────────

describe('navReduce escape', () => {
  it('tree → detail', () => {
    const state: NavState = { ...boardState, viewMode: 'tree', selectedIssueId: 'a-1' };
    const next = navReduce(state, { type: 'escape' }, columns, polled);
    expect(next.viewMode).toBe('detail');
    expect(next.selectedIssueId).toBe('a-1');
  });

  it('detail → board and clears selectedIssueId', () => {
    const state: NavState = { ...boardState, viewMode: 'detail', selectedIssueId: 'a-1' };
    const next = navReduce(state, { type: 'escape' }, columns, polled);
    expect(next.viewMode).toBe('board');
    expect(next.selectedIssueId).toBeNull();
  });

  it('board → board (no-op)', () => {
    const next = navReduce(boardState, { type: 'escape' }, columns, polled);
    expect(next.viewMode).toBe('board');
  });
});

// ── navReduce: view-tree ───────────────────────────────────

describe('navReduce view-tree', () => {
  it('transitions detail → tree when selectedIssueId is set', () => {
    const state: NavState = { ...boardState, viewMode: 'detail', selectedIssueId: 'a-1' };
    const next = navReduce(state, { type: 'view-tree' }, columns, polled);
    expect(next.viewMode).toBe('tree');
    expect(next.selectedIssueId).toBe('a-1');
  });

  it('is a no-op from board view', () => {
    const next = navReduce(boardState, { type: 'view-tree' }, columns, polled);
    expect(next.viewMode).toBe('board');
  });

  it('is a no-op when no selectedIssueId', () => {
    const state: NavState = { ...boardState, viewMode: 'detail', selectedIssueId: null };
    const next = navReduce(state, { type: 'view-tree' }, columns, polled);
    expect(next.viewMode).toBe('detail');
  });
});

// ── navReduce: toggle-tree-direction ───────────────────────

describe('navReduce toggle-tree-direction', () => {
  it('toggles down → up', () => {
    const state: NavState = { ...boardState, treeDirection: 'down' };
    const next = navReduce(state, { type: 'toggle-tree-direction' }, columns, polled);
    expect(next.treeDirection).toBe('up');
  });

  it('toggles up → down', () => {
    const state: NavState = { ...boardState, treeDirection: 'up' };
    const next = navReduce(state, { type: 'toggle-tree-direction' }, columns, polled);
    expect(next.treeDirection).toBe('down');
  });
});

// ── navReduce: edit ────────────────────────────────────────

describe('navReduce edit', () => {
  it('transitions to editing and stores previous view mode', () => {
    const next = navReduce(boardState, { type: 'edit', issueId: 'a-1' }, columns, polled);
    expect(next.viewMode).toBe('editing');
    expect(next.selectedIssueId).toBe('a-1');
    expect(next.previousViewMode).toBe('board');
  });

  it('stores detail as previous view when editing from detail', () => {
    const state: NavState = { ...boardState, viewMode: 'detail', selectedIssueId: 'a-1' };
    const next = navReduce(state, { type: 'edit', issueId: 'a-1' }, columns, polled);
    expect(next.viewMode).toBe('editing');
    expect(next.previousViewMode).toBe('detail');
  });
});

// ── navReduce: cancel-edit ─────────────────────────────────

describe('navReduce cancel-edit', () => {
  it('returns to previous view mode', () => {
    const state: NavState = { ...boardState, viewMode: 'editing', selectedIssueId: 'a-1', previousViewMode: 'detail' };
    const next = navReduce(state, { type: 'cancel-edit' }, columns, polled);
    expect(next.viewMode).toBe('detail');
    expect(next.previousViewMode).toBeNull();
  });

  it('falls back to board when previousViewMode is null', () => {
    const state: NavState = { ...boardState, viewMode: 'editing', selectedIssueId: 'a-1', previousViewMode: null };
    const next = navReduce(state, { type: 'cancel-edit' }, columns, polled);
    expect(next.viewMode).toBe('board');
  });
});

// ── navReduce: escape from editing ─────────────────────────

describe('navReduce escape from editing', () => {
  it('returns to previous view on escape', () => {
    const state: NavState = { ...boardState, viewMode: 'editing', selectedIssueId: 'a-1', previousViewMode: 'board' };
    const next = navReduce(state, { type: 'escape' }, columns, polled);
    expect(next.viewMode).toBe('board');
    expect(next.previousViewMode).toBeNull();
  });
});
