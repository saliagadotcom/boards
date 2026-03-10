import type { ColumnType, GeneratedAlways } from 'kysely';
import type { DependencyType, IssueType, Status } from './types.js';

export interface Database {
  schema_migrations: SchemaMigrationsTable;
  boards: BoardsTable;
  issues: IssuesTable;
  dependencies: DependenciesTable;
  labels: LabelsTable;
  comments: CommentsTable;
}

interface SchemaMigrationsTable {
  version: number;
  applied_at: string;
}

interface BoardsTable {
  id: string;
  prefix: string;
  description: ColumnType<string, string | undefined, string>;
  created_at: string;
  updated_at: string;
}

export interface IssuesTable {
  id: string;
  board: string;
  title: string;
  description: ColumnType<string, string | undefined, string>;
  design: ColumnType<string, string | undefined, string>;
  acceptance_criteria: ColumnType<string, string | undefined, string>;
  notes: ColumnType<string, string | undefined, string>;
  status: ColumnType<Status, Status | undefined, Status>;
  priority: ColumnType<number, number | undefined, number>;
  issue_type: ColumnType<IssueType, IssueType | undefined, IssueType>;
  assignee: ColumnType<string, string | undefined, string>;
  owner: ColumnType<string, string | undefined, string>;
  created_at: string;
  updated_at: string;
  closed_at: ColumnType<string | null, string | null | undefined, string | null>;
  close_reason: ColumnType<string, string | undefined, string>;
  resolution: ColumnType<string, string | undefined, string>;
}

interface DependenciesTable {
  issue_id: string;
  depends_on_id: string;
  type: DependencyType;
  created_at: string;
  created_by: ColumnType<string, string | undefined, string>;
  metadata: ColumnType<string | null, string | null | undefined, string | null>;
}

interface LabelsTable {
  issue_id: string;
  label: string;
}

interface CommentsTable {
  id: GeneratedAlways<number>;
  issue_id: string;
  author: string;
  text: string;
  created_at: string;
}
