import React, { useCallback, useReducer } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import type { Issue, UpdateIssueInput } from '@saliagadotcom/boards-core';
import type { AppProps, TreeDirection, ViewMode } from './types.js';
import { useBoardData } from './use-board-data.js';
import { BoardScreen } from './board-screen.js';
import type { NavigateAction } from './board-screen.js';
import { DetailScreen } from './detail-screen.js';
import { useIssueDetail } from './use-issue-detail.js';
import { TreeScreen } from './tree-screen.js';
import { useTreeData } from './use-tree-data.js';
import { EditScreen } from './edit-screen.js';
import { StatusBar } from './status-bar.js';
import { deriveViewMode, INITIAL_NAV_STATE, navReduce } from './navigation.js';
import type { NavAction, NavState } from './navigation.js';

export function App({ store, board, pollIntervalMs }: AppProps): React.ReactElement {
  const { exit } = useApp();
  const { stdout } = useStdout();

  const terminalWidth = stdout?.columns ?? 80;
  const terminalHeight = stdout?.rows ?? 24;

  const { columns, selected, refreshState, error, refresh } = useBoardData({
    store,
    board,
    pollIntervalMs,
  });

  const [nav, dispatch] = useReducer(
    (state: NavState, action: NavAction) => navReduce(state, action, columns, selected),
    INITIAL_NAV_STATE,
  );

  const effectiveViewMode = deriveViewMode(nav.viewMode, refreshState);
  const effectiveSelected = { ...selected, ...nav.localSelection };

  useInput((input, key) => {
    if (effectiveViewMode === 'editing') return;

    if (input === 'q') {
      exit();
      return;
    }
    if (key.escape) {
      dispatch({ type: 'escape' });
      return;
    }
    if (key.ctrl && input === 'e') {
      const issueId = getEditableIssueId();
      if (issueId) dispatch({ type: 'edit', issueId });
    }
  });

  const getEditableIssueId = useCallback((): string | null => {
    if (effectiveViewMode === 'detail' && nav.selectedIssueId) {
      return nav.selectedIssueId;
    }
    if (effectiveViewMode === 'board') {
      const col = columns[nav.focusedColumnIndex];
      return col ? effectiveSelected[col.status] ?? null : null;
    }
    return null;
  }, [effectiveViewMode, nav.selectedIssueId, nav.focusedColumnIndex, columns, effectiveSelected]);

  const findIssue = useCallback((id: string): Issue | null => {
    for (const col of columns) {
      const found = col.issues.find((i) => i.id === id);
      if (found) return found;
    }
    return null;
  }, [columns]);

  const handleSave = useCallback(async (issueId: string, updates: UpdateIssueInput) => {
    try {
      if (updates.status === 'closed') {
        await store.closeIssue(issueId);
      } else {
        const currentIssue = findIssue(issueId);
        if (currentIssue?.status === 'closed' && updates.status != null) {
          const { status: reopenStatus, ...rest } = updates;
          await store.reopenIssue(issueId, reopenStatus as 'open' | 'in_progress');
          if (Object.keys(rest).length > 0) {
            await store.updateIssue(issueId, rest);
          }
        } else {
          await store.updateIssue(issueId, updates);
        }
      }
    } finally {
      refresh();
    }
  }, [store, findIssue, refresh]);

  const handleNavigate = useCallback(
    (action: NavigateAction) => dispatch(action),
    [],
  );

  const handleSelect = useCallback(
    (issueId: string) => dispatch({ type: 'select', issueId }),
    [],
  );

  // Reserve 1 row for status bar
  const contentHeight = Math.max(terminalHeight - 1, 1);

  // Loading state
  if (refreshState === 'loading') {
    return (
      <Box flexDirection="column" width={terminalWidth} height={terminalHeight}>
        <Box flexGrow={1} justifyContent="center" alignItems="center">
          <Text>Loading…</Text>
        </Box>
        <StatusBar viewMode="loading" />
      </Box>
    );
  }

  // Error on initial load (no data yet)
  if (refreshState === 'error' && columns.length === 0) {
    return (
      <Box flexDirection="column" width={terminalWidth} height={terminalHeight}>
        <Box flexGrow={1} justifyContent="center" alignItems="center" flexDirection="column">
          <Text color="red" bold>Failed to load board</Text>
          <Text dimColor>{error}</Text>
        </Box>
        <StatusBar viewMode="loading" {...(error != null ? { error } : {})} />
      </Box>
    );
  }

  // Detail view
  if (effectiveViewMode === 'detail' && nav.selectedIssueId) {
    return (
      <DetailView
        store={store}
        issueId={nav.selectedIssueId}
        pollIntervalMs={pollIntervalMs}
        terminalWidth={terminalWidth}
        terminalHeight={terminalHeight}
        boardError={error}
        refreshing={refreshState === 'refreshing'}
        onBack={() => dispatch({ type: 'escape' })}
        onTree={() => dispatch({ type: 'view-tree' })}
      />
    );
  }

  // Tree view
  if (effectiveViewMode === 'tree' && nav.selectedIssueId) {
    return (
      <TreeView
        store={store}
        issueId={nav.selectedIssueId}
        direction={nav.treeDirection}
        terminalWidth={terminalWidth}
        terminalHeight={terminalHeight}
        boardError={error}
        refreshing={refreshState === 'refreshing'}
        onBack={() => dispatch({ type: 'escape' })}
        onToggleDirection={() => dispatch({ type: 'toggle-tree-direction' })}
      />
    );
  }

  // Edit view
  if (effectiveViewMode === 'editing' && nav.selectedIssueId) {
    const editIssue = findIssue(nav.selectedIssueId);
    if (editIssue) {
      return (
        <Box flexDirection="column" width={terminalWidth} height={terminalHeight}>
          <Box flexGrow={1}>
            <EditScreen
              issue={editIssue}
              terminalWidth={terminalWidth}
              terminalHeight={contentHeight}
              onSave={(updates) => {
                void handleSave(nav.selectedIssueId!, updates);
                dispatch({ type: 'cancel-edit' });
              }}
              onCancel={() => dispatch({ type: 'cancel-edit' })}
            />
          </Box>
          <StatusBar viewMode="editing" {...(error != null ? { error } : {})} refreshing={refreshState === 'refreshing'} />
        </Box>
      );
    }
  }

  // Board view (default)
  return (
    <Box flexDirection="column" width={terminalWidth} height={terminalHeight}>
      <Box flexGrow={1}>
        <BoardScreen
          columns={columns}
          selected={effectiveSelected}
          focusedColumnIndex={nav.focusedColumnIndex}
          terminalWidth={terminalWidth}
          terminalHeight={contentHeight}
          onNavigate={handleNavigate}
          onSelect={handleSelect}
        />
      </Box>
      <StatusBar viewMode="board" {...(error != null ? { error } : {})} refreshing={refreshState === 'refreshing'} />
    </Box>
  );
}

