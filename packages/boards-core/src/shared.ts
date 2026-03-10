import type { Kysely, Selectable } from 'kysely';
import type { Database, IssuesTable } from './schema.js';
import type { Issue } from './types.js';

export type IssueRow = Selectable<IssuesTable>;

export function rowToIssue(row: IssueRow, labels: string[]): Issue {
  return {
    id: row.id,
    board: row.board,
    title: row.title,
    description: row.description ?? '',
    design: row.design ?? '',
    acceptance_criteria: row.acceptance_criteria ?? '',
    notes: row.notes ?? '',
    status: row.status,
    priority: row.priority,
    issue_type: row.issue_type,
    assignee: row.assignee ?? '',
    owner: row.owner ?? '',
    created_at: row.created_at,
    updated_at: row.updated_at,
    closed_at: row.closed_at ?? null,
    close_reason: row.close_reason ?? '',
    resolution: (row as any).resolution ?? '',
    labels,
  };
}

export async function fetchLabelsForIssues(
  db: Kysely<Database>,
  issueIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (issueIds.length === 0) return map;

  const rows = await db
    .selectFrom('labels')
    .select(['issue_id', 'label'])
    .where('issue_id', 'in', issueIds)
    .orderBy('label', 'asc')
    .execute();

  for (const row of rows) {
    const existing = map.get(row.issue_id);
    if (existing) {
      existing.push(row.label);
    } else {
      map.set(row.issue_id, [row.label]);
    }
  }

  return map;
}
