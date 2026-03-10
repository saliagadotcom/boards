import { describe, expect, it } from 'bun:test';
import type { Issue, IssueDetail } from '@saliagadotcom/boards-core';
import {
  formatDependency,
  formatIssue,
  formatIssueDetail,
  formatIssueList,
  priorityLabel,
  statusIcon,
  formatBoard,
  formatConfig,
} from '../src/format.js';
import { jsonError, jsonOutput } from '../src/json.js';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'api-k3m9x2',
    board: 'api',
    title: 'Fix login timeout',
    description: '',
    design: '',
    acceptance_criteria: '',
    notes: '',
    status: 'open',
    priority: 1,
    issue_type: 'bug',
    assignee: '',
    owner: '',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
    closed_at: null,
    close_reason: '',
    labels: [],
    ...overrides,
  };
}

describe('statusIcon', () => {
  it('returns ○ for open', () => {
    expect(statusIcon('open')).toBe('○');
  });

  it('returns ● for in_progress', () => {
    expect(statusIcon('in_progress')).toBe('●');
  });

  it('returns ✓ for closed', () => {
    expect(statusIcon('closed')).toBe('✓');
  });
});

describe('priorityLabel', () => {
  it('returns P0-P4 for valid priorities', () => {
    expect(priorityLabel(0)).toBe('P0');
    expect(priorityLabel(1)).toBe('P1');
    expect(priorityLabel(2)).toBe('P2');
    expect(priorityLabel(3)).toBe('P3');
    expect(priorityLabel(4)).toBe('P4');
  });

  it('clamps values below 0', () => {
    expect(priorityLabel(-1)).toBe('P0');
  });

  it('clamps values above 4', () => {
    expect(priorityLabel(5)).toBe('P4');
  });
});

describe('formatIssue', () => {
  it('includes correct icon, priority, id, title, type', () => {
    const issue = makeIssue();
    const result = formatIssue(issue);
    expect(result).toContain('○');
    expect(result).toContain('[P1]');
    expect(result).toContain('api-k3m9x2');
    expect(result).toContain('Fix login timeout');
    expect(result).toContain('(bug)');
  });

  it('omits assignee when empty', () => {
    const issue = makeIssue({ assignee: '' });
    const result = formatIssue(issue);
    expect(result).not.toContain('@');
  });

  it('includes assignee when present', () => {
    const issue = makeIssue({ assignee: 'agent-1' });
    const result = formatIssue(issue);
    expect(result).toContain('@agent-1');
  });
});

describe('formatIssueList', () => {
  it('returns empty string for empty array', () => {
    expect(formatIssueList([])).toBe('');
  });

  it('formats multiple issues one per line', () => {
    const issues = [makeIssue(), makeIssue({ id: 'api-b2c3d4', title: 'Second issue' })];
    const result = formatIssueList(issues);
    const lines = result.split('\n');
    expect(lines).toHaveLength(2);
  });
});

describe('formatBoard', () => {
  it('formats a basic board', () => {
    const result = formatBoard({
      id: 'api',
      prefix: 'api',
      description: 'API project',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    });
    expect(result).toContain('Board: api');
    expect(result).toContain('Prefix: api');
    expect(result).toContain('Description: API project');
  });

  it('shows counts for BoardWithCounts', () => {
    const result = formatBoard({
      id: 'api',
      prefix: 'api',
      description: 'API project',
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
      open_count: 3,
      in_progress_count: 1,
      closed_count: 5,
      deferred_count: 0,
      blocked_count: 0,
    });
    expect(result).toContain('Issues: 3 open, 1 in progress, 5 closed, 0 deferred, 0 blocked');
  });
});

describe('formatIssueDetail', () => {
  it('shows all fields for a detailed issue', () => {
    const detail: IssueDetail = {
      issue: makeIssue({
        assignee: 'agent-1',
        owner: 'user-1',
        description: 'A description',
        labels: ['urgent', 'backend'],
      }),
      dependencies: [
        {
          issue: makeIssue({ id: 'api-dep1', title: 'Dep issue', status: 'closed' }),
          type: 'blocks',
          created_at: '2025-01-01T00:00:00Z',
        },
      ],
      dependents: [],
    };
    const result = formatIssueDetail(detail);
    expect(result).toContain('api-k3m9x2');
    expect(result).toContain('Assignee: agent-1');
    expect(result).toContain('Owner: user-1');
    expect(result).toContain('Description:');
    expect(result).toContain('A description');
    expect(result).toContain('Labels: urgent, backend');
    expect(result).toContain('Dependencies:');
    expect(result).toContain('→ ✓ api-dep1: Dep issue (blocks)');
  });
});

describe('formatDependency', () => {
  it('formats a dependency line', () => {
    const result = formatDependency({
      issue: makeIssue({ id: 'api-dep1', title: 'Dep issue', status: 'in_progress' }),
      type: 'blocks',
      created_at: '2025-01-01T00:00:00Z',
    });
    expect(result).toBe('→ ● api-dep1: Dep issue (blocks)');
  });
});

describe('formatConfig', () => {
  it('shows config values', () => {
    const result = formatConfig({
      default_board: 'api',
      db_path: '/tmp/boards.db',
      output: 'text',
    });
    expect(result).toContain('default_board: api');
    expect(result).toContain('db_path: /tmp/boards.db');
    expect(result).toContain('output: text');
  });

  it('shows origins when provided', () => {
    const origins = new Map([['default_board', 'repo']]);
    const result = formatConfig(
      { default_board: 'api', db_path: '/tmp/boards.db', output: 'text' },
      origins,
    );
    expect(result).toContain('default_board: api (repo)');
  });

  it('shows (not set) for undefined default_board', () => {
    const result = formatConfig({
      default_board: undefined,
      db_path: '/tmp/boards.db',
      output: 'text',
    });
    expect(result).toContain('default_board: (not set)');
  });
});

describe('jsonOutput', () => {
  it('returns valid JSON with 2-space indent', () => {
    const data = { id: 'test', count: 42 };
    const result = jsonOutput(data);
    expect(JSON.parse(result)).toEqual(data);
    expect(result).toBe('{\n  "id": "test",\n  "count": 42\n}');
  });

  it('preserves ISO timestamps', () => {
    const data = { created_at: '2025-01-01T00:00:00Z' };
    const result = jsonOutput(data);
    expect(result).toContain('2025-01-01T00:00:00Z');
  });
});

describe('jsonError', () => {
  it('returns error object with code and message', () => {
    const result = jsonError('not_found', 'Issue not found');
    const parsed = JSON.parse(result);
    expect(parsed).toEqual({
      error: { code: 'not_found', message: 'Issue not found' },
    });
  });
});
