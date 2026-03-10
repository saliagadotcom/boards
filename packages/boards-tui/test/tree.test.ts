import { describe, expect, it } from 'bun:test';
import type { DependencyWithIssue, Issue } from '@saliagadotcom/boards-core';
import { buildTree, flattenTree } from '../src/tree.js';

function mockIssue(id: string, title = `Issue ${id}`): Issue {
  return {
    id,
    board: 'test',
    title,
    description: '',
    design: '',
    acceptance_criteria: '',
    notes: '',
    status: 'open',
    priority: 0,
    issue_type: 'task',
    assignee: '',
    owner: '',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    closed_at: null,
    close_reason: '',
    labels: [],
  };
}

function mockDep(
  issue: Issue,
  type: DependencyWithIssue['type'] = 'blocks',
): DependencyWithIssue {
  return { issue, type, created_at: '2025-01-01T00:00:00Z' };
}

describe('buildTree', () => {
  it('down: follows blocks + parent-child relationships', () => {
    const root = mockIssue('A');
    const childB = mockIssue('B');
    const childC = mockIssue('C');

    const depsMap = new Map<string, DependencyWithIssue[]>([
      ['A', [mockDep(childB, 'blocks'), mockDep(childC, 'parent-child')]],
    ]);

    const tree = buildTree(root, depsMap, 'down');

    expect(tree.issue.id).toBe('A');
    expect(tree.depth).toBe(0);
    expect(tree.children).toHaveLength(2);
    expect(tree.children[0].issue.id).toBe('B');
    expect(tree.children[0].depth).toBe(1);
    expect(tree.children[1].issue.id).toBe('C');
    expect(tree.children[1].depth).toBe(1);
  });

  it('up: follows blocked-by + parent relationships', () => {
    const root = mockIssue('C');
    const parentA = mockIssue('A');

    const depsMap = new Map<string, DependencyWithIssue[]>([
      ['C', [mockDep(parentA, 'blocks')]],
    ]);

    const tree = buildTree(root, depsMap, 'up');

    expect(tree.issue.id).toBe('C');
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].issue.id).toBe('A');
  });

  it('filters out related and discovered-from types', () => {
    const root = mockIssue('A');
    const dep1 = mockIssue('B');
    const dep2 = mockIssue('C');

    const depsMap = new Map<string, DependencyWithIssue[]>([
      ['A', [mockDep(dep1, 'related'), mockDep(dep2, 'discovered-from')]],
    ]);

    const tree = buildTree(root, depsMap, 'down');

    expect(tree.children).toHaveLength(0);
  });

  it('cycle detection: seen set prevents revisiting nodes', () => {
    const root = mockIssue('A');
    const childB = mockIssue('B');

    const depsMap = new Map<string, DependencyWithIssue[]>([
      ['A', [mockDep(childB, 'blocks')]],
      ['B', [mockDep(mockIssue('A'), 'blocks')]],
    ]);

    const tree = buildTree(root, depsMap, 'down');

    expect(tree.issue.id).toBe('A');
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0].issue.id).toBe('B');
    expect(tree.children[0].children).toHaveLength(0);
  });

  it('single root with no deps: returns node with empty children', () => {
    const root = mockIssue('solo');
    const depsMap = new Map<string, DependencyWithIssue[]>();

    const tree = buildTree(root, depsMap, 'down');

    expect(tree.issue.id).toBe('solo');
    expect(tree.children).toHaveLength(0);
    expect(tree.depth).toBe(0);
  });

  it('deep nesting: correctly sets depth on each node', () => {
    const a = mockIssue('A');
    const b = mockIssue('B');
    const c = mockIssue('C');
    const d = mockIssue('D');

    const depsMap = new Map<string, DependencyWithIssue[]>([
      ['A', [mockDep(b, 'blocks')]],
      ['B', [mockDep(c, 'parent-child')]],
      ['C', [mockDep(d, 'blocks')]],
    ]);

    const tree = buildTree(a, depsMap, 'down');

    expect(tree.depth).toBe(0);
    expect(tree.children[0].depth).toBe(1);
    expect(tree.children[0].children[0].depth).toBe(2);
    expect(tree.children[0].children[0].children[0].depth).toBe(3);
  });
});

describe('flattenTree', () => {
  it('returns depth-first ordered array', () => {
    const a = mockIssue('A');
    const b = mockIssue('B');
    const c = mockIssue('C');
    const d = mockIssue('D');

    const depsMap = new Map<string, DependencyWithIssue[]>([
      ['A', [mockDep(b, 'blocks'), mockDep(c, 'blocks')]],
      ['B', [mockDep(d, 'parent-child')]],
    ]);

    const tree = buildTree(a, depsMap, 'down');
    const flat = flattenTree(tree);

    expect(flat.map((n) => n.issue.id)).toEqual(['A', 'B', 'D', 'C']);
  });

  it('single node returns array with one element', () => {
    const root = mockIssue('X');
    const tree = buildTree(root, new Map(), 'down');
    const flat = flattenTree(tree);

    expect(flat).toHaveLength(1);
    expect(flat[0].issue.id).toBe('X');
  });
});
