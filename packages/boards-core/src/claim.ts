// Atomic claim

import type { Kysely } from 'kysely';
import type { Database } from './schema.js';
import type { Issue } from './types.js';
import { BoardsError } from './errors.js';
import { rowToIssue } from './shared.js';

export async function claimIssue(
  db: Kysely<Database>,
  id: string,
  assignee: string,
): Promise<Issue> {
  const now = new Date().toISOString();

  if (!assignee || assignee.trim() === '') {
    throw new BoardsError('invalid_request', 'Assignee is required');
  }

  const row = await db
    .updateTable('issues')
    .set({
      assignee,
      status: 'in_progress',
      updated_at: now,
    })
    .where('id', '=', id)
    .where('status', '=', 'open')
    .where((eb) =>
      eb.or([eb('assignee', 'is', null), eb('assignee', '=', '')]),
    )
    .returningAll()
    .executeTakeFirst();

  if (!row) {
    const existing = await db
      .selectFrom('issues')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!existing) {
      throw new BoardsError('not_found', `Issue "${id}" not found`);
    }

    if (existing.status === 'closed') {
      throw new BoardsError('conflict', `Issue "${id}" has status "closed"`);
    }

    if (existing.status === 'in_progress') {
      throw new BoardsError(
        'conflict',
        `Issue "${id}" has status "in_progress"`,
      );
    }

    throw new BoardsError(
      'conflict',
      `Issue "${id}" is already assigned to "${existing.assignee}"`,
    );
  }

  const labelRows = await db
    .selectFrom('labels')
    .select(['issue_id', 'label'])
    .where('issue_id', '=', id)
    .orderBy('label', 'asc')
    .execute();
  const labels = labelRows.map((r) => r.label);

  return rowToIssue(row, labels);
}
