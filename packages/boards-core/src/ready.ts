// Ready work query
import type { Kysely } from 'kysely';
import type { Database } from './schema.js';
import type { Issue, ReadyWorkFilter } from './types.js';
import { rowToIssue, fetchLabelsForIssues } from './shared.js';

export async function readyWork(
  db: Kysely<Database>,
  board: string,
  filter?: ReadyWorkFilter,
): Promise<Issue[]> {
  let query = db
    .selectFrom('issues')
    .selectAll('issues')
    .where('issues.board', '=', board)
    .where('issues.status', 'in', ['open', 'in_progress'])
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom('dependencies')
            .innerJoin('issues as dep_issue', 'dep_issue.id', 'dependencies.depends_on_id')
            .select('dependencies.issue_id')
            .whereRef('dependencies.issue_id', '=', 'issues.id')
            .where('dependencies.type', 'in', ['blocks', 'conditional-blocks'])
            .where('dep_issue.status', '!=', 'closed'),
        ),
      ),
    )
    // Exclude children of blocked parents: if a parent (e.g. epic) is blocked,
    // its children should not appear as ready work.
    // Convention: parent-child deps store issue_id=parent, depends_on_id=child,
    // so a child is found where depends_on_id = issues.id.
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom('dependencies as pc')
            .innerJoin('dependencies as pb', (join) =>
              join
                .onRef('pb.issue_id', '=', 'pc.issue_id')
                .on('pb.type', 'in', ['blocks', 'conditional-blocks']),
            )
            .innerJoin('issues as blocker', 'blocker.id', 'pb.depends_on_id')
            .select('pc.depends_on_id')
            .whereRef('pc.depends_on_id', '=', 'issues.id')
            .where('pc.type', '=', 'parent-child')
            .where('blocker.status', '!=', 'closed'),
        ),
      ),
    );

  // Exclude epics from ready work by default — they are containers, not actionable work.
  // Use --type epic or include_epics to see them explicitly.
  if (filter?.issue_type !== 'epic' && !filter?.include_epics) {
    query = query.where('issues.issue_type', '!=', 'epic');
  }

  if (filter?.assignee) {
    query = query.where('issues.assignee', '=', filter.assignee);
  }
  if (filter?.unassigned) {
    query = query.where(({ or, eb }) =>
      or([eb('issues.assignee', 'is', null), eb('issues.assignee', '=', '')]),
    );
  }
  if (filter?.priority !== undefined) {
    query = query.where('issues.priority', '=', filter.priority);
  }
  if (filter?.issue_type) {
    query = query.where('issues.issue_type', '=', filter.issue_type);
  }
  if (filter?.label) {
    query = query
      .innerJoin('labels', 'labels.issue_id', 'issues.id')
      .where('labels.label', '=', filter.label);
  }

  query = query
    .orderBy('issues.priority', 'asc')
    .orderBy('issues.created_at', 'asc');

  const rows = await query.execute();

  const issueIds = rows.map((r) => r.id);
  const labelsMap = await fetchLabelsForIssues(db, issueIds);

  return rows.map((r) => rowToIssue(r, labelsMap.get(r.id) ?? []));
}
