import { Schema } from "effect"
import { Status, IssueType, Resolution } from "./common.js"

export class Issue extends Schema.Class<Issue>("Issue")({
  id: Schema.String,
  board: Schema.String,
  title: Schema.String,
  description: Schema.String,
  design: Schema.String,
  acceptance_criteria: Schema.String,
  notes: Schema.String,
  status: Status,
  priority: Schema.Number,
  issue_type: IssueType,
  assignee: Schema.String,
  owner: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String,
  closed_at: Schema.NullOr(Schema.String),
  close_reason: Schema.String,
  resolution: Schema.Union([Resolution, Schema.Literal("")]),
  labels: Schema.Array(Schema.String),
}) {}

export class CreateIssueInput extends Schema.Class<CreateIssueInput>("CreateIssueInput")({
  board: Schema.String,
  title: Schema.String,
  description: Schema.optional(Schema.String),
  design: Schema.optional(Schema.String),
  acceptance_criteria: Schema.optional(Schema.String),
  notes: Schema.optional(Schema.String),
  priority: Schema.optional(Schema.Number),
  issue_type: Schema.optional(IssueType),
  assignee: Schema.optional(Schema.String),
  owner: Schema.optional(Schema.String),
  labels: Schema.optional(Schema.Array(Schema.String)),
}) {}

export class UpdateIssueInput extends Schema.Class<UpdateIssueInput>("UpdateIssueInput")({
  title: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  design: Schema.optional(Schema.String),
  acceptance_criteria: Schema.optional(Schema.String),
  notes: Schema.optional(Schema.String),
  status: Schema.optional(Status),
  priority: Schema.optional(Schema.Number),
  issue_type: Schema.optional(IssueType),
  assignee: Schema.optional(Schema.String),
  owner: Schema.optional(Schema.String),
  labels: Schema.optional(Schema.Array(Schema.String)),
}) {}

export class ListIssuesFilter extends Schema.Class<ListIssuesFilter>("ListIssuesFilter")({
  status: Schema.optional(Status),
  priority: Schema.optional(Schema.Number),
  issue_type: Schema.optional(IssueType),
  assignee: Schema.optional(Schema.String),
  label: Schema.optional(Schema.String),
}) {}

export class ReadyWorkFilter extends Schema.Class<ReadyWorkFilter>("ReadyWorkFilter")({
  assignee: Schema.optional(Schema.String),
  unassigned: Schema.optional(Schema.Boolean),
  priority: Schema.optional(Schema.Number),
  issue_type: Schema.optional(IssueType),
  label: Schema.optional(Schema.String),
  include_epics: Schema.optional(Schema.Boolean),
}) {}
