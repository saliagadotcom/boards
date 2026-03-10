import { afterEach, describe, expect, it } from 'bun:test';
import React from 'react';
import { render, cleanup } from 'ink-testing-library';
import type { Issue } from '@saliagadotcom/boards-core';
import type { TreeNode } from '../src/types.js';
import { TreeScreen, calculateTreeScroll, buildBranchPrefix, renderNodeLine } from '../src/tree-screen.js';

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

function makeNode(id: string, depth: number, children: TreeNode[] = []): TreeNode {
  return {
    issue: makeIssue({ id, title: `Issue ${id}` }),
    depth,
    children,
  };
}

const noop = () => {};

afterEach(() => {
  cleanup();
});

// ── calculateTreeScroll ────────────────────────────────────

describe('calculateTreeScroll', () => {
  it('shows all nodes when they fit', () => {
    const result = calculateTreeScroll(5, 2, 10);
    expect(result).toEqual({ start: 0, end: 5, aboveCount: 0, belowCount: 0 });
  });

  it('centres cursor and reports above/below counts', () => {
    const result = calculateTreeScroll(20, 10, 5);
    expect(result.end - result.start).toBe(5);
    expect(result.start).toBeLessThanOrEqual(10);
    expect(result.end).toBeGreaterThan(10);
    expect(result.aboveCount).toBe(result.start);
    expect(result.belowCount).toBe(20 - result.end);
  });

  it('clamps at start', () => {
    const result = calculateTreeScroll(20, 0, 5);
    expect(result.start).toBe(0);
    expect(result.aboveCount).toBe(0);
    expect(result.belowCount).toBe(15);
  });

  it('clamps at end', () => {
    const result = calculateTreeScroll(20, 19, 5);
    expect(result.end).toBe(20);
    expect(result.belowCount).toBe(0);
    expect(result.aboveCount).toBe(15);
  });
});

// ── buildBranchPrefix ──────────────────────────────────────

describe('buildBranchPrefix', () => {
  it('returns empty string for root (depth 0)', () => {
    const root = makeNode('a', 0);
    const nodes = [root];
    expect(buildBranchPrefix(root, nodes, 0)).toBe('');
  });

  it('returns └─ for last child at depth 1', () => {
    const root = makeNode('a', 0);
    const child = makeNode('b', 1);
    const nodes = [root, child];
    expect(buildBranchPrefix(child, nodes, 1)).toBe('└─ ');
  });

  it('returns ├─ for non-last child at depth 1', () => {
    const root = makeNode('a', 0);
    const child1 = makeNode('b', 1);
    const child2 = makeNode('c', 1);
    const nodes = [root, child1, child2];
    expect(buildBranchPrefix(child1, nodes, 1)).toBe('├─ ');
  });

  it('returns │  └─ for last child at depth 2 with continuing parent', () => {
    const root = makeNode('a', 0);
    const child1 = makeNode('b', 1);
    const grandchild = makeNode('c', 2);
    const child2 = makeNode('d', 1);
    const nodes = [root, child1, grandchild, child2];
    expect(buildBranchPrefix(grandchild, nodes, 2)).toBe('│  └─ ');
  });

  it('returns    └─ for last child at depth 2 without continuing parent', () => {
    const root = makeNode('a', 0);
    const child = makeNode('b', 1);
    const grandchild = makeNode('c', 2);
    const nodes = [root, child, grandchild];
    expect(buildBranchPrefix(grandchild, nodes, 2)).toBe('   └─ ');
  });
});

// ── renderNodeLine ─────────────────────────────────────────

describe('renderNodeLine', () => {
  it('renders cursor indicator for selected node', () => {
    const node = makeNode('a-1', 0);
    const line = renderNodeLine(node, [node], 0, true, 80);
    expect(line.startsWith('> ')).toBe(true);
  });

  it('renders no cursor for unselected node', () => {
    const node = makeNode('a-1', 0);
    const line = renderNodeLine(node, [node], 0, false, 80);
    expect(line.startsWith('  ')).toBe(true);
  });

  it('includes status indicator, priority, id, and title', () => {
    const node = makeNode('a-1', 0);
    const line = renderNodeLine(node, [node], 0, false, 80);
    expect(line).toContain('○');
    expect(line).toContain('[P2]');
    expect(line).toContain('a-1');
    expect(line).toContain('Issue a-1');
  });

  it('truncates long titles', () => {
    const node = makeNode('a-1', 0);
    node.issue.title = 'A'.repeat(200);
    const line = renderNodeLine(node, [node], 0, false, 40);
    expect(line.length).toBeLessThanOrEqual(40);
    expect(line).toContain('…');
  });
});

// ── TreeScreen rendering ───────────────────────────────────

describe('TreeScreen rendering', () => {
  it('shows loading state', () => {
    const { lastFrame } = render(
      <TreeScreen
        rootIssue={null}
        flatNodes={[]}
        loading={true}
        direction="down"
        terminalWidth={80}
        terminalHeight={24}
        onBack={noop}
        onToggleDirection={noop}
      />,
    );

    expect(lastFrame()!).toContain('Loading tree');
  });

  it('shows no-deps message when flatNodes is empty', () => {
    const { lastFrame } = render(
      <TreeScreen
        rootIssue={makeIssue()}
        flatNodes={[]}
        loading={false}
        direction="down"
        terminalWidth={80}
        terminalHeight={24}
        onBack={noop}
        onToggleDirection={noop}
      />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain('No dependencies');
    expect(frame).toContain('Press d');
  });

  it('renders tree with branch characters', () => {
    const root = makeNode('a-1', 0);
    const child = makeNode('b-1', 1);
    const nodes = [root, child];

    const { lastFrame } = render(
      <TreeScreen
        rootIssue={root.issue}
        flatNodes={nodes}
        loading={false}
        direction="down"
        terminalWidth={80}
        terminalHeight={24}
        onBack={noop}
        onToggleDirection={noop}
      />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain('a-1');
    expect(frame).toContain('b-1');
    expect(frame).toContain('└─');
  });

  it('shows direction in header', () => {
    const root = makeNode('a-1', 0);

    const { lastFrame: downFrame } = render(
      <TreeScreen
        rootIssue={root.issue}
        flatNodes={[root]}
        loading={false}
        direction="down"
        terminalWidth={80}
        terminalHeight={24}
        onBack={noop}
        onToggleDirection={noop}
      />,
    );
    expect(downFrame()!).toContain('blocks');

    cleanup();

    const { lastFrame: upFrame } = render(
      <TreeScreen
        rootIssue={root.issue}
        flatNodes={[root]}
        loading={false}
        direction="up"
        terminalWidth={80}
        terminalHeight={24}
        onBack={noop}
        onToggleDirection={noop}
      />,
    );
    expect(upFrame()!).toContain('blocked by');
  });

  it('shows scroll indicators when tree exceeds viewport', () => {
    // Create enough nodes to overflow
    const nodes: TreeNode[] = [];
    for (let i = 0; i < 30; i++) {
      nodes.push(makeNode(`n-${i}`, 0));
    }

    const { lastFrame } = render(
      <TreeScreen
        rootIssue={nodes[0]!.issue}
        flatNodes={nodes}
        loading={false}
        direction="down"
        terminalWidth={80}
        terminalHeight={10}
        onBack={noop}
        onToggleDirection={noop}
      />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain('more below');
  });
});
