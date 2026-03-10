import type { Issue, Status } from '@saliagadotcom/boards-core';
import type { StatusColumn } from './types.js';

const CANONICAL_ORDER: Status[] = ['open', 'in_progress', 'blocked', 'deferred', 'closed'];

function compareIssues(a: Issue, b: Issue): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.updated_at !== b.updated_at) return a.updated_at > b.updated_at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function deriveStatusColumns(issues: Issue[]): StatusColumn[] {
  const grouped = new Map<Status, Issue[]>();

  for (const issue of issues) {
    let group = grouped.get(issue.status);
    if (!group) {
      group = [];
      grouped.set(issue.status, group);
    }
    group.push(issue);
  }

  const columns: StatusColumn[] = [];

  for (const status of CANONICAL_ORDER) {
    const group = grouped.get(status);
    if (group && group.length > 0) {
      columns.push({ status, issues: group.sort(compareIssues) });
    }
  }

  return columns;
}
