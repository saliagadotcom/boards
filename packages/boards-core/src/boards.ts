import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from './schema.js';
import type { Board, BoardWithCounts, CreateBoardInput } from './types.js';
import { BoardsError, isUniqueViolation } from './errors.js';

const BOARD_NAME_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const BOARD_PREFIX_REGEX = /^[a-z0-9]+$/;

export async function createBoard(
  db: Kysely<Database>,
  input: CreateBoardInput,
): Promise<Board> {
  if (!input.name || !BOARD_NAME_REGEX.test(input.name)) {
    throw new BoardsError(
      'invalid_request',
      `Invalid board name: "${input.name}". Must match ${BOARD_NAME_REGEX}`,
    );
  }

  const prefix = input.prefix || input.name;
  if (!BOARD_PREFIX_REGEX.test(prefix)) {
    throw new BoardsError(
      'invalid_request',
      `Invalid board prefix: "${prefix}". Must match ${BOARD_PREFIX_REGEX}`,
    );
  }

  const now = new Date().toISOString();
  const board: Board = {
    id: input.name,
    prefix,
    description: input.description ?? '',
    created_at: now,
    updated_at: now,
  };

  try {
    await db
      .insertInto('boards')
      .values(board)
      .execute();
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      throw new BoardsError('conflict', `Board "${input.name}" already exists`);
    }
    throw err;
  }

  return board;
}

export async function listBoards(
  db: Kysely<Database>,
): Promise<BoardWithCounts[]> {
  const rows = await db
    .selectFrom('boards')
    .leftJoin('issues', 'issues.board', 'boards.id')
    .select([
      'boards.id',
      'boards.prefix',
      'boards.description',
      'boards.created_at',
      'boards.updated_at',
      sql<number>`coalesce(sum(case when issues.status = 'open' then 1 else 0 end), 0)`.as('open_count'),
      sql<number>`coalesce(sum(case when issues.status = 'in_progress' then 1 else 0 end), 0)`.as('in_progress_count'),
      sql<number>`coalesce(sum(case when issues.status = 'closed' then 1 else 0 end), 0)`.as('closed_count'),
      sql<number>`coalesce(sum(case when issues.status = 'deferred' then 1 else 0 end), 0)`.as('deferred_count'),
      sql<number>`coalesce(sum(case when issues.status = 'blocked' then 1 else 0 end), 0)`.as('blocked_count'),
    ])
    .groupBy(['boards.id', 'boards.prefix', 'boards.description', 'boards.created_at', 'boards.updated_at'])
    .orderBy('boards.id', 'asc')
    .execute();

  return rows.map((row) => ({
    id: row.id,
    prefix: row.prefix,
    description: row.description,
    created_at: row.created_at,
    updated_at: row.updated_at,
    open_count: Number(row.open_count),
    in_progress_count: Number(row.in_progress_count),
    closed_count: Number(row.closed_count),
    deferred_count: Number(row.deferred_count),
    blocked_count: Number(row.blocked_count),
  }));
}

export async function deleteBoard(
  db: Kysely<Database>,
  name: string,
): Promise<void> {
  await db
    .deleteFrom('boards')
    .where('id', '=', name)
    .execute();
}
