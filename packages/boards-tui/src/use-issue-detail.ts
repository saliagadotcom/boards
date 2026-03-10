import { useCallback, useEffect, useRef, useState } from 'react';
import type { IBoardsStore, IssueDetail } from '@saliagadotcom/boards-core';

export interface UseIssueDetailOptions {
  store: IBoardsStore;
  issueId: string;
  pollIntervalMs?: number | undefined;
}

export type DetailLoadState = 'loading' | 'loaded' | 'not-found' | 'error';

export interface IssueDetailData {
  detail: IssueDetail | null;
  loadState: DetailLoadState;
  error: string | undefined;
}

const DEFAULT_POLL_MS = 3000;

export function useIssueDetail({
  store,
  issueId,
  pollIntervalMs = DEFAULT_POLL_MS,
}: UseIssueDetailOptions): IssueDetailData {
  const [detail, setDetail] = useState<IssueDetail | null>(null);
  const [loadState, setLoadState] = useState<DetailLoadState>('loading');
  const [error, setError] = useState<string | undefined>();

  const inFlightRef = useRef(false);

  const fetchDetail = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const result = await store.showIssue(issueId);
      setDetail(result);
      setError(undefined);
      setLoadState('loaded');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('not found') || message.includes('not_found')) {
        setLoadState('not-found');
      } else {
        setLoadState('error');
      }
      setError(message);
    } finally {
      inFlightRef.current = false;
    }
  }, [store, issueId]);

  // Initial fetch
  useEffect(() => {
    setLoadState('loading');
    setDetail(null);
    void fetchDetail();
  }, [fetchDetail]);

  // Polling
  useEffect(() => {
    if (pollIntervalMs <= 0) return;

    const id = setInterval(() => {
      void fetchDetail();
    }, pollIntervalMs);

    return () => clearInterval(id);
  }, [fetchDetail, pollIntervalMs]);

  return { detail, loadState, error };
}
