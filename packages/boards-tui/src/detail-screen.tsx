import React, { useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { DependencyWithIssue, Issue, IssueDetail, Status } from '@saliagadotcom/boards-core';
import type { DetailLoadState } from './use-issue-detail.js';
import { MIN_TWO_COLUMN_WIDTH } from './types.js';

export interface DetailScreenProps {
  detail: IssueDetail | null;
  loadState: DetailLoadState;
  error: string | undefined;
  terminalWidth: number;
  terminalHeight: number;
  onBack: () => void;
  onTree: () => void;
}

const STATUS_LABELS: Record<Status, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  closed: 'Closed',
  deferred: 'Deferred',
  blocked: 'Blocked',
};

const TYPE_SHORT: Record<string, string> = {
  task: 'TSK',
  bug: 'BUG',
  feature: 'FTR',
  epic: 'EPC',
  chore: 'CHR',
};

function em(value: string): string {
  return value === '' ? '—' : value;
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

export function DetailScreen({
  detail,
  loadState,
  error,
  terminalWidth,
  terminalHeight,
  onBack,
  onTree,
}: DetailScreenProps): React.ReactElement {
  const [scrollOffset, setScrollOffset] = React.useState(0);

  // Reset scroll when issue changes
  React.useEffect(() => {
    setScrollOffset(0);
  }, [detail?.issue.id]);

  useInput((input, key) => {
    if (key.escape) {
      onBack();
    } else if (input === 't') {
      onTree();
    } else if (input === 'j' || key.downArrow) {
      setScrollOffset((prev) => prev + 1);
    } else if (input === 'k' || key.upArrow) {
      setScrollOffset((prev) => Math.max(0, prev - 1));
    }
  });

  if (loadState === 'loading') {
    return (
      <Box justifyContent="center" alignItems="center" flexGrow={1}>
        <Text>Loading issue…</Text>
      </Box>
    );
  }

  if (loadState === 'not-found') {
    return (
      <Box justifyContent="center" alignItems="center" flexGrow={1} flexDirection="column">
        <Text color="red" bold>Issue not found</Text>
        <Text dimColor>Press Escape to go back</Text>
      </Box>
    );
  }

  if (loadState === 'error' || !detail) {
    return (
      <Box justifyContent="center" alignItems="center" flexGrow={1} flexDirection="column">
        <Text color="red" bold>Error loading issue</Text>
        {error && <Text dimColor>{error}</Text>}
        <Text dimColor>Press Escape to go back</Text>
      </Box>
    );
  }

  const { issue } = detail;
  const twoColumn = terminalWidth >= MIN_TWO_COLUMN_WIDTH;

  const headerType = TYPE_SHORT[issue.issue_type] ?? issue.issue_type.toUpperCase();
  const header = `[${headerType}][P${issue.priority}][${issue.id}] ${issue.title}`;

  // Build left-column content lines
  const leftLines = buildLeftLines(issue);

  // Build right-column content lines
  const rightLines = buildRightLines(issue, detail.dependencies, detail.dependents);

  // Reserve 1 for header
  const bodyHeight = Math.max(terminalHeight - 1, 1);

  if (twoColumn) {
    const leftWidth = Math.floor(terminalWidth * 0.6);
    const rightWidth = terminalWidth - leftWidth;

    const clampedScroll = Math.max(0, Math.min(scrollOffset, Math.max(leftLines.length - bodyHeight, 0)));
    const visibleLeft = leftLines.slice(clampedScroll, clampedScroll + bodyHeight);
    const scrollPct = leftLines.length <= bodyHeight
      ? 100
      : Math.round(((clampedScroll + bodyHeight) / leftLines.length) * 100);

    return (
      <Box flexDirection="column" width={terminalWidth}>
        <Header text={header} scrollPct={scrollPct} width={terminalWidth} />
        <Box flexDirection="row" height={bodyHeight}>
          <Box flexDirection="column" width={leftWidth}>
            {visibleLeft.map((line, idx) => (
              <Text key={idx} wrap="truncate">{line}</Text>
            ))}
          </Box>
          <Box flexDirection="column" width={rightWidth}>
            {rightLines.map((line, idx) => (
              <Text key={idx} wrap="truncate">{line}</Text>
            ))}
          </Box>
        </Box>
      </Box>
    );
  }

  // Single-column fallback: all lines merged
  const allLines = [...leftLines, '', ...rightLines];
  const clampedScroll = Math.max(0, Math.min(scrollOffset, Math.max(allLines.length - bodyHeight, 0)));
  const visibleLines = allLines.slice(clampedScroll, clampedScroll + bodyHeight);
  const scrollPct = allLines.length <= bodyHeight
    ? 100
    : Math.round(((clampedScroll + bodyHeight) / allLines.length) * 100);

  return (
    <Box flexDirection="column" width={terminalWidth}>
      <Header text={header} scrollPct={scrollPct} width={terminalWidth} />
      <Box flexDirection="column" height={bodyHeight}>
        {visibleLines.map((line, idx) => (
          <Text key={idx} wrap="truncate">{line}</Text>
        ))}
      </Box>
    </Box>
  );
}

// ── Sub-components ─────────────────────────────────────────

function Header({ text, scrollPct, width }: { text: string; scrollPct: number; width: number }): React.ReactElement {
  const pctStr = ` ${scrollPct}%`;
  const available = width - pctStr.length;
  const truncated = text.length > available ? text.slice(0, available - 1) + '…' : text;

  return (
    <Box>
      <Box flexGrow={1}>
        <Text bold inverse>{` ${truncated} `}</Text>
      </Box>
      <Text dimColor>{pctStr}</Text>
    </Box>
  );
}

// ── Content builders (pure) ────────────────────────────────

export function buildLeftLines(issue: Issue): string[] {
  const lines: string[] = [];

  const pushSection = (heading: string, value: string): void => {
    lines.push(heading);
    const text = value === '' ? '—' : value;
    for (const line of text.split('\n')) {
      lines.push(line);
    }
    lines.push('');
  };

  pushSection('── Description ──', issue.description);
  pushSection('── Design ──', issue.design);
  pushSection('── Acceptance Criteria ──', issue.acceptance_criteria);
  pushSection('── Notes ──', issue.notes);

  return lines;
}

export function buildRightLines(
  issue: Issue,
  dependencies: DependencyWithIssue[],
  dependents: DependencyWithIssue[],
): string[] {
  const lines: string[] = [];

  lines.push('── Metadata ──');
  lines.push(`  Status:   ${STATUS_LABELS[issue.status]}`);
  lines.push(`  Priority: P${issue.priority}`);
  lines.push(`  Type:     ${issue.issue_type}`);
  lines.push(`  Assignee: ${em(issue.assignee)}`);
  lines.push(`  Owner:    ${em(issue.owner)}`);
  lines.push(`  Board:    ${issue.board}`);
  lines.push(`  Labels:   ${issue.labels.length > 0 ? issue.labels.join(', ') : '—'}`);
  lines.push(`  Created:  ${formatDate(issue.created_at)}`);
  lines.push(`  Updated:  ${formatDate(issue.updated_at)}`);
  if (issue.closed_at != null) {
    lines.push(`  Closed:   ${formatDate(issue.closed_at)}`);
    lines.push(`  Reason:   ${em(issue.close_reason)}`);
  }

  lines.push('');
  lines.push('── Blocked by ──');
  if (dependencies.length === 0) {
    lines.push('  (none)');
  } else {
    for (const dep of dependencies) {
      lines.push(`  ${dep.issue.id} ${dep.issue.title} [${dep.type}]`);
    }
  }

  lines.push('');
  lines.push('── Blocks ──');
  if (dependents.length === 0) {
    lines.push('  (none)');
  } else {
    for (const dep of dependents) {
      lines.push(`  ${dep.issue.id} ${dep.issue.title} [${dep.type}]`);
    }
  }

  return lines;
}
