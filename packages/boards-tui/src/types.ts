import type { IBoardsStore, Issue, Status } from '@saliagadotcom/boards-core';

// ── App props ──────────────────────────────────────────────

export interface AppProps {
  store: IBoardsStore;
  board: string;
  pollIntervalMs?: number;
}

// ── Board view types ───────────────────────────────────────

export interface StatusColumn {
  status: Status;
  issues: Issue[];
}

/** Per-status selected issue ID. `null` means nothing selected in that column. */
export type SelectedIssueByStatus = Partial<Record<Status, string | null>>;

export type RefreshState = 'idle' | 'loading' | 'refreshing' | 'error';

export interface BoardData {
  columns: StatusColumn[];
  selected: SelectedIssueByStatus;
  refreshState: RefreshState;
  error: string | undefined;
  /** Trigger an immediate data refresh (e.g., after a mutation). */
  refresh: () => void;
}

// ── Tree view types ────────────────────────────────────────

export interface TreeNode {
  issue: Issue;
  children: TreeNode[];
  depth: number;
}

export type TreeDirection = 'down' | 'up';

// ── Layout ─────────────────────────────────────────────────

export type LayoutMode = 'multi' | 'focused' | 'too-small';

export type ViewMode = 'loading' | 'board' | 'detail' | 'tree' | 'editing';

// ── Layout constants ───────────────────────────────────────

export const MIN_COLUMN_WIDTH = 20;
export const COLUMN_GAP = 1;
export const MIN_SINGLE_COLUMN_WIDTH = 20;
export const MIN_ROWS = 5;
export const MIN_TWO_COLUMN_WIDTH = 100;
