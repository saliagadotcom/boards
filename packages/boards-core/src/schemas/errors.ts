import { Schema } from "effect"

export class NotFoundError extends Schema.TaggedErrorClass<NotFoundError>()("NotFoundError", {
  resource: Schema.String,
  id: Schema.String,
}) {
  get code() { return "not_found" as const }
}

export class ConflictError extends Schema.TaggedErrorClass<ConflictError>()("ConflictError", {
  message: Schema.String,
}) {
  get code() { return "conflict" as const }
}

export class InvalidRequestError extends Schema.TaggedErrorClass<InvalidRequestError>()("InvalidRequestError", {
  message: Schema.String,
}) {
  get code() { return "invalid_request" as const }
}

export class InvalidTransitionError extends Schema.TaggedErrorClass<InvalidTransitionError>()("InvalidTransitionError", {
  message: Schema.String,
}) {
  get code() { return "invalid_transition" as const }
}

export class SelfDependencyError extends Schema.TaggedErrorClass<SelfDependencyError>()("SelfDependencyError", {
  issueId: Schema.String,
}) {
  get code() { return "self_dependency" as const }
}

export class CircularDependencyError extends Schema.TaggedErrorClass<CircularDependencyError>()("CircularDependencyError", {
  issueId: Schema.String,
  dependsOnId: Schema.String,
}) {
  get code() { return "circular_dependency" as const }
}

export class CrossBoardError extends Schema.TaggedErrorClass<CrossBoardError>()("CrossBoardError", {
  message: Schema.String,
}) {
  get code() { return "cross_board" as const }
}

export class InternalError extends Schema.TaggedErrorClass<InternalError>()("InternalError", {
  cause: Schema.Defect,
}) {
  get code() { return "internal_error" as const }
}

export const AppError = Schema.Union([
  NotFoundError,
  ConflictError,
  InvalidRequestError,
  InvalidTransitionError,
  SelfDependencyError,
  CircularDependencyError,
  CrossBoardError,
  InternalError,
])
export type AppError = typeof AppError.Type

export function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  const msg = err.message
  return (
    msg.includes("UNIQUE constraint failed") ||
    msg.includes("SQLITE_CONSTRAINT_UNIQUE")
  )
}
