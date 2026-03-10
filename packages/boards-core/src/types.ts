export type Status = 'open' | 'in_progress' | 'closed' | 'deferred' | 'blocked';
export type IssueType = 'task' | 'bug' | 'feature' | 'epic' | 'chore';
export type DependencyType = 'blocks' | 'conditional-blocks' | 'parent-child' | 'related' | 'discovered-from';
export type Resolution = 'completed' | 'fixed' | 'duplicate' | 'failed' | 'rejected' | 'canceled';
export type ErrorCode =
  | 'invalid_request'
  | 'invalid_transition'
  | 'not_found'
  | 'conflict'
  | 'self_dependency'
  | 'circular_dependency'
  | 'cross_board'
  | 'internal_error';

export interface Board {
  id: string;
  prefix: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface BoardWithCounts extends Board {
  open_count: number;
  in_progress_count: number;
  closed_count: number;
  deferred_count: number;
  blocked_count: number;
}

export interface Issue {
  id: string;
  board: string;
  title: string;
  description: string;
  design: string;
  acceptance_criteria: string;
  notes: string;
  status: Status;
  priority: number;
  issue_type: IssueType;
  assignee: string;
  owner: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  close_reason: string;
  resolution: Resolution | '';
  labels: string[];
}

export interface Comment {
  id: number;
  issue_id: string;
  author: string;
  text: string;
  created_at: string;
}

export interface DeleteResult {
  deleted: string[];
  not_found: string[];
}

export interface Metadata {
  version: string;
  schema_version: number;
}

export interface IssueDetail {
  issue: Issue;
  dependencies: DependencyWithIssue[];
  dependents: DependencyWithIssue[];
  comments: Comment[];
}

export interface DependencyWithIssue {
  issue: Issue;
  type: DependencyType;
  created_at: string;
  created_by: string;
  metadata: Record<string, unknown> | null;
}

export interface CreateBoardInput {
  name: string;
  prefix?: string;
  description?: string;
}

export interface CreateIssueInput {
  board: string;
  title: string;
  description?: string;
  design?: string;
  acceptance_criteria?: string;
  notes?: string;
  priority?: number;
  issue_type?: IssueType;
  assignee?: string;
  owner?: string;
  labels?: string[];
}

export interface UpdateIssueInput {
  title?: string;
  description?: string;
  design?: string;
  acceptance_criteria?: string;
  notes?: string;
  status?: Status;
  priority?: number;
  issue_type?: IssueType;
  assignee?: string;
  owner?: string;
  labels?: string[];
}

export interface ListIssuesFilter {
  status?: Status;
  priority?: number;
  issue_type?: IssueType;
  assignee?: string;
  label?: string;
}

export interface ReadyWorkFilter {
  assignee?: string;
  unassigned?: boolean;
  priority?: number;
  issue_type?: IssueType;
  label?: string;
  include_epics?: boolean;
}

export interface EpicStatus {
  epic: Issue;
  totalChildren: number;
  closedChildren: number;
  eligibleForClose: boolean;
}

export interface AddDependencyInput {
  issue_id: string;
  depends_on_id: string;
  type: DependencyType;
  created_by?: string;
  metadata?: Record<string, unknown>;
}

export interface IBoardsStore {
  // Boards
  createBoard(input: CreateBoardInput): Promise<Board>;
  listBoards(): Promise<BoardWithCounts[]>;
  deleteBoard(name: string): Promise<void>;

  // Issues
  createIssue(input: CreateIssueInput): Promise<Issue>;
  showIssue(id: string): Promise<IssueDetail>;
  listIssues(board: string, filter?: ListIssuesFilter): Promise<Issue[]>;
  updateIssue(id: string, input: UpdateIssueInput): Promise<Issue>;
  closeIssue(id: string, reason?: string, resolution?: Resolution): Promise<Issue>;
  deleteIssue(id: string): Promise<void>;
  createIssueWithParent(input: CreateIssueInput, parentId: string): Promise<Issue>;
  deleteIssues(ids: string[]): Promise<DeleteResult>;
  reopenIssue(id: string, status?: 'open' | 'in_progress'): Promise<Issue>;

  // Comments
  addComment(issueId: string, author: string, text: string): Promise<Comment>;
  listComments(issueId: string): Promise<Comment[]>;
  deleteComment(commentId: number): Promise<void>;

  // Dependencies
  addDependency(input: AddDependencyInput): Promise<void>;
  removeDependency(issueId: string, dependsOnId: string): Promise<void>;
  listDependencies(issueId: string, direction: 'up' | 'down', type?: DependencyType): Promise<DependencyWithIssue[]>;

  // Labels
  addLabel(issueId: string, label: string): Promise<void>;
  removeLabel(issueId: string, label: string): Promise<void>;

  // Epics
  epicStatus(board: string): Promise<EpicStatus[]>;

  // Ready Work + Claim
  readyWork(board: string, filter?: ReadyWorkFilter): Promise<Issue[]>;
  claimIssue(id: string, assignee: string): Promise<Issue>;

  // Search
  searchIssues(board: string, query: string): Promise<Issue[]>;

  // Metadata
  getMetadata(): Promise<Metadata>;
}
