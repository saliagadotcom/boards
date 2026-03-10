import type { Kysely } from 'kysely';
import type { Database } from './schema.js';
import type {
  Board,
  BoardWithCounts,
  CreateBoardInput,
  Issue,
  IssueDetail,
  CreateIssueInput,
  UpdateIssueInput,
  ListIssuesFilter,
  AddDependencyInput,
  DependencyWithIssue,
  DependencyType,
  Resolution,
  ReadyWorkFilter,
  EpicStatus,
  Comment,
  DeleteResult,
  Metadata,
  IBoardsStore,
} from './types.js';
import { createBoard, listBoards, deleteBoard } from './boards.js';
import { getEpicsEligibleForClosure } from './epic.js';
import { createIssue, createIssueWithId, showIssue, listIssues, updateIssue, closeIssue, deleteIssue, createIssueWithParent, deleteIssues, reopenIssue } from './issues.js';
import { addDependency, removeDependency, listDependencies } from './deps.js';
import { addLabel, removeLabel } from './labels.js';
import { addComment, listComments, deleteComment } from './comments.js';
import { getMetadata } from './metadata.js';
import { readyWork } from './ready.js';
import { claimIssue } from './claim.js';
import { searchIssues } from './search.js';
import { migrate as runMigrate } from './migrate.js';

export class BoardsStore implements IBoardsStore {
  constructor(private db: Kysely<Database>) {}

  // boards
  createBoard(input: CreateBoardInput): Promise<Board> {
    return createBoard(this.db, input);
  }
  listBoards(): Promise<BoardWithCounts[]> {
    return listBoards(this.db);
  }
  deleteBoard(name: string): Promise<void> {
    return deleteBoard(this.db, name);
  }

  // issues
  createIssue(input: CreateIssueInput): Promise<Issue> {
    return createIssue(this.db, input);
  }
  createIssueWithId(id: string, input: CreateIssueInput): Promise<Issue> {
    return createIssueWithId(this.db, id, input);
  }
  showIssue(id: string): Promise<IssueDetail> {
    return showIssue(this.db, id);
  }
  listIssues(board: string, filter?: ListIssuesFilter): Promise<Issue[]> {
    return listIssues(this.db, board, filter);
  }
  updateIssue(id: string, input: UpdateIssueInput): Promise<Issue> {
    return updateIssue(this.db, id, input);
  }
  closeIssue(id: string, reason?: string, resolution?: Resolution): Promise<Issue> {
    return closeIssue(this.db, id, reason, resolution);
  }
  deleteIssue(id: string): Promise<void> {
    return deleteIssue(this.db, id);
  }
  createIssueWithParent(input: CreateIssueInput, parentId: string): Promise<Issue> {
    return createIssueWithParent(this.db, input, parentId);
  }
  deleteIssues(ids: string[]): Promise<DeleteResult> {
    return deleteIssues(this.db, ids);
  }
  reopenIssue(id: string, status?: 'open' | 'in_progress'): Promise<Issue> {
    return reopenIssue(this.db, id, status);
  }

  // comments
  addComment(issueId: string, author: string, text: string): Promise<Comment> {
    return addComment(this.db, issueId, author, text);
  }
  listComments(issueId: string): Promise<Comment[]> {
    return listComments(this.db, issueId);
  }
  deleteComment(commentId: number): Promise<void> {
    return deleteComment(this.db, commentId);
  }

  // dependencies
  addDependency(input: AddDependencyInput): Promise<void> {
    return addDependency(this.db, input);
  }
  removeDependency(issueId: string, dependsOnId: string): Promise<void> {
    return removeDependency(this.db, issueId, dependsOnId);
  }
  listDependencies(issueId: string, direction: 'up' | 'down', type?: DependencyType): Promise<DependencyWithIssue[]> {
    return listDependencies(this.db, issueId, direction, type);
  }

  // labels
  addLabel(issueId: string, label: string): Promise<void> {
    return addLabel(this.db, issueId, label);
  }
  removeLabel(issueId: string, label: string): Promise<void> {
    return removeLabel(this.db, issueId, label);
  }

  // epics
  epicStatus(board: string): Promise<EpicStatus[]> {
    return getEpicsEligibleForClosure(this.db, board);
  }

  // ready
  readyWork(board: string, filter?: ReadyWorkFilter): Promise<Issue[]> {
    return readyWork(this.db, board, filter);
  }

  // claim
  claimIssue(id: string, assignee: string): Promise<Issue> {
    return claimIssue(this.db, id, assignee);
  }

  // search
  searchIssues(board: string, query: string): Promise<Issue[]> {
    return searchIssues(this.db, board, query);
  }

  // metadata
  getMetadata(): Promise<Metadata> {
    return getMetadata(this.db);
  }

  // migrate
  migrate(): Promise<void> {
    return runMigrate(this.db);
  }
}

export function createStore(db: Kysely<Database>): BoardsStore {
  return new BoardsStore(db);
}
