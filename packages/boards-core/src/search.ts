// Text search

import { sql, type Kysely } from 'kysely';
import type { Database } from './schema.js';
import type { Issue } from './types.js';
import { rowToIssue, fetchLabelsForIssues } from './shared.js';

function escapeLikePattern(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export async function searchIssues(
  db: Kysely<Database>,
  board: string,
  query: string,
): Promise<Issue[]> {
  const pattern = `%${escapeLikePattern(query.toLowerCase())}%`;

  const rows = await db
    .selectFrom('issues')
    .selectAll()
    .where('board', '=', board)
    .where((eb) =>
      eb.or([
        sql<boolean>`lower(title) LIKE ${pattern} ESCAPE '\\'`,
        sql<boolean>`lower(description) LIKE ${pattern} ESCAPE '\\'`,
      ]),
    )
    .orderBy('priority', 'asc')
    .orderBy('created_at', 'asc')
    .execute();

  const issueIds = rows.map((r) => r.id);
  if (issueIds.length === 0) return [];

  const labelMap = await fetchLabelsForIssues(db, issueIds);

  return rows.map((row) =>
    rowToIssue(row, labelMap.get(row.id) ?? []),
  );
}
