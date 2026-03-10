import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { Issue, Status } from '@saliagadotcom/boards-core';
import type { TreeDirection, TreeNode } from './types.js';

export interface TreeScreenProps {
  rootIssue: Issue | null;
  flatNodes: TreeNode[];
  loading: boolean;
  direction: TreeDirection;
  terminalWidth: number;
  terminalHeight: number;
  onBack: () => void;
  onToggleDirection: () => void;
}

const statusIndicator: Record<Status, { symbol: string; color?: string }> = {
  open: { symbol: '○' },
  in_progress: { symbol: '●', color: 'blue' },
  closed: { symbol: '✓', color: 'green' },
  deferred: { symbol: '⏸', color: 'yellow' },
  blocked: { symbol: '⊘', color: 'red' },
};

export function TreeScreen({
  rootIssue,
  flatNodes,
  loading,
  direction,
  terminalWidth,
  terminalHeight,
  onBack,
  onToggleDirection,
}: TreeScreenProps): React.ReactElement {
  const [cursorIndex, setCursorIndex] = useState(0);

  useInput((input, key) => {
    if (key.escape) {
      onBack();
    } else if (input === 'd') {
      setCursorIndex(0);
      onToggleDirection();
    } else if (input === 'j' || key.downArrow) {
      setCursorIndex((prev) => Math.min(prev + 1, flatNodes.length - 1));
    } else if (input === 'k' || key.upArrow) {
      setCursorIndex((prev) => Math.max(0, prev - 1));
    }
  });

  if (loading) {
    return (
      <Box justifyContent="center" alignItems="center" flexGrow={1}>
        <Text>Loading tree…</Text>
      </Box>
    );
  }

  const dirLabel = direction === 'down' ? '▼ blocks' : '▲ blocked by';
  const headerText = rootIssue
    ? `${rootIssue.title} — ${dirLabel}`
    : dirLabel;

  // Reserve 1 for header
  const bodyHeight = Math.max(terminalHeight - 1, 1);

  if (flatNodes.length === 0) {
    return (
      <Box flexDirection="column" width={terminalWidth}>
        <TreeHeader text={headerText} width={terminalWidth} />
        <Box justifyContent="center" alignItems="center" flexGrow={1} flexDirection="column">
          <Text dimColor>No dependencies in this direction</Text>
          <Text dimColor>Press d to toggle direction</Text>
        </Box>
      </Box>
    );
  }

  // Scrolling: keep cursor visible
  const { start, end, aboveCount, belowCount } = calculateTreeScroll(
    flatNodes.length,
    cursorIndex,
    bodyHeight,
  );

  const visibleNodes = flatNodes.slice(start, end);
  const lines = renderTreeLines(visibleNodes, flatNodes, start, cursorIndex, terminalWidth);

  return (
    <Box flexDirection="column" width={terminalWidth}>
      <TreeHeader text={headerText} width={terminalWidth} />
      {aboveCount > 0 && (
        <Text dimColor>{`  ↑ ${aboveCount} more above`}</Text>
      )}
      {lines.map((line, idx) => (
        <Text key={idx} wrap="truncate">{line}</Text>
      ))}
      {belowCount > 0 && (
        <Text dimColor>{`  ↓ ${belowCount} more below`}</Text>
      )}
    </Box>
  );
}

// ── Sub-components ─────────────────────────────────────────

function TreeHeader({ text, width }: { text: string; width: number }): React.ReactElement {
  return (
    <Box width={width}>
      <Text bold inverse>{` ${text} `}</Text>
    </Box>
  );
}

// ── Pure rendering helpers ─────────────────────────────────

interface ScrollResult {
  start: number;
  end: number;
  aboveCount: number;
  belowCount: number;
}

export function calculateTreeScroll(
  nodeCount: number,
  cursorIndex: number,
  viewportHeight: number,
): ScrollResult {
  if (nodeCount <= viewportHeight) {
    return { start: 0, end: nodeCount, aboveCount: 0, belowCount: 0 };
  }

  let start = cursorIndex - Math.floor(viewportHeight / 2);
  if (start < 0) start = 0;
  if (start + viewportHeight > nodeCount) start = nodeCount - viewportHeight;

  const end = start + viewportHeight;
  return {
    start,
    end,
    aboveCount: start,
    belowCount: nodeCount - end,
  };
}

/**
 * Build branch-character prefix for a node.
 * Returns something like "  ├─ " or "  │  └─ " depending on depth and position.
 */
export function buildBranchPrefix(
  node: TreeNode,
  allNodes: TreeNode[],
  nodeIndex: number,
): string {
  if (node.depth === 0) return '';

  const parts: string[] = [];

  // Build guide characters for ancestor levels
  for (let d = 1; d < node.depth; d++) {
    // Check if there's a sibling at this depth level that comes after
    const hasMore = hasSiblingBelow(allNodes, nodeIndex, d);
    parts.push(hasMore ? '│  ' : '   ');
  }

  // Branch character for this node
  const isLast = isLastSibling(allNodes, nodeIndex, node.depth);
  parts.push(isLast ? '└─ ' : '├─ ');

  return parts.join('');
}

function hasSiblingBelow(allNodes: TreeNode[], currentIndex: number, depth: number): boolean {
  for (let i = currentIndex + 1; i < allNodes.length; i++) {
    if (allNodes[i]!.depth < depth) return false;
    if (allNodes[i]!.depth === depth) return true;
  }
  return false;
}

function isLastSibling(allNodes: TreeNode[], currentIndex: number, depth: number): boolean {
  for (let i = currentIndex + 1; i < allNodes.length; i++) {
    if (allNodes[i]!.depth < depth) return true;
    if (allNodes[i]!.depth === depth) return false;
  }
  return true;
}

export function renderNodeLine(
  node: TreeNode,
  allNodes: TreeNode[],
  globalIndex: number,
  isCursor: boolean,
  maxWidth: number,
): string {
  const cursor = isCursor ? '> ' : '  ';
  const branch = buildBranchPrefix(node, allNodes, globalIndex);
  const indicator = statusIndicator[node.issue.status];
  const priority = `[P${node.issue.priority}]`;
  const id = node.issue.id;

  const fixedPart = `${cursor}${branch}${indicator.symbol} ${priority} ${id} `;
  const available = maxWidth - fixedPart.length;

  let title = node.issue.title;
  if (available > 0 && title.length > available) {
    title = title.slice(0, available - 1) + '…';
  } else if (available <= 0) {
    title = '';
  }

  return `${cursor}${branch}${indicator.symbol} ${priority} ${id} ${title}`;
}

function renderTreeLines(
  visibleNodes: TreeNode[],
  allNodes: TreeNode[],
  startOffset: number,
  cursorIndex: number,
  maxWidth: number,
): string[] {
  return visibleNodes.map((node, idx) => {
    const globalIndex = startOffset + idx;
    return renderNodeLine(node, allNodes, globalIndex, globalIndex === cursorIndex, maxWidth);
  });
}
