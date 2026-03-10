import type { Kysely, Updateable } from 'kysely';
import type { Database, IssuesTable } from './schema.js';
import type {
  Issue,
  IssueDetail,
  IssueType,
  DependencyWithIssue,
  CreateIssueInput,
  UpdateIssueInput,
  ListIssuesFilter,
  Status,
} from './types.js';
import { BoardsError, isUniqueViolation } from './errors.js';
import { generateId } from './id.js';
import { rowToIssue, fetchLabelsForIssues } from './shared.js';
import { listComments } from './comments.js';

const VALID_ISSUE_TYPES = new Set(['task', 'bug', 'feature', 'epic', 'chore']);
const ISSUE_ID_REGEX = /^[a-z0-9]+-[a-z0-9]+$/;

function clampPriority(value: number): number {
  return Math.max(0, Math.min(4, value));
}

function validateIssueType(type: string): void {
  if (!VALID_ISSUE_TYPES.has(type)) {
    throw new BoardsError('invalid_request', `Invalid issue type: "${type}"`);
  }
}

async function insertAndReturnIssue(
  db: Kysely<Database>,
  id: string,
  input: CreateIssueInput,
  boardId: string,
): Promise<Issue> {
  const now = new Date().toISOString();
  const priority = input.priority !== undefined ? clampPriority(input.priority) : 1;
  const issueType = input.issue_type ?? 'task';

  if (input.issue_type !== undefined) {
    validateIssueType(input.issue_type);
  }

  const labels = input.labels ?? [];

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('issues')
      .values({
        id,
        board: boardId,
        title: input.title,
        description: input.description ?? '',
        design: input.design ?? '',
        acceptance_criteria: input.acceptance_criteria ?? '',
        notes: input.notes ?? '',
        status: 'open',
        priority,
        issue_type: issueType,
        assignee: input.assignee ?? '',
        owner: input.owner ?? '',
        created_at: now,
        updated_at: now,
        closed_at: null,
        close_reason: '',
        resolution: '',
      })
      .execute();

    if (labels.length > 0) {
      await trx
        .insertInto('labels')
        .values(labels.map((label) => ({ issue_id: id, label })))
        .execute();
    }
  });

  return {
    id,
    board: boardId,
    title: input.title,
    description: input.description ?? '',
    design: input.design ?? '',
    acceptance_criteria: input.acceptance_criteria ?? '',
    notes: input.notes ?? '',
    status: 'open',
    priority,
    issue_type: issueType as IssueType,
    assignee: input.assignee ?? '',
    owner: input.owner ?? '',
    created_at: now,
    updated_at: now,
    closed_at: null,
    close_reason: '',
    resolution: '' as any,
    labels,
  };
}

export async function createIssue(
  db: Kysely<Database>,
  input: CreateIssueInput,
): Promise<Issue> {
  if (!input.title || input.title.trim() === '') {
    throw new BoardsError('invalid_request', 'Title is required');
  }

  const board = await db
    .selectFrom('boards')
    .select(['id', 'prefix'])
    .where('id', '=', input.board)
    .executeTakeFirst();

  if (!board) {
    throw new BoardsError('not_found', `Board "${input.board}" not found`);
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const id = generateId(board.prefix);
    try {
      return await insertAndReturnIssue(db, id, input, board.id);
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        if (attempt === 2) throw err;
        continue;
      }
      throw err;
    }
  }

  throw new BoardsError('internal_error', 'Failed to generate unique ID after 3 attempts');
}

export async function createIssueWithId(
  db: Kysely<Database>,
  id: string,
  input: CreateIssueInput,
): Promise<Issue> {
  if (!ISSUE_ID_REGEX.test(id)) {
    throw new BoardsError('invalid_request', `Invalid issue ID format: "${id}"`);
  }

  if (!input.title || input.title.trim() === '') {
    throw new BoardsError('invalid_request', 'Title is required');
  }

  const board = await db
    .selectFrom('boards')
    .select('id')
    .where('id', '=', input.board)
    .executeTakeFirst();

  if (!board) {
    throw new BoardsError('not_found', `Board "${input.board}" not found`);
  }

  return insertAndReturnIssue(db, id, input, board.id);
}

