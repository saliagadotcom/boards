import { describe, expect, it } from 'bun:test';
import React from 'react';
import { render } from 'ink-testing-library';
import type { Issue, Status } from '@saliagadotcom/boards-core';
import type { SelectedIssueByStatus, StatusColumn } from '../src/types.js';
import { BoardScreen } from '../src/board-screen.js';

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

function makeColumn(status: Status, ids: string[]): StatusColumn {
  return {
    status,
    issues: ids.map((id) => makeIssue({ id, status, title: `Issue ${id}` })),
  };
}

function noop() {}

describe('BoardScreen', () => {
  it('renders empty board state when no columns', () => {
    const { lastFrame, cleanup } = render(
      <BoardScreen
        columns={[]}
        selected={{}}
        focusedColumnIndex={0}
        terminalWidth={120}
        terminalHeight={30}
        onNavigate={noop}
        onSelect={noop}
      />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain('No issues found');
    expect(frame).toContain('bd create');
    cleanup();
  });

  it('renders too-small message for tiny terminal', () => {
    const columns = [makeColumn('open', ['a-1'])];
    const selected: SelectedIssueByStatus = { open: 'a-1' };

    const { lastFrame, cleanup } = render(
      <BoardScreen
        columns={columns}
        selected={selected}
        focusedColumnIndex={0}
        terminalWidth={10}
        terminalHeight={3}
        onNavigate={noop}
        onSelect={noop}
      />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain('Terminal too small');
    cleanup();
  });

  it('renders multi-column layout when terminal is wide enough', () => {
    const columns = [
      makeColumn('open', ['a-1', 'a-2']),
      makeColumn('in_progress', ['b-1']),
    ];
    const selected: SelectedIssueByStatus = { open: 'a-1', in_progress: 'b-1' };

    const { lastFrame, cleanup } = render(
      <BoardScreen
        columns={columns}
        selected={selected}
        focusedColumnIndex={0}
        terminalWidth={120}
        terminalHeight={20}
        onNavigate={noop}
        onSelect={noop}
      />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain('Open (2)');
    expect(frame).toContain('In Progress (1)');
    expect(frame).toContain('a-1');
    expect(frame).toContain('b-1');
    cleanup();
  });

  it('renders focused-column layout when terminal is narrow', () => {
    const columns = [
      makeColumn('open', ['a-1', 'a-2']),
      makeColumn('in_progress', ['b-1']),
      makeColumn('blocked', ['c-1']),
    ];
    const selected: SelectedIssueByStatus = {
      open: 'a-1',
      in_progress: 'b-1',
      blocked: 'c-1',
    };

    const { lastFrame, cleanup } = render(
      <BoardScreen
        columns={columns}
        selected={selected}
        focusedColumnIndex={0}
        terminalWidth={40}
        terminalHeight={20}
        onNavigate={noop}
        onSelect={noop}
      />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain('[column 1 of 3]');
    expect(frame).toContain('Open (2)');
    // Should NOT show other columns in focused mode
    expect(frame).not.toContain('In Progress');
    cleanup();
  });

  it('focused-column shows correct column header when focused on second column', () => {
    const columns = [
      makeColumn('open', ['a-1']),
      makeColumn('in_progress', ['b-1']),
    ];
    const selected: SelectedIssueByStatus = { open: 'a-1', in_progress: 'b-1' };

    const { lastFrame, cleanup } = render(
      <BoardScreen
        columns={columns}
        selected={selected}
        focusedColumnIndex={1}
        terminalWidth={30}
        terminalHeight={20}
        onNavigate={noop}
        onSelect={noop}
      />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain('[column 2 of 2]');
    expect(frame).toContain('In Progress (1)');
    cleanup();
  });
});
