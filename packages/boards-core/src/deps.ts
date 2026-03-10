// Dependencies + cycle detection
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from './schema.js';
import type { DependencyWithIssue, AddDependencyInput, DependencyType } from './types.js';
import { BoardsError, isUniqueViolation } from './errors.js';
import { rowToIssue, fetchLabelsForIssues } from './shared.js';

async function detectBlocksCycle(
  db: Kysely<Database>,
  startId: string,
  targetId: string,
): Promise<void> {
  const result = await sql<{ found: number }>`
    WITH RECURSIVE reachable(id) AS (
      SELECT depends_on_id FROM dependencies WHERE issue_id = ${startId} AND type IN ('blocks', 'conditional-blocks')
      UNION
      SELECT d.depends_on_id FROM dependencies d JOIN reachable r ON d.issue_id = r.id WHERE d.type IN ('blocks', 'conditional-blocks')
    )
    SELECT 1 AS found FROM reachable WHERE id = ${targetId} LIMIT 1
  `.execute(db);

  if (result.rows.length > 0) {
    throw new BoardsError('circular_dependency', 'Adding this dependency would create a cycle');
  }
}

export async function addDependency(
  db: Kysely<Database>,
  input: AddDependencyInput,
): Promise<void> {
  if (input.issue_id === input.depends_on_id) {
    throw new BoardsError('self_dependency', 'An issue cannot depend on itself');
  }

  await db.transaction().execute(async (trx) => {
    const [issue, dependsOn] = await Promise.all([
      trx.selectFrom('issues').selectAll().where('id', '=', input.issue_id).executeTakeFirst(),
      trx.selectFrom('issues').selectAll().where('id', '=', input.depends_on_id).executeTakeFirst(),
    ]);

    if (!issue) {
      throw new BoardsError('not_found', `Issue "${input.issue_id}" not found`);
    }
    if (!dependsOn) {
      throw new BoardsError('not_found', `Issue "${input.depends_on_id}" not found`);
    }

    if (issue.board !== dependsOn.board) {
      throw new BoardsError('cross_board', 'Dependencies must be between issues on the same board');
    }

    if (input.type === 'blocks' || input.type === 'conditional-blocks') {
      await detectBlocksCycle(trx, input.depends_on_id, input.issue_id);
    }

    try {
      await trx
        .insertInto('dependencies')
        .values({
          issue_id: input.issue_id,
          depends_on_id: input.depends_on_id,
          type: input.type,
          created_at: new Date().toISOString(),
          created_by: input.created_by ?? '',
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        })
        .execute();
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        throw new BoardsError('conflict', 'Dependency already exists');
      }
      throw err;
    }
  });
}

export async function removeDependency(
  db: Kysely<Database>,
  issueId: string,
  dependsOnId: string,
): Promise<void> {
  await db
    .deleteFrom('dependencies')
    .where('issue_id', '=', issueId)
    .where('depends_on_id', '=', dependsOnId)
    .execute();
}

export async function listDependencies(
  db: Kysely<Database>,
  issueId: string,
  direction: 'up' | 'down',
  type?: DependencyType,
): Promise<DependencyWithIssue[]> {
  const issueColumn = direction === 'down' ? 'dependencies.issue_id' : 'dependencies.depends_on_id';
  const joinColumn = direction === 'down' ? 'dependencies.depends_on_id' : 'dependencies.issue_id';

  let query = db
    .selectFrom('dependencies')
    .innerJoin('issues', 'issues.id', joinColumn)
    .selectAll('issues')
    .select(['dependencies.type', 'dependencies.created_at as dep_created_at', 'dependencies.created_by as dep_created_by', 'dependencies.metadata as dep_metadata'])
    .where(issueColumn, '=', issueId);

  if (type) {
    query = query.where('dependencies.type', '=', type);
  }

  const rows = await query.execute();

  const issueIds = rows.map((r) => r.id);
  const labelsMap = await fetchLabelsForIssues(db, issueIds);

  return rows.map((r) => ({
    issue: rowToIssue(r, labelsMap.get(r.id) ?? []),
    type: r.type,
    created_at: r.dep_created_at as string,
    created_by: (r as any).dep_created_by ?? '',
    metadata: (r as any).dep_metadata ? JSON.parse((r as any).dep_metadata as string) : null,
  }));
}