export async function showIssue(
  db: Kysely<Database>,
  id: string,
): Promise<IssueDetail> {
  const row = await db
    .selectFrom('issues')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();

  if (!row) {
    throw new BoardsError('not_found', `Issue "${id}" not found`);
  }

  const labelsMap = await fetchLabelsForIssues(db, [id]);
  const issue = rowToIssue(row, labelsMap.get(id) ?? []);

  // Fetch dependencies (issues this one depends on)
  const depRows = await db
    .selectFrom('dependencies')
    .innerJoin('issues', 'issues.id', 'dependencies.depends_on_id')
    .selectAll('issues')
    .select(['dependencies.type', 'dependencies.created_at as dep_created_at', 'dependencies.created_by as dep_created_by', 'dependencies.metadata as dep_metadata'])
    .where('dependencies.issue_id', '=', id)
    .execute();

  const depIssueIds = depRows.map((r) => r.id);
  const depLabelsMap = await fetchLabelsForIssues(db, depIssueIds);

  const dependencies: DependencyWithIssue[] = depRows.map((r) => ({
    issue: rowToIssue(r, depLabelsMap.get(r.id) ?? []),
    type: r.type,
    created_at: r.dep_created_at as string,
    created_by: ((r as any).dep_created_by as string) ?? '',
    metadata: (r as any).dep_metadata ? JSON.parse((r as any).dep_metadata as string) : null,
  }));

  // Fetch dependents (issues that depend on this one)
  const dntRows = await db
    .selectFrom('dependencies')
    .innerJoin('issues', 'issues.id', 'dependencies.issue_id')
    .selectAll('issues')
    .select(['dependencies.type', 'dependencies.created_at as dep_created_at', 'dependencies.created_by as dep_created_by', 'dependencies.metadata as dep_metadata'])
    .where('dependencies.depends_on_id', '=', id)
    .execute();

  const dntIssueIds = dntRows.map((r) => r.id);
  const dntLabelsMap = await fetchLabelsForIssues(db, dntIssueIds);

  const dependents: DependencyWithIssue[] = dntRows.map((r) => ({
    issue: rowToIssue(r, dntLabelsMap.get(r.id) ?? []),
    type: r.type,
    created_at: r.dep_created_at as string,
    created_by: ((r as any).dep_created_by as string) ?? '',
    metadata: (r as any).dep_metadata ? JSON.parse((r as any).dep_metadata as string) : null,
  }));

  const comments = await listComments(db, id);

  return { issue, dependencies, dependents, comments };
}