// ── Detail view wrapper (hooks must be called unconditionally) ──

interface DetailViewProps {
  store: AppProps['store'];
  issueId: string;
  pollIntervalMs?: number | undefined;
  terminalWidth: number;
  terminalHeight: number;
  boardError: string | undefined;
  refreshing: boolean;
  onBack: () => void;
  onTree: () => void;
}

function DetailView({
  store,
  issueId,
  pollIntervalMs,
  terminalWidth,
  terminalHeight,
  boardError,
  refreshing,
  onBack,
  onTree,
}: DetailViewProps): React.ReactElement {
  const { detail, loadState, error: detailError } = useIssueDetail({
    store,
    issueId,
    pollIntervalMs,
  });

  // Reserve 1 row for status bar
  const contentHeight = Math.max(terminalHeight - 1, 1);

  return (
    <Box flexDirection="column" width={terminalWidth} height={terminalHeight}>
      <Box flexGrow={1}>
        <DetailScreen
          detail={detail}
          loadState={loadState}
          error={detailError}
          terminalWidth={terminalWidth}
          terminalHeight={contentHeight}
          onBack={onBack}
          onTree={onTree}
        />
      </Box>
      <StatusBar viewMode="detail" {...(boardError != null ? { error: boardError } : {})} refreshing={refreshing} />
    </Box>
  );
}

// ── Tree view wrapper ──────────────────────────────────────

interface TreeViewProps {
  store: AppProps['store'];
  issueId: string;
  direction: TreeDirection;
  terminalWidth: number;
  terminalHeight: number;
  boardError: string | undefined;
  refreshing: boolean;
  onBack: () => void;
  onToggleDirection: () => void;
}

function TreeView({
  store,
  issueId,
  direction,
  terminalWidth,
  terminalHeight,
  boardError,
  refreshing,
  onBack,
  onToggleDirection,
}: TreeViewProps): React.ReactElement {
  const { rootIssue, flatNodes, loading } = useTreeData({
    store,
    issueId,
    direction,
  });

  // Reserve 1 row for status bar
  const contentHeight = Math.max(terminalHeight - 1, 1);

  return (
    <Box flexDirection="column" width={terminalWidth} height={terminalHeight}>
      <Box flexGrow={1}>
        <TreeScreen
          rootIssue={rootIssue}
          flatNodes={flatNodes}
          loading={loading}
          direction={direction}
          terminalWidth={terminalWidth}
          terminalHeight={contentHeight}
          onBack={onBack}
          onToggleDirection={onToggleDirection}
        />
      </Box>
      <StatusBar viewMode="tree" {...(boardError != null ? { error: boardError } : {})} refreshing={refreshing} />
    </Box>
  );
}
