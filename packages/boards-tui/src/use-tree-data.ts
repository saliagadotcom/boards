import { useCallback, useEffect, useRef, useState } from 'react';
import type { DependencyWithIssue, IBoardsStore, Issue } from '@saliagadotcom/boards-core';
import type { TreeDirection, TreeNode } from './types.js';
import { buildTree, flattenTree } from './tree.js';

export interface UseTreeDataOptions {
  store: IBoardsStore;
  issueId: string;
  direction: TreeDirection;
}

export interface TreeData {
  rootIssue: Issue | null;
  flatNodes: TreeNode[];
  loading: boolean;
}

export function useTreeData({
  store,
  issueId,
  direction,
}: UseTreeDataOptions): TreeData {
  const [rootIssue, setRootIssue] = useState<Issue | null>(null);
  const [flatNodes, setFlatNodes] = useState<TreeNode[]>([]);
  const [loading, setLoading] = useState(true);

  const inFlightRef = useRef(false);

  const fetchTree = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const detail = await store.showIssue(issueId);
      setRootIssue(detail.issue);

      const deps = direction === 'down' ? detail.dependents : detail.dependencies;
      const depsMap = new Map<string, DependencyWithIssue[]>();
      depsMap.set(issueId, deps);

      // Fetch one level deep for each dependency
      for (const dep of deps) {
        if (dep.type === 'blocks' || dep.type === 'parent-child') {
          try {
            const childDetail = await store.showIssue(dep.issue.id);
            const childDeps = direction === 'down' ? childDetail.dependents : childDetail.dependencies;
            depsMap.set(dep.issue.id, childDeps);
          } catch {
            // Silently skip failed lookups
          }
        }
      }

      const tree = buildTree(detail.issue, depsMap, direction);
      setFlatNodes(flattenTree(tree));
      setLoading(false);
    } catch {
      setFlatNodes([]);
      setLoading(false);
    } finally {
      inFlightRef.current = false;
    }
  }, [store, issueId, direction]);

  useEffect(() => {
    setLoading(true);
    void fetchTree();
  }, [fetchTree]);

  return { rootIssue, flatNodes, loading };
}