export async function listIssues(
  db: Kysely<Database>,
  board: string,
  filter?: ListIssuesFilter,
): Promise<Issue[]> {
  let query = db
    .selectFrom('issues')
    .selectAll('issues')
    .where('issues.board', '=', board);

  if (filter?.status) {
    query = query.where('issues.status', '=', filter.status);
  }
  if (filter?.priority !== undefined) {
    query = query.where('issues.priority', '=', filter.priority);
  }
  if (filter?.issue_type) {
    query = query.where('issues.issue_type', '=', filter.issue_type);
  }
  if (filter?.assignee) {
    query = query.where('issues.assignee', '=', filter.assignee);
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

export async function updateIssue(
  db: Kysely<Database>,
  id: string,
  input: UpdateIssueInput,
): Promise<Issue> {
  const existing = await db
    .selectFrom('issues')
    .select(['id', 'status'])
    .where('id', '=', id)
    .executeTakeFirst();

  if (!existing) {
    throw new BoardsError('not_found', `Issue "${id}" not found`);
  }

  if (input.title !== undefined && input.title.trim() === '') {
    throw new BoardsError('invalid_request', 'Title cannot be empty');
  }

  const now = new Date().toISOString();
  const updates: Updateable<IssuesTable> = { updated_at: now };

  if (input.title !== undefined) updates.title = input.title;
  if (input.description !== undefined) updates.description = input.description;
  if (input.design !== undefined) updates.design = input.design;
  if (input.acceptance_criteria !== undefined) updates.acceptance_criteria = input.acceptance_criteria;
  if (input.notes !== undefined) updates.notes = input.notes;
  if (input.assignee !== undefined) updates.assignee = input.assignee;
  if (input.owner !== undefined) updates.owner = input.owner;

  if (input.priority !== undefined) {
    updates.priority = clampPriority(input.priority);
  }

  if (input.issue_type !== undefined) {
    validateIssueType(input.issue_type);
    updates.issue_type = input.issue_type;
  }

  // Status transition validation
  if (input.status !== undefined && input.status !== existing.status) {
    const from = existing.status;
    const to = input.status;

    updates.status = to;

    if (to === 'closed') {
      updates.closed_at = now;
    } else if (from === 'closed') {
      updates.closed_at = null;
      updates.close_reason = '';
    }
  }

  const updated = await db.transaction().execute(async (trx) => {
    const row = await trx
      .updateTable('issues')
      .set(updates)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();

    // Replace labels if provided
    if (input.labels !== undefined) {
      await trx.deleteFrom('labels').where('issue_id', '=', id).execute();
      if (input.labels.length > 0) {
        await trx
          .insertInto('labels')
          .values(input.labels.map((label) => ({ issue_id: id, label })))
          .execute();
      }
    }

    return row;
  });

  const labelsMap = await fetchLabelsForIssues(db, [id]);
  return rowToIssue(updated, labelsMap.get(id) ?? []);
}

export async function closeIssue(
  db: Kysely<Database>,
  id: string,
  reason?: string,
  resolution?: string,
): Promise<Issue> {
  const existing = await db
    .selectFrom('issues')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();

  if (!existing) {
    throw new BoardsError('not_found', `Issue "${id}" not found`);
  }

  // Idempotent: if already closed, return as-is
  if (existing.status === 'closed') {
    const labelsMap = await fetchLabelsForIssues(db, [id]);
    return rowToIssue(existing, labelsMap.get(id) ?? []);
  }

  const now = new Date().toISOString();

  const updated = await db
    .updateTable('issues')
    .set({
      status: 'closed',
      closed_at: now,
      close_reason: reason ?? '',
      resolution: resolution ?? 'completed',
      updated_at: now,
    })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();

  const effectiveResolution = resolution || 'completed';
  const conditionalDeps = await db
    .selectFrom('dependencies')
    .select(['issue_id'])
    .where('depends_on_id', '=', id)
    .where('type', '=', 'conditional-blocks')
    .execute();

  if (conditionalDeps.length > 0) {
    const depIssueIds = conditionalDeps.map((d) => d.issue_id);
    const isFailure = ['failed', 'rejected', 'canceled'].includes(effectiveResolution);

    if (isFailure) {
      await db
        .deleteFrom('dependencies')
        .where('depends_on_id', '=', id)
        .where('type', '=', 'conditional-blocks')
        .execute();
    } else {
      await db
        .updateTable('issues')
        .set({
          status: 'closed',
          closed_at: now,
          close_reason: `Auto-closed: ${id} completed successfully`,
          resolution: 'completed',
          updated_at: now,
        })
        .where('id', 'in', depIssueIds)
        .where('status', '!=', 'closed')
        .execute();
    }
  }

  const labelsMap = await fetchLabelsForIssues(db, [id]);
  return rowToIssue(updated, labelsMap.get(id) ?? []);
}

export async function createIssueWithParent(
  db: Kysely<Database>,
  input: CreateIssueInput,
  parentId: string,
): Promise<Issue> {
  if (!input.title || input.title.trim() === '') {
    throw new BoardsError('invalid_request', 'Title is required');
  }

  const board = await db
    .selectFrom('boards')
    .select(['id', 'prefix'])
    .where('id', '=', input.board)
    .executeTakeFirst();

  if (!board) {
    throw new BoardsError('not_found', `Board "${input.board}" not found`);
  }

  const parent = await db
    .selectFrom('issues')
    .select(['id', 'board'])
    .where('id', '=', parentId)
    .executeTakeFirst();

  if (!parent) {
    throw new BoardsError('not_found', `Parent issue "${parentId}" not found`);
  }

  if (parent.board !== board.id) {
    throw new BoardsError('cross_board', 'Parent issue is on a different board');
  }

  const now = new Date().toISOString();
  const priority = input.priority !== undefined ? clampPriority(input.priority) : 1;
  const issueType = input.issue_type ?? 'task';

  if (input.issue_type !== undefined) {
    validateIssueType(input.issue_type);
  }

  const labels = input.labels ?? [];

  for (let attempt = 0; attempt < 3; attempt++) {
    const id = generateId(board.prefix);
    try {
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto('issues')
          .values({
            id,
            board: board.id,
            title: input.title,
            description: input.description ?? '',
            design: input.design ?? '',
            acceptance_criteria: input.acceptance_criteria ?? '',
            notes: input.notes ?? '',
            status: 'open',
            priority,
            issue_type: issueType,
            assignee: input.assignee ?? '',
            owner: input.owner ?? '',
            created_at: now,
            updated_at: now,
            closed_at: null,
            close_reason: '',
            resolution: '',
          })
          .execute();

        if (labels.length > 0) {
          await trx
            .insertInto('labels')
            .values(labels.map((label) => ({ issue_id: id, label })))
            .execute();
        }

        await trx
          .insertInto('dependencies')
          .values({
            issue_id: parentId,
            depends_on_id: id,
            type: 'parent-child',
            created_at: now,
          })
          .execute();
      });

      return {
        id,
        board: board.id,
        title: input.title,
        description: input.description ?? '',
        design: input.design ?? '',
        acceptance_criteria: input.acceptance_criteria ?? '',
        notes: input.notes ?? '',
        status: 'open' as Status,
        priority,
        issue_type: issueType as IssueType,
        assignee: input.assignee ?? '',
        owner: input.owner ?? '',
        created_at: now,
        updated_at: now,
        closed_at: null,
        close_reason: '',
        resolution: '' as any,
        labels,
      };
    } catch (err: unknown) {
      if (isUniqueViolation(err)) {
        if (attempt === 2) throw err;
        continue;
      }
      throw err;
    }
  }

  throw new BoardsError('internal_error', 'Failed to generate unique ID after 3 attempts');
}

