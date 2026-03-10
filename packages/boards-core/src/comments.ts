import type { Kysely } from 'kysely';
import type { Database } from './schema.js';
import type { Comment } from './types.js';
import { BoardsError } from './errors.js';

export async function addComment(
  db: Kysely<Database>,
  issueId: string,
  author: string,
  text: string,
): Promise<Comment> {
  if (!text || text.trim() === '') {
    throw new BoardsError('invalid_request', 'Comment text cannot be empty');
  }

  const issue = await db
    .selectFrom('issues')
    .select('id')
    .where('id', '=', issueId)
    .executeTakeFirst();

  if (!issue) {
    throw new BoardsError('not_found', `Issue "${issueId}" not found`);
  }

  const now = new Date().toISOString();
  const trimmed = text.trim();

  const { id } = await db
    .insertInto('comments')
    .values({
      issue_id: issueId,
      author,
      text: trimmed,
      created_at: now,
    })
    .returning('id')
    .executeTakeFirstOrThrow();

  return { id, issue_id: issueId, author, text: trimmed, created_at: now };
}

export async function listComments(
  db: Kysely<Database>,
  issueId: string,
): Promise<Comment[]> {
  const rows = await db
    .selectFrom('comments')
    .selectAll()
    .where('issue_id', '=', issueId)
    .orderBy('created_at', 'asc')
    .execute();

  return rows.map((r) => ({
    id: r.id,
    issue_id: r.issue_id,
    author: r.author,
    text: r.text,
    created_at: r.created_at,
  }));
}

export async function deleteComment(
  db: Kysely<Database>,
  commentId: number,
): Promise<void> {
  await db.deleteFrom('comments').where('id', '=', commentId).execute();
}
