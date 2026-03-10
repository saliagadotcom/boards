import { afterEach, describe, expect, it } from 'bun:test';
import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import type { Issue } from '@saliagadotcom/boards-core';
import { EditScreen } from '../src/edit-screen.js';

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

function noop() {}

afterEach(() => {
  cleanup();
});

describe('EditScreen', () => {
  it('renders header with issue info', () => {
    const issue = makeIssue({ id: 'X-42', title: 'Fix the bug' });

    const { lastFrame } = render(
      <EditScreen
        issue={issue}
        terminalWidth={80}
        terminalHeight={20}
        onSave={noop}
        onCancel={noop}
      />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain('X-42');
    expect(frame).toContain('Fix the bug');
    expect(frame).toContain('Edit:');
  });

  it('renders all status options', () => {
    const { lastFrame } = render(
      <EditScreen
        issue={makeIssue()}
        terminalWidth={80}
        terminalHeight={20}
        onSave={noop}
        onCancel={noop}
      />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain('Status');
    expect(frame).toContain('Open');
    expect(frame).toContain('In Progress');
    expect(frame).toContain('Blocked');
    expect(frame).toContain('Deferred');
    expect(frame).toContain('Closed');
  });

  it('renders all priority options', () => {
    const { lastFrame } = render(
      <EditScreen
        issue={makeIssue()}
        terminalWidth={80}
        terminalHeight={20}
        onSave={noop}
        onCancel={noop}
      />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain('Priority');
    expect(frame).toContain('P0');
    expect(frame).toContain('P1');
    expect(frame).toContain('P2');
    expect(frame).toContain('P3');
    expect(frame).toContain('P4');
  });

  it('shows current status as selected with ● indicator', () => {
    const issue = makeIssue({ status: 'in_progress' });

    const { lastFrame } = render(
      <EditScreen
        issue={issue}
        terminalWidth={80}
        terminalHeight={20}
        onSave={noop}
        onCancel={noop}
      />,
    );

    const frame = lastFrame()!;
    const lines = frame.split('\n');
    const inProgressLine = lines.find((l) => l.includes('In Progress'));
    const openLine = lines.find((l) => l.includes('Open') && !l.includes('Edit'));
    expect(inProgressLine).toContain('●');
    expect(openLine).toContain('○');
  });

  it('shows current priority as selected with ● indicator', () => {
    const issue = makeIssue({ priority: 1 });

    const { lastFrame } = render(
      <EditScreen
        issue={issue}
        terminalWidth={80}
        terminalHeight={20}
        onSave={noop}
        onCancel={noop}
      />,
    );

    const frame = lastFrame()!;
    const lines = frame.split('\n');
    // Match priority option lines (contain "—") to avoid matching the header
    const p1Line = lines.find((l) => l.includes('P1') && l.includes('High'));
    const p2Line = lines.find((l) => l.includes('P2') && l.includes('Medium'));
    expect(p1Line).toContain('●');
    expect(p2Line).toContain('○');
  });

  it('highlights status field by default (focused)', () => {
    const { lastFrame } = render(
      <EditScreen
        issue={makeIssue()}
        terminalWidth={80}
        terminalHeight={20}
        onSave={noop}
        onCancel={noop}
      />,
    );

    const frame = lastFrame()!;
    // The cursor '>' should appear in the status section
    const lines = frame.split('\n');
    const openLine = lines.find((l) => l.includes('Open') && !l.includes('Edit'));
    expect(openLine).toContain('>');
  });

  it('shows issue type abbreviation in header', () => {
    const { lastFrame: bugFrame } = render(
      <EditScreen
        issue={makeIssue({ issue_type: 'bug' })}
        terminalWidth={80}
        terminalHeight={20}
        onSave={noop}
        onCancel={noop}
      />,
    );
    expect(bugFrame()!).toContain('BUG');

    cleanup();

    const { lastFrame: epicFrame } = render(
      <EditScreen
        issue={makeIssue({ issue_type: 'epic' })}
        terminalWidth={80}
        terminalHeight={20}
        onSave={noop}
        onCancel={noop}
      />,
    );
    expect(epicFrame()!).toContain('EPC');
  });

  it('truncates long header at terminal width', () => {
    const longTitle = 'A'.repeat(200);
    const { lastFrame } = render(
      <EditScreen
        issue={makeIssue({ title: longTitle })}
        terminalWidth={40}
        terminalHeight={20}
        onSave={noop}
        onCancel={noop}
      />,
    );

    const frame = lastFrame()!;
    const headerLine = frame.split('\n')[0]!;
    // Header should be truncated with ellipsis
    expect(headerLine).toContain('…');
  });
});