export async function deleteIssues(
  db: Kysely<Database>,
  ids: string[],
): Promise<{ deleted: string[]; not_found: string[] }> {
  const uniqueIds = [...new Set(ids)];

  if (uniqueIds.length === 0) {
    return { deleted: [], not_found: [] };
  }

  const existing = await db
    .selectFrom('issues')
    .select('id')
    .where('id', 'in', uniqueIds)
    .execute();

  const existingIds = new Set(existing.map((r) => r.id));
  const deleted: string[] = [];
  const not_found: string[] = [];

  for (const id of uniqueIds) {
    if (existingIds.has(id)) {
      deleted.push(id);
    } else {
      not_found.push(id);
    }
  }

  if (deleted.length > 0) {
    await db.deleteFrom('issues').where('id', 'in', deleted).execute();
  }

  return { deleted, not_found };
}

export async function reopenIssue(
  db: Kysely<Database>,
  id: string,
  targetStatus?: Status,
): Promise<Issue> {
  const existing = await db
    .selectFrom('issues')
    .selectAll()
    .where('id', '=', id)
    .executeTakeFirst();

  if (!existing) {
    throw new BoardsError('not_found', `Issue "${id}" not found`);
  }

  const status = targetStatus ?? 'open';

  if (existing.status !== 'closed') {
    const labelsMap = await fetchLabelsForIssues(db, [id]);
    return rowToIssue(existing, labelsMap.get(id) ?? []);
  }

  const now = new Date().toISOString();

  const updated = await db
    .updateTable('issues')
    .set({
      status,
      closed_at: null,
      close_reason: '',
      resolution: '',
      updated_at: now,
    })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirstOrThrow();

  const labelsMap = await fetchLabelsForIssues(db, [id]);
  return rowToIssue(updated, labelsMap.get(id) ?? []);
}

export async function deleteIssue(
  db: Kysely<Database>,
  id: string,
): Promise<void> {
  await db.deleteFrom('issues').where('id', '=', id).execute();
}
