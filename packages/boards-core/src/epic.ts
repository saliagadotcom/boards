// Epic lifecycle management
import type { Kysely } from 'kysely';
import type { Database } from './schema.js';
import type { EpicStatus } from './types.js';
import { rowToIssue, fetchLabelsForIssues } from './shared.js';

export async function getEpicsEligibleForClosure(
  db: Kysely<Database>,
  board: string,
): Promise<EpicStatus[]> {
  // Step 1: Find open epics on this board
  const epicRows = await db
    .selectFrom('issues')
    .selectAll()
    .where('board', '=', board)
    .where('issue_type', '=', 'epic')
    .where('status', '!=', 'closed')
    .execute();

  if (epicRows.length === 0) {
    return [];
  }

  const epicIds = epicRows.map((r) => r.id);
  const epicLabelsMap = await fetchLabelsForIssues(db, epicIds);

  // Step 2: Find parent-child dependencies where these epics are the parent
  // Convention: epic is issue_id, child is depends_on_id
  const deps = await db
    .selectFrom('dependencies')
    .select(['issue_id', 'depends_on_id'])
    .where('type', '=', 'parent-child')
    .where('issue_id', 'in', epicIds)
    .execute();

  // Map: epicId -> childIds
  const childMap = new Map<string, string[]>();
  for (const dep of deps) {
    const children = childMap.get(dep.issue_id) ?? [];
    children.push(dep.depends_on_id);
    childMap.set(dep.issue_id, children);
  }

  // Step 3: Get statuses for all child issues
  const allChildIds = [...new Set(deps.map((d) => d.depends_on_id))];
  const childStatusMap = new Map<string, string>();

  if (allChildIds.length > 0) {
    const childRows = await db
      .selectFrom('issues')
      .select(['id', 'status'])
      .where('id', 'in', allChildIds)
      .execute();

    for (const row of childRows) {
      childStatusMap.set(row.id, row.status);
    }
  }

  // Step 4: Build results
  const results: EpicStatus[] = [];
  for (const epicRow of epicRows) {
    const children = childMap.get(epicRow.id) ?? [];
    if (children.length === 0) {
      continue;
    }

    const totalChildren = children.length;
    let closedChildren = 0;
    for (const childId of children) {
      if (childStatusMap.get(childId) === 'closed') {
        closedChildren++;
      }
    }

    results.push({
      epic: rowToIssue(epicRow, epicLabelsMap.get(epicRow.id) ?? []),
      totalChildren,
      closedChildren,
      eligibleForClose: totalChildren > 0 && totalChildren === closedChildren,
    });
  }

  return results;
}
