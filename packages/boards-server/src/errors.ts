import { BoardsError } from '@saliagadotcom/boards-core';
import type { ErrorCode } from '@saliagadotcom/boards-core';
import type { Context } from 'hono';

export const HTTP_STATUS: Record<ErrorCode, number> = {
  invalid_request: 400,
  invalid_transition: 400,
  not_found: 404,
  conflict: 409,
  self_dependency: 400,
  circular_dependency: 400,
  cross_board: 400,
  internal_error: 500,
};

export function errorHandler(err: Error, c: Context): Response {
  if (err instanceof BoardsError) {
    return c.json(
      { error: { code: err.code, message: err.message } },
      HTTP_STATUS[err.code] as never,
    );
  }

  console.error('Unhandled error:', err);
  return c.json(
    { error: { code: 'internal_error', message: 'Internal server error' } },
    500,
  );
}
