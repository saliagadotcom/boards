import { afterEach, describe, expect, it } from 'bun:test';
import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import type { Issue, IBoardsStore } from '@saliagadotcom/boards-core';
import { App } from '../src/app.js';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'test-1',
    board: 'test',
    title: 'Test issue',
    description: '',
    design: '',
    acceptance_criteria: '',
    notes: '',
    status: 'open',
    priority: 2,
    issue_type: 'task',
    assignee: '',
    owner: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    closed_at: null,
    close_reason: '',
    labels: [],
    ...overrides,
  };
}

function createMockStore(issues: Issue[] = []): IBoardsStore {
  return {
    listIssues: async () => issues,
    createBoard: async () => ({ id: '', prefix: '', description: '', created_at: '', updated_at: '' }),
    listBoards: async () => [],
    deleteBoard: async () => {},
    createIssue: async () => makeIssue(),
    showIssue: async () => ({ issue: makeIssue(), dependencies: [], dependents: [], comments: [] }),
    updateIssue: async () => makeIssue(),
    closeIssue: async () => makeIssue(),
    deleteIssue: async () => {},
    createIssueWithParent: async () => makeIssue(),
    deleteIssues: async () => ({ deleted: [], not_found: [] }),
    reopenIssue: async () => makeIssue(),
    addComment: async () => ({ id: 1, issue_id: '', author: '', text: '', created_at: '' }),
    listComments: async () => [],
    deleteComment: async () => {},
    addDependency: async () => {},
    removeDependency: async () => {},
    listDependencies: async () => [],
    addLabel: async () => {},
    removeLabel: async () => {},
    epicStatus: async () => [],
    readyWork: async () => [],
    claimIssue: async () => makeIssue(),
    searchIssues: async () => [],
    getMetadata: async () => ({ version: '0.0.0-test', schema_version: 1 }),
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

afterEach(() => {
  cleanup();
});

describe('App rendering', () => {
  it('shows loading state initially', () => {
    const store = createMockStore();
    const { lastFrame } = render(
      <App store={store} board="test" pollIntervalMs={0} />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain('Loading');
  });

  it('shows board view after data loads', async () => {
    const issues = [
      makeIssue({ id: 'a-1', title: 'First issue' }),
      makeIssue({ id: 'a-2', title: 'Second issue' }),
    ];
    const store = createMockStore(issues);

    const { lastFrame } = render(
      <App store={store} board="test" pollIntervalMs={0} />,
    );

    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('Open (2)');
    expect(frame).toContain('a-1');
    expect(frame).toContain('[q] quit');
  });

  it('shows error state on initial load failure', async () => {
    const store = createMockStore();
    store.listIssues = async () => {
      throw new Error('Connection refused');
    };

    const { lastFrame } = render(
      <App store={store} board="test" pollIntervalMs={0} />,
    );

    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('Failed to load board');
    expect(frame).toContain('Connection refused');
  });

  it('shows empty board state when no issues', async () => {
    const store = createMockStore([]);

    const { lastFrame } = render(
      <App store={store} board="test" pollIntervalMs={0} />,
    );

    await delay(50);

    const frame = lastFrame()!;
    expect(frame).toContain('No issues found');
  });
});
