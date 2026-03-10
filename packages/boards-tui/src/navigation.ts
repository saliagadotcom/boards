import type { Status } from '@saliagadotcom/boards-core';
import type { RefreshState, SelectedIssueByStatus, StatusColumn, TreeDirection, ViewMode } from './types.js';

// ── State ──────────────────────────────────────────────────

export interface NavState {
  viewMode: ViewMode;
  focusedColumnIndex: number;
  selectedIssueId: string | null;
  localSelection: SelectedIssueByStatus;
  treeDirection: TreeDirection;
  /** View to return to after editing. */
  previousViewMode: ViewMode | null;
}

export const INITIAL_NAV_STATE: NavState = {
  viewMode: 'loading',
  focusedColumnIndex: 0,
  selectedIssueId: null,
  localSelection: {},
  treeDirection: 'down',
  previousViewMode: null,
};

// ── Actions ────────────────────────────────────────────────

export type NavAction =
  | { type: 'column'; direction: -1 | 1 }
  | { type: 'issue'; direction: -1 | 1 }
  | { type: 'select'; issueId: string }
  | { type: 'escape' }
  | { type: 'view-tree' }
  | { type: 'toggle-tree-direction' }
  | { type: 'edit'; issueId: string }
  | { type: 'cancel-edit' };

// ── Derived view mode ──────────────────────────────────────

export function deriveViewMode(
  viewMode: ViewMode,
  refreshState: RefreshState,
): ViewMode {
  if (viewMode === 'loading' && refreshState !== 'loading' && refreshState !== 'error') {
    return 'board';
  }
  return viewMode;
}

// ── Pure reducer ───────────────────────────────────────────

export function navReduce(
  state: NavState,
  action: NavAction,
  columns: StatusColumn[],
  polledSelected: SelectedIssueByStatus,
): NavState {
  switch (action.type) {
    case 'column': {
      const next = state.focusedColumnIndex + action.direction;
      const clamped = Math.max(0, Math.min(next, columns.length - 1));
      return { ...state, focusedColumnIndex: clamped };
    }

    case 'issue': {
      const col = columns[state.focusedColumnIndex];
      if (!col) return state;

      const merged = { ...polledSelected, ...state.localSelection };
      const currentId = merged[col.status];
      const currentIndex = col.issues.findIndex((i) => i.id === currentId);
      const nextIndex = currentIndex + action.direction;

      if (nextIndex < 0 || nextIndex >= col.issues.length) return state;

      const nextId = col.issues[nextIndex]!.id;
      return {
        ...state,
        localSelection: { ...state.localSelection, [col.status]: nextId },
      };
    }

    case 'select':
      return {
        ...state,
        viewMode: 'detail',
        selectedIssueId: action.issueId,
      };

    case 'escape': {
      if (state.viewMode === 'editing') {
        return {
          ...state,
          viewMode: state.previousViewMode ?? 'board',
          previousViewMode: null,
        };
      }
      if (state.viewMode === 'tree') return { ...state, viewMode: 'detail' };
      if (state.viewMode === 'detail')
        return { ...state, viewMode: 'board', selectedIssueId: null };
      return state;
    }

    case 'view-tree': {
      if (state.viewMode === 'detail' && state.selectedIssueId) {
        return { ...state, viewMode: 'tree' };
      }
      return state;
    }

    case 'toggle-tree-direction':
      return {
        ...state,
        treeDirection: state.treeDirection === 'down' ? 'up' : 'down',
      };

    case 'edit':
      return {
        ...state,
        viewMode: 'editing',
        selectedIssueId: action.issueId,
        previousViewMode: state.viewMode,
      };

    case 'cancel-edit':
      return {
        ...state,
        viewMode: state.previousViewMode ?? 'board',
        previousViewMode: null,
      };

    default:
      return state;
  }
}
