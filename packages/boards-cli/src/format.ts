// Human-readable output formatting

import type {
  Board,
  BoardWithCounts,
  DependencyWithIssue,
  Issue,
  IssueDetail,
  Status,
} from '@saliagadotcom/boards-core';

const STATUS_ICONS: Record<Status, string> = {
  open: '○',
  in_progress: '●',
  closed: '✓',
  deferred: '◇',
  blocked: '✗',
};

export function statusIcon(status: Status): string {
  return STATUS_ICONS[status];
}

export function priorityLabel(priority: number): string {
  const clamped = Math.max(0, Math.min(4, Math.round(priority)));
  return `P${clamped}`;
}

function isBoardWithCounts(board: Board | BoardWithCounts): board is BoardWithCounts {
  return 'open_count' in board;
}

export function formatBoard(board: Board | BoardWithCounts): string {
  const lines: string[] = [
    `Board: ${board.id}`,
    `Prefix: ${board.prefix}`,
    `Description: ${board.description}`,
  ];

  if (isBoardWithCounts(board)) {
    lines.push(
      `Issues: ${board.open_count} open, ${board.in_progress_count} in progress, ${board.closed_count} closed, ${board.deferred_count} deferred, ${board.blocked_count} blocked`,
    );
  }

  return lines.join('\n');
}

export function formatIssue(issue: Issue): string {
  const icon = statusIcon(issue.status);
  const prio = priorityLabel(issue.priority);
  let line = `  ${icon} [${prio}] ${issue.id}: ${issue.title} (${issue.issue_type})`;
  if (issue.assignee) {
    line += `  @${issue.assignee}`;
  }
  return line;
}

export function formatIssueDetail(detail: IssueDetail): string {
  const { issue } = detail;
  const lines: string[] = [
    `${statusIcon(issue.status)} ${issue.id}: ${issue.title}`,
    `Status: ${issue.status}`,
    `Priority: ${priorityLabel(issue.priority)}`,
    `Type: ${issue.issue_type}`,
    `Board: ${issue.board}`,
  ];

  if (issue.assignee) {
    lines.push(`Assignee: ${issue.assignee}`);
  }
  if (issue.owner) {
    lines.push(`Owner: ${issue.owner}`);
  }

  if (issue.description) {
    lines.push('', `Description:`, issue.description);
  }
  if (issue.design) {
    lines.push('', `Design:`, issue.design);
  }
  if (issue.acceptance_criteria) {
    lines.push('', `Acceptance Criteria:`, issue.acceptance_criteria);
  }
  if (issue.notes) {
    lines.push('', `Notes:`, issue.notes);
  }

  if (issue.labels.length > 0) {
    lines.push(`Labels: ${issue.labels.join(', ')}`);
  }

  if (detail.dependencies.length > 0) {
    lines.push('', 'Dependencies:');
    for (const dep of detail.dependencies) {
      lines.push(`  ${formatDependency(dep)}`);
    }
  }

  if (detail.dependents.length > 0) {
    lines.push('', 'Dependents:');
    for (const dep of detail.dependents) {
      lines.push(`  ${formatDependency(dep)}`);
    }
  }

  lines.push('', `Created: ${issue.created_at}`);
  lines.push(`Updated: ${issue.updated_at}`);
  if (issue.closed_at) {
    lines.push(`Closed: ${issue.closed_at}`);
  }

  return lines.join('\n');
}

export function formatIssueList(issues: Issue[]): string {
  if (issues.length === 0) return '';
  return issues.map(formatIssue).join('\n');
}

export function formatDependency(dep: DependencyWithIssue): string {
  const icon = statusIcon(dep.issue.status);
  return `→ ${icon} ${dep.issue.id}: ${dep.issue.title} (${dep.type})`;
}

export function formatConfig(
  config: { default_board: string | undefined; db_path: string; server: string | undefined; output: 'text' | 'json' },
  origins?: Map<string, string>,
): string {
  const lines: string[] = [];

  const entries: [string, string | undefined][] = [
    ['default_board', config.default_board],
    ['db_path', config.db_path],
    ['server', config.server],
    ['output', config.output],
  ];

  for (const [key, value] of entries) {
    const display = value ?? '(not set)';
    const origin = origins?.get(key);
    if (origin) {
      lines.push(`${key}: ${display} (${origin})`);
    } else {
      lines.push(`${key}: ${display}`);
    }
  }

  return lines.join('\n');
}
