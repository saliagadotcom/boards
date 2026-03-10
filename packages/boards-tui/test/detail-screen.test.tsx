import { afterEach, describe, expect, it } from 'bun:test';
import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import type { Issue, IssueDetail, DependencyWithIssue } from '@saliagadotcom/boards-core';
import { DetailScreen } from '../src/detail-screen.js';
import { buildLeftLines, buildRightLines } from '../src/detail-screen.js';

function makeIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: 'test-1',
    board: 'test',
    title: 'Test issue',
    description: 'A description',
    design: 'Some design',
    acceptance_criteria: 'AC here',
    notes: 'Some notes',
    status: 'open',
    priority: 2,
    issue_type: 'task',
    assignee: 'alice',
    owner: 'bob',
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-01-20T00:00:00Z',
    closed_at: null,
    close_reason: '',
    labels: ['important', 'v2'],
    ...overrides,
  };
}

function makeDetail(overrides: Partial<IssueDetail> = {}): IssueDetail {
  return {
    issue: makeIssue(),
    dependencies: [],
    dependents: [],
    comments: [],
    ...overrides,
  };
}

const noop = () => {};

afterEach(() => {
  cleanup();
});

// ── Pure function tests ────────────────────────────────────

describe('buildLeftLines', () => {
  it('renders all text sections', () => {
    const issue = makeIssue();
    const lines = buildLeftLines(issue);

    expect(lines).toContain('── Description ──');
    expect(lines).toContain('A description');
    expect(lines).toContain('── Design ──');
    expect(lines).toContain('Some design');
    expect(lines).toContain('── Acceptance Criteria ──');
    expect(lines).toContain('AC here');
    expect(lines).toContain('── Notes ──');
    expect(lines).toContain('Some notes');
  });

  it('shows em dash for blank fields', () => {
    const issue = makeIssue({ description: '', design: '', acceptance_criteria: '', notes: '' });
    const lines = buildLeftLines(issue);

    const emDashes = lines.filter((l) => l === '—');
    expect(emDashes.length).toBe(4);
  });
});

describe('buildRightLines', () => {
  it('renders metadata section', () => {
    const issue = makeIssue();
    const lines = buildRightLines(issue, [], []);

    expect(lines.some((l) => l.includes('Status:'))).toBe(true);
    expect(lines.some((l) => l.includes('Open'))).toBe(true);
    expect(lines.some((l) => l.includes('P2'))).toBe(true);
    expect(lines.some((l) => l.includes('task'))).toBe(true);
    expect(lines.some((l) => l.includes('alice'))).toBe(true);
    expect(lines.some((l) => l.includes('bob'))).toBe(true);
    expect(lines.some((l) => l.includes('test'))).toBe(true);
    expect(lines.some((l) => l.includes('important, v2'))).toBe(true);
    expect(lines.some((l) => l.includes('2026-01-15'))).toBe(true);
    expect(lines.some((l) => l.includes('2026-01-20'))).toBe(true);
  });

  it('shows em dash for blank assignee/owner', () => {
    const issue = makeIssue({ assignee: '', owner: '' });
    const lines = buildRightLines(issue, [], []);

    const assigneeLine = lines.find((l) => l.includes('Assignee:'));
    const ownerLine = lines.find((l) => l.includes('Owner:'));
    expect(assigneeLine).toContain('—');
    expect(ownerLine).toContain('—');
  });

  it('shows em dash for empty labels', () => {
    const issue = makeIssue({ labels: [] });
    const lines = buildRightLines(issue, [], []);

    const labelLine = lines.find((l) => l.includes('Labels:'));
    expect(labelLine).toContain('—');
  });

  it('shows closed_at and close_reason when present', () => {
    const issue = makeIssue({
      status: 'closed',
      closed_at: '2026-02-01T00:00:00Z',
      close_reason: 'Done',
    });
    const lines = buildRightLines(issue, [], []);

    expect(lines.some((l) => l.includes('2026-02-01'))).toBe(true);
    expect(lines.some((l) => l.includes('Done'))).toBe(true);
  });

  it('renders dependency lists', () => {
    const dep: DependencyWithIssue = {
      issue: makeIssue({ id: 'dep-1', title: 'Blocker' }),
      type: 'blocks',
      created_at: '2026-01-01T00:00:00Z',
    };
    const dependent: DependencyWithIssue = {
      issue: makeIssue({ id: 'dep-2', title: 'Downstream' }),
      type: 'blocks',
      created_at: '2026-01-01T00:00:00Z',
    };
    const lines = buildRightLines(makeIssue(), [dep], [dependent]);

    expect(lines.some((l) => l.includes('dep-1') && l.includes('Blocker'))).toBe(true);
    expect(lines.some((l) => l.includes('dep-2') && l.includes('Downstream'))).toBe(true);
  });

  it('shows (none) when no dependencies', () => {
    const lines = buildRightLines(makeIssue(), [], []);

    expect(lines.filter((l) => l.includes('(none)')).length).toBe(2);
  });
});

// ── Rendering tests ────────────────────────────────────────

describe('DetailScreen rendering', () => {
  it('shows loading state', () => {
    const { lastFrame } = render(
      <DetailScreen
        detail={null}
        loadState="loading"
        error={undefined}
        terminalWidth={120}
        terminalHeight={30}
        onBack={noop}
        onTree={noop}
      />,
    );

    expect(lastFrame()!).toContain('Loading issue');
  });

  it('shows not-found state', () => {
    const { lastFrame } = render(
      <DetailScreen
        detail={null}
        loadState="not-found"
        error="Issue not found"
        terminalWidth={120}
        terminalHeight={30}
        onBack={noop}
        onTree={noop}
      />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain('Issue not found');
    expect(frame).toContain('Escape');
  });

  it('shows error state', () => {
    const { lastFrame } = render(
      <DetailScreen
        detail={null}
        loadState="error"
        error="Connection failed"
        terminalWidth={120}
        terminalHeight={30}
        onBack={noop}
        onTree={noop}
      />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain('Error loading issue');
    expect(frame).toContain('Connection failed');
  });

  it('renders two-column layout at wide terminal', () => {
    const detail = makeDetail();
    const { lastFrame } = render(
      <DetailScreen
        detail={detail}
        loadState="loaded"
        error={undefined}
        terminalWidth={120}
        terminalHeight={30}
        onBack={noop}
        onTree={noop}
      />,
    );

    const frame = lastFrame()!;
    // Header should include type, priority, id, title
    expect(frame).toContain('TSK');
    expect(frame).toContain('P2');
    expect(frame).toContain('test-1');
    expect(frame).toContain('Test issue');
    // Left column content
    expect(frame).toContain('Description');
    expect(frame).toContain('A description');
    // Right column content
    expect(frame).toContain('Metadata');
    expect(frame).toContain('Open');
  });

  it('renders single-column layout at narrow terminal', () => {
    const detail = makeDetail();
    const { lastFrame } = render(
      <DetailScreen
        detail={detail}
        loadState="loaded"
        error={undefined}
        terminalWidth={60}
        terminalHeight={40}
        onBack={noop}
        onTree={noop}
      />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain('test-1');
    expect(frame).toContain('Description');
    expect(frame).toContain('Metadata');
  });

  it('renders scroll percentage', () => {
    const detail = makeDetail();
    const { lastFrame } = render(
      <DetailScreen
        detail={detail}
        loadState="loaded"
        error={undefined}
        terminalWidth={120}
        terminalHeight={30}
        onBack={noop}
        onTree={noop}
      />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain('100%');
  });
});
