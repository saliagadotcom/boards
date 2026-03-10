import type { Kysely } from 'kysely';
import type { Database } from './schema.js';
import { BoardsError } from './errors.js';

export async function addLabel(
  db: Kysely<Database>,
  issueId: string,
  label: string,
): Promise<void> {
  const issue = await db
    .selectFrom('issues')
    .select('id')
    .where('id', '=', issueId)
    .executeTakeFirst();

  if (!issue) {
    throw new BoardsError('not_found', `Issue "${issueId}" not found`);
  }

  await db
    .insertInto('labels')
    .values({ issue_id: issueId, label })
    .onConflict((oc) => oc.columns(['issue_id', 'label']).doNothing())
    .execute();
}

export async function removeLabel(
  db: Kysely<Database>,
  issueId: string,
  label: string,
): Promise<void> {
  await db
    .deleteFrom('labels')
    .where('issue_id', '=', issueId)
    .where('label', '=', label)
    .execute();
}
