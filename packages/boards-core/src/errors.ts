import type { ErrorCode } from './types.js';

export class BoardsError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'BoardsError';
  }
}

/**
 * Detects SQLite unique constraint violations.
 *
 * Matches the specific SQLite error message pattern rather than
 * broad substring matching, to avoid misclassifying unrelated errors.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false;

  const msg = err.message;
  return (
    msg.includes('UNIQUE constraint failed') ||
    msg.includes('SQLITE_CONSTRAINT_UNIQUE')
  );
}
