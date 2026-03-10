import { useCallback, useEffect, useRef, useState } from 'react';
import type { IBoardsStore, Issue, Status } from '@saliagadotcom/boards-core';
import type { BoardData, RefreshState, SelectedIssueByStatus } from './types.js';
import { deriveStatusColumns } from './status-columns.js';
import type { StatusColumn } from './types.js';

export interface UseBoardDataOptions {
  store: IBoardsStore;
  board: string;
  pollIntervalMs?: number | undefined;
}

const DEFAULT_POLL_MS = 3000;

/**
 * Restore per-status selection after a data refresh.
 *
 * Rules (evaluated per status key in prev):
 *  1. Selected ID still exists in the same status column → keep it.
 *  2. Selected ID moved to a different status → drop from old, don't touch new.
 *  3. Selected ID gone → pick first issue in that column.
 *  4. Status column disappeared → pick first issue in nearest column (by canonical order).
 *  5. No columns at all → empty selection.
 */
export function restoreSelection(
  prev: SelectedIssueByStatus,
  nextColumns: StatusColumn[],
): SelectedIssueByStatus {
  if (nextColumns.length === 0) return {};

  const columnByStatus = new Map<Status, StatusColumn>();
  for (const col of nextColumns) columnByStatus.set(col.status, col);

  // Build a set of all issue IDs for quick lookup
  const allIds = new Set<string>();
  for (const col of nextColumns) {
    for (const issue of col.issues) allIds.add(issue.id);
  }

  const next: SelectedIssueByStatus = {};

  for (const [status, selectedId] of Object.entries(prev) as [Status, string | null][]) {
    if (selectedId == null) continue;

    const col = columnByStatus.get(status);
    if (col) {
      // Rule 1: ID still in same column
      if (col.issues.some((i) => i.id === selectedId)) {
        next[status] = selectedId;
      } else if (allIds.has(selectedId)) {
        // Rule 2: ID moved to different status — drop from old
        // (the new status will get selection when navigated to)
      } else {
        // Rule 3: ID gone — pick first issue
        next[status] = col.issues[0]?.id ?? null;
      }
    }
    // Rule 4: column gone — handled below
  }

  // Ensure every existing column has a selection entry
  for (const col of nextColumns) {
    if (!(col.status in next)) {
      next[col.status] = col.issues[0]?.id ?? null;
    }
  }

  return next;
}

export function useBoardData({
  store,
  board,
  pollIntervalMs = DEFAULT_POLL_MS,
}: UseBoardDataOptions): BoardData {
  const [columns, setColumns] = useState<StatusColumn[]>([]);
  const [selected, setSelected] = useState<SelectedIssueByStatus>({});
  const [refreshState, setRefreshState] = useState<RefreshState>('loading');
  const [error, setError] = useState<string | undefined>();

  const inFlightRef = useRef(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const fetchData = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const issues: Issue[] = await store.listIssues(board);
      const nextColumns = deriveStatusColumns(issues);

      setColumns(nextColumns);
      setSelected((prev) => restoreSelection(prev, nextColumns));
      setError(undefined);
      setRefreshState('idle');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setRefreshState((prev) => (prev === 'loading' ? 'error' : 'error'));
    } finally {
      inFlightRef.current = false;
    }
  }, [store, board]);

  // Initial fetch
  useEffect(() => {
    setRefreshState('loading');
    void fetchData();
  }, [fetchData]);

  // Polling
  useEffect(() => {
    if (pollIntervalMs <= 0) return;

    const id = setInterval(() => {
      setRefreshState((prev) => {
        if (prev === 'loading') return prev;
        return 'refreshing';
      });
      void fetchData();
    }, pollIntervalMs);

    return () => clearInterval(id);
  }, [fetchData, pollIntervalMs]);

  const refresh = useCallback(() => {
    void fetchData();
  }, [fetchData]);

  return { columns, selected, refreshState, error, refresh };
}
