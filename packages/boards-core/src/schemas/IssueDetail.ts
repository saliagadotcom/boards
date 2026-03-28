import { Schema } from "effect"
import { Issue } from "./Issue.js"
import { Comment } from "./Comment.js"
import { DependencyWithIssue } from "./Dependency.js"

export class IssueDetail extends Schema.Class<IssueDetail>("IssueDetail")({
  issue: Issue,
  dependencies: Schema.Array(DependencyWithIssue),
  dependents: Schema.Array(DependencyWithIssue),
  comments: Schema.Array(Comment),
}) {}
