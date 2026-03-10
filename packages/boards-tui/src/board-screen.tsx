import React, { useCallback, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Issue, Status } from '@saliagadotcom/boards-core';
import type { LayoutMode, SelectedIssueByStatus, StatusColumn } from './types.js';
import { calculateLayoutMode } from './layout.js';
import { Column } from './column.js';

export interface BoardScreenProps {
  columns: StatusColumn[];
  selected: SelectedIssueByStatus;
  focusedColumnIndex: number;
  terminalWidth: number;
  terminalHeight: number;
  onNavigate: (action: NavigateAction) => void;
  onSelect: (issueId: string) => void;
}

export type NavigateAction =
  | { type: 'column'; direction: -1 | 1 }
  | { type: 'issue'; direction: -1 | 1 };

export function BoardScreen({
  columns,
  selected,
  focusedColumnIndex,
  terminalWidth,
  terminalHeight,
  onNavigate,
  onSelect,
}: BoardScreenProps): React.ReactElement {
  const layoutMode = useMemo(
    () => calculateLayoutMode(terminalWidth, terminalHeight, columns.length),
    [terminalWidth, terminalHeight, columns.length],
  );

  useInput((input, key) => {
    if (input === 'h' || key.leftArrow) {
      onNavigate({ type: 'column', direction: -1 });
    } else if (input === 'l' || key.rightArrow) {
      onNavigate({ type: 'column', direction: 1 });
    } else if (input === 'j' || key.downArrow) {
      onNavigate({ type: 'issue', direction: 1 });
    } else if (input === 'k' || key.upArrow) {
      onNavigate({ type: 'issue', direction: -1 });
    } else if (key.return) {
      const col = columns[focusedColumnIndex];
      const selectedId = col ? selected[col.status] : undefined;
      if (selectedId) onSelect(selectedId);
    }
  });

  if (columns.length === 0) {
    return <EmptyBoard terminalWidth={terminalWidth} terminalHeight={terminalHeight} />;
  }

  if (layoutMode === 'too-small') {
    return <TooSmall />;
  }

  if (layoutMode === 'focused') {
    return (
      <FocusedLayout
        columns={columns}
        selected={selected}
        focusedColumnIndex={focusedColumnIndex}
        terminalWidth={terminalWidth}
        terminalHeight={terminalHeight}
      />
    );
  }

  return (
    <MultiColumnLayout
      columns={columns}
      selected={selected}
      focusedColumnIndex={focusedColumnIndex}
      terminalWidth={terminalWidth}
      terminalHeight={terminalHeight}
    />
  );
}

// ── Sub-components ─────────────────────────────────────────

function TooSmall(): React.ReactElement {
  return (
    <Box justifyContent="center" alignItems="center" flexGrow={1}>
      <Text>Terminal too small</Text>
    </Box>
  );
}

function EmptyBoard({
  terminalWidth,
  terminalHeight,
}: {
  terminalWidth: number;
  terminalHeight: number;
}): React.ReactElement {
  return (
    <Box
      justifyContent="center"
      alignItems="center"
      width={terminalWidth}
      height={terminalHeight}
      flexDirection="column"
    >
      <Text bold>No issues found</Text>
      <Text dimColor>Create issues with: bd create &quot;title&quot;</Text>
    </Box>
  );
}

interface LayoutProps {
  columns: StatusColumn[];
  selected: SelectedIssueByStatus;
  focusedColumnIndex: number;
  terminalWidth: number;
  terminalHeight: number;
}

function MultiColumnLayout({
  columns,
  selected,
  focusedColumnIndex,
  terminalWidth,
  terminalHeight,
}: LayoutProps): React.ReactElement {
  const columnWidth = Math.floor(terminalWidth / columns.length);

  return (
    <Box flexDirection="row" width={terminalWidth}>
      {columns.map((col, idx) => (
        <Column
          key={col.status}
          status={col.status}
          issues={col.issues}
          selectedId={selected[col.status] ?? null}
          focused={idx === focusedColumnIndex}
          maxHeight={terminalHeight}
          maxWidth={columnWidth}
        />
      ))}
    </Box>
  );
}

function FocusedLayout({
  columns,
  selected,
  focusedColumnIndex,
  terminalWidth,
  terminalHeight,
}: LayoutProps): React.ReactElement {
  const col = columns[focusedColumnIndex];
  if (!col) return <TooSmall />;

  const header = `[column ${focusedColumnIndex + 1} of ${columns.length}]`;

  return (
    <Box flexDirection="column" width={terminalWidth}>
      <Box justifyContent="center">
        <Text dimColor>{header}</Text>
      </Box>
      <Column
        status={col.status}
        issues={col.issues}
        selectedId={selected[col.status] ?? null}
        focused
        maxHeight={terminalHeight - 1}
        maxWidth={terminalWidth}
      />
    </Box>
  );
}
