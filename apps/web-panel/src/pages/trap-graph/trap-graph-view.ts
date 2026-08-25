import type { G6Edge, G6Node, TrapNeighborhoodDepth } from '@trapmap/web-panel/shared/enum-types';

export type TrapNodeFilterState = {
  trap: boolean;
  cue: boolean;
  tool: boolean;
  environment: boolean;
  mitigation: boolean;
};

type GraphData = {
  nodes: G6Node[];
  edges: G6Edge[];
};

function isEnabledForLayer(node: G6Node, filters: TrapNodeFilterState): boolean {
  const kind = node.kind || 'unknown';
  if (kind === 'trap') return filters.trap;
  if (kind === 'cue') return filters.cue;
  if (kind === 'tool') return filters.tool;
  if (kind === 'environment') return filters.environment;
  if (kind === 'mitigation') return filters.mitigation;
  return true;
}

export function isTrapNodeVisibleForLayers(node: G6Node, filters: TrapNodeFilterState): boolean {
  return isEnabledForLayer(node, filters);
}

export function parseTrapNeighborhoodDepth(value: unknown): TrapNeighborhoodDepth {
  return value === '2' || value === 'all' ? value : '1';
}

function collectNeighborhood(
  data: GraphData,
  rootId: string,
  depth: TrapNeighborhoodDepth,
): Set<string> {
  const adjacency = new Map<string, string[]>();
  for (const node of data.nodes) adjacency.set(node.id, []);
  for (const edge of data.edges) {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) continue;
    adjacency.get(edge.source)?.push(edge.target);
    adjacency.get(edge.target)?.push(edge.source);
  }

  const visited = new Set([rootId]);
  let frontier = [rootId];
  const maxDepth = depth === 'all' ? Number.POSITIVE_INFINITY : Number.parseInt(depth, 10);

  for (let currentDepth = 0; currentDepth < maxDepth && frontier.length > 0; currentDepth += 1) {
    frontier = frontier
      .flatMap((nodeId) => adjacency.get(nodeId) ?? [])
      .filter((nodeId) => {
        if (visited.has(nodeId)) return false;
        visited.add(nodeId);
        return true;
      });
  }

  return visited;
}

export function applyTrapGraphView(
  data: GraphData,
  filters: TrapNodeFilterState,
  depth: TrapNeighborhoodDepth,
  selectedNodeId: string | null,
): GraphData {
  const layerNodes = data.nodes.filter((node) => isEnabledForLayer(node, filters));
  const layerNodeIds = new Set(layerNodes.map((node) => node.id));
  const visibleIds =
    selectedNodeId && layerNodeIds.has(selectedNodeId)
      ? collectNeighborhood({ nodes: layerNodes, edges: data.edges }, selectedNodeId, depth)
      : layerNodeIds;
  const visibleNodes = layerNodes.filter((node) => visibleIds.has(node.id));

  return {
    nodes: visibleNodes,
    edges: data.edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
  };
}
