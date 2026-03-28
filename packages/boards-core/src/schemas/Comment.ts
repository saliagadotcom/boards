import { Schema } from "effect"

export class Comment extends Schema.Class<Comment>("Comment")({
  id: Schema.Number,
  issue_id: Schema.String,
  author: Schema.String,
  text: Schema.String,
  created_at: Schema.String,
}) {}
