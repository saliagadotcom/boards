import type { DependencyWithIssue, Issue } from '@saliagadotcom/boards-core';
import type { TreeDirection, TreeNode } from './types.js';

export function buildTree(
  rootIssue: Issue,
  depsMap: ReadonlyMap<string, DependencyWithIssue[]>,
  direction: TreeDirection,
  seen: Set<string> = new Set(),
  depth: number = 0,
): TreeNode {
  seen.add(rootIssue.id);

  const deps = depsMap.get(rootIssue.id) ?? [];
  const children = deps
    .filter(
      (dep) =>
        (dep.type === 'blocks' || dep.type === 'parent-child') &&
        !seen.has(dep.issue.id),
    )
    .map((dep) => buildTree(dep.issue, depsMap, direction, seen, depth + 1));

  return { issue: rootIssue, children, depth };
}

export function flattenTree(root: TreeNode): TreeNode[] {
  const result: TreeNode[] = [root];
  for (const child of root.children) {
    result.push(...flattenTree(child));
  }
  return result;
}
