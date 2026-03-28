import { Schema } from "effect"

export class Board extends Schema.Class<Board>("Board")({
  id: Schema.String,
  prefix: Schema.String,
  description: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String,
}) {}

export class BoardWithCounts extends Schema.Class<BoardWithCounts>("BoardWithCounts")({
  id: Schema.String,
  prefix: Schema.String,
  description: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String,
  open_count: Schema.Number,
  in_progress_count: Schema.Number,
  closed_count: Schema.Number,
  deferred_count: Schema.Number,
  blocked_count: Schema.Number,
}) {}

export class CreateBoardInput extends Schema.Class<CreateBoardInput>("CreateBoardInput")({
  name: Schema.String,
  prefix: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
}) {}
