import { Schema } from "effect"
import { Issue } from "./Issue.js"

export class Metadata extends Schema.Class<Metadata>("Metadata")({
  version: Schema.String,
  schema_version: Schema.Number,
}) {}

export class DeleteResult extends Schema.Class<DeleteResult>("DeleteResult")({
  deleted: Schema.Array(Schema.String),
  not_found: Schema.Array(Schema.String),
}) {}

export class EpicStatus extends Schema.Class<EpicStatus>("EpicStatus")({
  epic: Issue,
  totalChildren: Schema.Number,
  closedChildren: Schema.Number,
  eligibleForClose: Schema.Boolean,
}) {}
