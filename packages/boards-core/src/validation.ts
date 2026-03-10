import { BoardsError } from './errors.js';
import type { DependencyType, IssueType, Resolution, Status } from './types.js';

const STATUSES: ReadonlySet<string> = new Set<Status>([
  'open',
  'in_progress',
  'closed',
  'deferred',
  'blocked',
]);

const ISSUE_TYPES: ReadonlySet<string> = new Set<IssueType>([
  'task',
  'bug',
  'feature',
  'epic',
  'chore',
]);

const DEPENDENCY_TYPES: ReadonlySet<string> = new Set<DependencyType>([
  'blocks',
  'conditional-blocks',
  'parent-child',
  'related',
  'discovered-from',
]);

const DIRECTIONS: ReadonlySet<string> = new Set(['up', 'down']);

export function parseStatus(value: string): Status {
  if (!STATUSES.has(value)) {
    throw new BoardsError(
      'invalid_request',
      `Invalid status '${value}'. Must be one of: ${[...STATUSES].join(', ')}`,
    );
  }
  return value as Status;
}

export function parseIssueType(value: string): IssueType {
  if (!ISSUE_TYPES.has(value)) {
    throw new BoardsError(
      'invalid_request',
      `Invalid issue_type '${value}'. Must be one of: ${[...ISSUE_TYPES].join(', ')}`,
    );
  }
  return value as IssueType;
}

export function parseDependencyType(value: string): DependencyType {
  if (!DEPENDENCY_TYPES.has(value)) {
    throw new BoardsError(
      'invalid_request',
      `Invalid dependency type '${value}'. Must be one of: ${[...DEPENDENCY_TYPES].join(', ')}`,
    );
  }
  return value as DependencyType;
}

export function parseDirection(value: string): 'up' | 'down' {
  if (!DIRECTIONS.has(value)) {
    throw new BoardsError(
      'invalid_request',
      `Invalid direction '${value}'. Must be one of: up, down`,
    );
  }
  return value as 'up' | 'down';
}

export function parsePriority(value: string): number {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) {
    throw new BoardsError(
      'invalid_request',
      `Invalid priority '${value}'. Must be an integer`,
    );
  }
  return n;
}

const RESOLUTIONS: ReadonlySet<string> = new Set<Resolution>([
  'completed',
  'fixed',
  'duplicate',
  'failed',
  'rejected',
  'canceled',
]);

const SUCCESS_RESOLUTIONS: ReadonlySet<string> = new Set(['completed', 'fixed', 'duplicate']);
const FAILURE_RESOLUTIONS: ReadonlySet<string> = new Set(['failed', 'rejected', 'canceled']);

export function parseResolution(value: string): Resolution {
  if (!RESOLUTIONS.has(value)) {
    throw new BoardsError(
      'invalid_request',
      `Invalid resolution '${value}'. Must be one of: ${[...RESOLUTIONS].join(', ')}`,
    );
  }
  return value as Resolution;
}

export function isFailureResolution(resolution: Resolution): boolean {
  return FAILURE_RESOLUTIONS.has(resolution);
}

export function isSuccessResolution(resolution: Resolution): boolean {
  return SUCCESS_RESOLUTIONS.has(resolution);
}

export function affectsReadyWork(type: DependencyType): boolean {
  return type === 'blocks' || type === 'conditional-blocks';
}
