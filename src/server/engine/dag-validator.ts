import { ValidationResult, WorkflowEdge, WorkflowNode } from '../../types/workflow.js';

export class DAGValidator {
  /**
   * Validates a workflow definition against DAG principles:
   * 1. Detects cycles using the classic 3-color DFS algorithm (White / Gray / Black)
   * 2. Checks for trigger / entry points
   * 3. Detects orphan nodes (unreachable or disconnected)
   * 4. Validates condition nodes (checks that true and false branches are configured)
   * 5. Computes topological levels for parallel/sequential step scheduling
   */
  public static validate(nodes: WorkflowNode[], edges: WorkflowEdge[]): ValidationResult {
    const errors: ValidationResult['errors'] = [];
    const warnings: ValidationResult['warnings'] = [];

    // Map nodes by id
    const nodeMap = new Map<string, WorkflowNode>();
    for (const node of nodes) {
      nodeMap.set(node.id, node);
    }

    // Build adjacency list & reverse adjacency list (in-degree / out-degree)
    const adj = new Map<string, string[]>();
    const revAdj = new Map<string, string[]>();
    for (const node of nodes) {
      adj.set(node.id, []);
      revAdj.set(node.id, []);
    }

    for (const edge of edges) {
      if (adj.has(edge.source) && adj.has(edge.target)) {
        adj.get(edge.source)!.push(edge.target);
        revAdj.get(edge.target)!.push(edge.source);
      }
    }

    // 1. Check for trigger nodes
    const triggerNodes = nodes.filter((n) => n.data.nodeType === 'trigger');
    if (triggerNodes.length === 0) {
      errors.push({
        type: 'missing_trigger',
        message: 'Workflow requires at least one Trigger node to initiate execution.',
        nodeIds: [],
      });
    }

    // 2. Cycle Detection using White-Gray-Black DFS (0 = White, 1 = Gray, 2 = Black)
    const color = new Map<string, number>();
    const parent = new Map<string, string | null>();
    for (const node of nodes) {
      color.set(node.id, 0); // 0 = White
      parent.set(node.id, null);
    }

    let cycleFound = false;
    let cycleNodes: string[] = [];

    const dfs = (u: string, path: string[]) => {
      color.set(u, 1); // 1 = Gray
      path.push(u);

      const neighbors = adj.get(u) || [];
      for (const v of neighbors) {
        if (cycleFound) return;
        const vColor = color.get(v) ?? 0;

        if (vColor === 1) {
          // Found back-edge to a node in current recursion stack -> Directed Cycle detected!
          cycleFound = true;
          const cycleStartIndex = path.indexOf(v);
          cycleNodes = [...path.slice(cycleStartIndex), v];
          return;
        } else if (vColor === 0) {
          parent.set(v, u);
          dfs(v, path);
        }
      }

      path.pop();
      color.set(u, 2); // 2 = Black
    };

    for (const node of nodes) {
      if ((color.get(node.id) ?? 0) === 0) {
        dfs(node.id, []);
        if (cycleFound) break;
      }
    }

    if (cycleFound) {
      const cycleLabels = cycleNodes
        .map((id) => nodeMap.get(id)?.data.label || id)
        .join(' ➔ ');
      errors.push({
        type: 'cycle',
        message: `Cyclic loop detected: ${cycleLabels}. Workflow pipelines must be a Directed Acyclic Graph (DAG) with no recursive loops.`,
        nodeIds: cycleNodes,
      });
    }

    // 3. Reachability from Triggers (Forward traversal)
    if (triggerNodes.length > 0) {
      const reachable = new Set<string>();
      const queue = triggerNodes.map((n) => n.id);
      for (const id of queue) reachable.add(id);

      while (queue.length > 0) {
        const curr = queue.shift()!;
        for (const next of adj.get(curr) || []) {
          if (!reachable.has(next)) {
            reachable.add(next);
            queue.push(next);
          }
        }
      }

      const unreachableNodes = nodes.filter((n) => !reachable.has(n.id) && n.data.nodeType !== 'trigger');
      if (unreachableNodes.length > 0) {
        warnings.push({
          message: `${unreachableNodes.length} node(s) cannot be reached from any Trigger entry point and will not execute.`,
          nodeIds: unreachableNodes.map((n) => n.id),
        });
      }
    }

    // 4. Orphan Node Detection (0 in-degree and 0 out-degree)
    const orphans = nodes.filter((n) => (adj.get(n.id)?.length || 0) === 0 && (revAdj.get(n.id)?.length || 0) === 0);
    if (orphans.length > 0) {
      errors.push({
        type: 'orphan',
        message: `${orphans.length} orphan node(s) exist completely disconnected from the workflow graph.`,
        nodeIds: orphans.map((n) => n.id),
      });
    }

    // 5. Condition Node Validation
    const conditionNodes = nodes.filter((n) => n.data.nodeType === 'condition');
    for (const cNode of conditionNodes) {
      const outEdges = edges.filter((e) => e.source === cNode.id);
      const hasTrue = outEdges.some((e) => e.sourceHandle === 'true' || e.label?.toLowerCase().includes('true'));
      const hasFalse = outEdges.some((e) => e.sourceHandle === 'false' || e.label?.toLowerCase().includes('false'));

      if (!hasTrue || !hasFalse) {
        warnings.push({
          message: `Condition node "${cNode.data.label}" is missing a ${!hasTrue ? 'True' : 'False'} branch edge.`,
          nodeIds: [cNode.id],
        });
      }
    }

    // 6. Compute Topological Levels (Kahn's Algorithm for DAG layering)
    const topologicalLevels: string[][] = [];
    if (!cycleFound) {
      const inDegree = new Map<string, number>();
      for (const node of nodes) {
        inDegree.set(node.id, revAdj.get(node.id)?.length || 0);
      }

      let currentLevel = nodes.filter((n) => (inDegree.get(n.id) || 0) === 0).map((n) => n.id);

      while (currentLevel.length > 0) {
        topologicalLevels.push(currentLevel);
        const nextLevel: string[] = [];

        for (const u of currentLevel) {
          for (const v of adj.get(u) || []) {
            const deg = (inDegree.get(v) || 0) - 1;
            inDegree.set(v, deg);
            if (deg === 0) {
              nextLevel.push(v);
            }
          }
        }
        currentLevel = nextLevel;
      }
    }

    return {
      isValid: errors.length === 0,
      hasCycle: cycleFound,
      cycleNodes,
      errors,
      warnings,
      topologicalLevels,
    };
  }
}
