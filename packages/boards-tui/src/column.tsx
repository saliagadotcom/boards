import React, { useMemo } from 'react';
import { Box, Text } from 'ink';
import type { Issue, Status } from '@saliagadotcom/boards-core';
import { IssueBadge } from './issue-badge.js';

export interface ColumnProps {
  status: Status;
  issues: Issue[];
  selectedId: string | null;
  focused: boolean;
  maxHeight: number;
  maxWidth?: number;
}

const STATUS_LABELS: Record<Status, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  closed: 'Closed',
  deferred: 'Deferred',
  blocked: 'Blocked',
};

/**
 * Calculate the visible window of issues given the viewport height.
 * The selected issue is kept visible by adjusting the scroll offset.
 */
export function calculateScroll(
  issueCount: number,
  selectedIndex: number,
  viewportHeight: number,
): { start: number; end: number } {
  if (issueCount <= viewportHeight) {
    return { start: 0, end: issueCount };
  }

  // Centre the selected item, clamping to bounds
  let start = selectedIndex - Math.floor(viewportHeight / 2);
  if (start < 0) start = 0;
  if (start + viewportHeight > issueCount) start = issueCount - viewportHeight;

  return { start, end: start + viewportHeight };
}

export function Column({
  status,
  issues,
  selectedId,
  focused,
  maxHeight,
  maxWidth,
}: ColumnProps): React.ReactElement {
  const selectedIndex = useMemo(
    () => issues.findIndex((i) => i.id === selectedId),
    [issues, selectedId],
  );

  // Reserve 1 row for the header
  const bodyHeight = Math.max(maxHeight - 1, 0);

  const { start, end } = useMemo(
    () => calculateScroll(issues.length, Math.max(selectedIndex, 0), bodyHeight),
    [issues.length, selectedIndex, bodyHeight],
  );

  const visibleIssues = issues.slice(start, end);
  const headerText = `${STATUS_LABELS[status]} (${issues.length})`;

  return (
    <Box flexDirection="column" width={maxWidth}>
      <Box>
        <Text bold inverse={focused}>
          {focused ? ` ${headerText} ` : ` ${headerText} `}
        </Text>
        {!focused && <Text dimColor>{' ─'.repeat(1)}</Text>}
      </Box>
      {visibleIssues.map((issue) => (
        <IssueBadge
          key={issue.id}
          issue={issue}
          selected={focused && issue.id === selectedId}
          {...(maxWidth != null ? { maxWidth } : {})}
        />
      ))}
      {issues.length === 0 && (
        <Text dimColor>  (empty)</Text>
      )}
    </Box>
  );
}
