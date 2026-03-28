import { Schema } from "effect"
import { DependencyType } from "./common.js"
import { Issue } from "./Issue.js"

export class DependencyWithIssue extends Schema.Class<DependencyWithIssue>("DependencyWithIssue")({
  issue: Issue,
  type: DependencyType,
  created_at: Schema.String,
  created_by: Schema.String,
  metadata: Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown)),
}) {}

export class AddDependencyInput extends Schema.Class<AddDependencyInput>("AddDependencyInput")({
  issue_id: Schema.String,
  depends_on_id: Schema.String,
  type: DependencyType,
  created_by: Schema.optional(Schema.String),
  metadata: Schema.optional(Schema.Record(Schema.String, Schema.Unknown)),
}) {}
