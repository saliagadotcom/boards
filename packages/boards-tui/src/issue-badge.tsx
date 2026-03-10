import React from 'react';
import { Box, Text } from 'ink';
import type { Issue, Status } from '@saliagadotcom/boards-core';

export interface IssueBadgeProps {
  issue: Issue;
  selected?: boolean;
  maxWidth?: number;
}

const statusIndicator: Record<Status, { symbol: string; color?: string }> = {
  open: { symbol: '○' },
  in_progress: { symbol: '●', color: 'blue' },
  closed: { symbol: '✓', color: 'green' },
  deferred: { symbol: '⏸', color: 'yellow' },
  blocked: { symbol: '⊘', color: 'red' },
};

export function IssueBadge({ issue, selected = false, maxWidth }: IssueBadgeProps): React.ReactElement {
  const indicator = statusIndicator[issue.status];
  const cursor = selected ? '> ' : '  ';
  const priority = `[P${issue.priority}]`;

  // Calculate fixed-width prefix: cursor(2) + symbol(1) + space(1) + priority(4) + space(1) + id + space(1)
  const fixedWidth = 2 + 1 + 1 + priority.length + 1 + issue.id.length + 1;

  let title = issue.title;
  if (maxWidth != null) {
    const available = maxWidth - fixedWidth;
    if (available > 0 && title.length > available) {
      title = title.slice(0, available - 1) + '…';
    } else if (available <= 0) {
      title = '';
    }
  }

  return (
    <Box>
      <Text>{cursor}</Text>
      <Text {...(indicator.color != null ? { color: indicator.color } : {})}>{indicator.symbol}</Text>
      <Text> </Text>
      <Text dimColor>{priority}</Text>
      <Text> </Text>
      <Text dimColor>{issue.id}</Text>
      <Text> </Text>
      <Text>{title}</Text>
    </Box>
  );
}
