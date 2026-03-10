import { BoardsError } from '@saliagadotcom/boards-core';
import type {
  IBoardsStore,
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
  ReadyWorkFilter,
  EpicStatus,
  Comment,
  DeleteResult,
  Metadata,
} from '@saliagadotcom/boards-core';

export class RemoteBoardsStore implements IBoardsStore {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/v1${path}`, init);
    } catch (err) {
      throw new BoardsError(
        'internal_error',
        `Connection failed: ${this.baseUrl} — is the server running?`,
      );
    }

    if (!res.ok) {
      let body: any;
      try {
        body = await res.json();
      } catch {
        throw new BoardsError(
          'internal_error',
          `Server returned HTTP ${res.status}`,
        );
      }
      if (body?.error?.code && body?.error?.message) {
        throw new BoardsError(body.error.code, body.error.message);
      }
      throw new BoardsError(
        'internal_error',
        `Server returned HTTP ${res.status}`,
      );
    }

    if (res.status === 204) {
      return undefined as T;
    }

    return res.json() as Promise<T>;
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private get<T>(path: string, params?: Record<string, string | undefined>): Promise<T> {
    let url = path;
    if (params) {
      const entries = Object.entries(params).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      );
      if (entries.length > 0) {
        url += '?' + new URLSearchParams(entries).toString();
      }
    }
    return this.request<T>(url);
  }

  private del<T>(path: string, body?: unknown): Promise<T> {
    const init: RequestInit = { method: 'DELETE' };
    if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }
    return this.request<T>(path, init);
  }

  private patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // Boards
  createBoard(input: CreateBoardInput): Promise<Board> {
    return this.post('/boards', input);
  }

  listBoards(): Promise<BoardWithCounts[]> {
    return this.get('/boards');
  }

  deleteBoard(name: string): Promise<void> {
    return this.del(`/boards/${encodeURIComponent(name)}`);
  }

  // Issues
  createIssue(input: CreateIssueInput): Promise<Issue> {
    const { board, ...body } = input;
    return this.post(`/boards/${encodeURIComponent(board)}/issues`, body);
  }

  showIssue(id: string): Promise<IssueDetail> {
    return this.get(`/boards/_/issues/${encodeURIComponent(id)}`);
  }

  listIssues(board: string, filter?: ListIssuesFilter): Promise<Issue[]> {
    const params: Record<string, string | undefined> = {};
    if (filter) {
      if (filter.status) params.status = filter.status;
      if (filter.priority !== undefined) params.priority = String(filter.priority);
      if (filter.issue_type) params.issue_type = filter.issue_type;
      if (filter.assignee) params.assignee = filter.assignee;
      if (filter.label) params.label = filter.label;
    }
    return this.get(`/boards/${encodeURIComponent(board)}/issues`, params);
  }

  updateIssue(id: string, input: UpdateIssueInput): Promise<Issue> {
    return this.patch(`/boards/_/issues/${encodeURIComponent(id)}`, input);
  }

  closeIssue(id: string, reason?: string): Promise<Issue> {
    return this.post(`/boards/_/issues/${encodeURIComponent(id)}/close`, { reason });
  }

  deleteIssue(id: string): Promise<void> {
    return this.del(`/boards/_/issues/${encodeURIComponent(id)}`);
  }

  createIssueWithParent(input: CreateIssueInput, parentId: string): Promise<Issue> {
    const { board, ...body } = input;
    return this.post(`/boards/${encodeURIComponent(board)}/issues`, { ...body, parent_id: parentId });
  }

  deleteIssues(ids: string[]): Promise<DeleteResult> {
    return this.del('/boards/_/issues', { ids });
  }

  reopenIssue(id: string, status?: 'open' | 'in_progress'): Promise<Issue> {
    return this.post(`/boards/_/issues/${encodeURIComponent(id)}/reopen`, { status });
  }

  // Comments
  addComment(issueId: string, author: string, text: string): Promise<Comment> {
    return this.post(`/boards/_/issues/${encodeURIComponent(issueId)}/comments`, { author, text });
  }

  listComments(issueId: string): Promise<Comment[]> {
    return this.get(`/boards/_/issues/${encodeURIComponent(issueId)}/comments`);
  }

  deleteComment(commentId: number): Promise<void> {
    return this.del(`/boards/_/issues/_/comments/${commentId}`);
  }

  // Dependencies
  addDependency(input: AddDependencyInput): Promise<void> {
    return this.post(`/boards/_/issues/${encodeURIComponent(input.issue_id)}/dependencies`, {
      depends_on_id: input.depends_on_id,
      type: input.type,
    });
  }

  removeDependency(issueId: string, dependsOnId: string): Promise<void> {
    return this.del(`/boards/_/issues/${encodeURIComponent(issueId)}/dependencies/${encodeURIComponent(dependsOnId)}`);
  }

  listDependencies(issueId: string, direction: 'up' | 'down', type?: DependencyType): Promise<DependencyWithIssue[]> {
    const params: Record<string, string | undefined> = { direction };
    if (type) params.type = type;
    return this.get(`/boards/_/issues/${encodeURIComponent(issueId)}/dependencies`, params);
  }

  // Labels
  addLabel(issueId: string, label: string): Promise<void> {
    return this.post(`/boards/_/issues/${encodeURIComponent(issueId)}/labels`, { label });
  }

  removeLabel(issueId: string, label: string): Promise<void> {
    return this.del(`/boards/_/issues/${encodeURIComponent(issueId)}/labels/${encodeURIComponent(label)}`);
  }

  // Epics
  epicStatus(board: string): Promise<EpicStatus[]> {
    return this.get(`/boards/${encodeURIComponent(board)}/epics`);
  }

  // Ready Work + Claim
  readyWork(board: string, filter?: ReadyWorkFilter): Promise<Issue[]> {
    const params: Record<string, string | undefined> = {};
    if (filter) {
      if (filter.assignee) params.assignee = filter.assignee;
      if (filter.unassigned) params.unassigned = 'true';
      if (filter.priority !== undefined) params.priority = String(filter.priority);
      if (filter.issue_type) params.issue_type = filter.issue_type;
      if (filter.label) params.label = filter.label;
      if (filter.include_epics) params.include_epics = 'true';
    }
    return this.get(`/boards/${encodeURIComponent(board)}/ready`, params);
  }

  claimIssue(id: string, assignee: string): Promise<Issue> {
    return this.post(`/boards/_/issues/${encodeURIComponent(id)}/claim`, { assignee });
  }

  // Search
  searchIssues(board: string, query: string): Promise<Issue[]> {
    return this.get(`/boards/${encodeURIComponent(board)}/issues`, { q: query });
  }

  // Metadata
  getMetadata(): Promise<Metadata> {
    return this.get('/metadata');
  }
}
