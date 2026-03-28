import { Schema } from "effect"

// ── Domain enums ──────────────────────────────────────────────────────

export const Status = Schema.Literals(["open", "in_progress", "closed", "deferred", "blocked"])
export type Status = typeof Status.Type

export const IssueType = Schema.Literals(["task", "bug", "feature", "epic", "chore"])
export type IssueType = typeof IssueType.Type

export const DependencyType = Schema.Literals([
  "blocks",
  "conditional-blocks",
  "parent-child",
  "related",
  "discovered-from",
])
export type DependencyType = typeof DependencyType.Type

export const Resolution = Schema.Literals([
  "completed",
  "fixed",
  "duplicate",
  "failed",
  "rejected",
  "canceled",
])
export type Resolution = typeof Resolution.Type

export const Priority = Schema.Literals([0, 1, 2, 3, 4])
export type Priority = typeof Priority.Type

export const Direction = Schema.Literals(["up", "down"])
export type Direction = typeof Direction.Type

// ── Domain helpers ────────────────────────────────────────────────────

const FAILURE_RESOLUTIONS: ReadonlySet<string> = new Set(["failed", "rejected", "canceled"])
const SUCCESS_RESOLUTIONS: ReadonlySet<string> = new Set(["completed", "fixed", "duplicate"])

export function isFailureResolution(resolution: Resolution): boolean {
  return FAILURE_RESOLUTIONS.has(resolution)
}

export function isSuccessResolution(resolution: Resolution): boolean {
  return SUCCESS_RESOLUTIONS.has(resolution)
}

export function affectsReadyWork(type: DependencyType): boolean {
  return type === "blocks" || type === "conditional-blocks"
}
