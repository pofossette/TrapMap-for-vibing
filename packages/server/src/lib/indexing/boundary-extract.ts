/**
 * Boundary graph extraction for GraphRAG-lite indexing.
 *
 * Extracts graph nodes and edges from Boundary objects:
 * - Context labels become boundary-context nodes
 * - Version constraints become boundary-version nodes
 * - Platforms from exclusions become boundary-platform nodes
 * - Relations connect trap to boundary nodes with typed edges
 */

import type {
  Boundary,
  GraphNodeKind,
  GraphRelationStrength,
  GraphRelationType,
} from '@trapmap/contracts';
import {
  buildBoundaryFacetIndex,
  buildContextNodeId,
  buildPlatformNodeId,
  buildVersionNodeId,
  extractPlatformsFromExclusions,
} from './boundary-normalize.js';

/**
 * Extracted boundary graph node.
 */
export interface BoundaryGraphNode {
  id: string;
  kind: GraphNodeKind;
  label: string;
  evidence: string;
}

/**
 * Extracted boundary graph edge.
 */
export interface BoundaryGraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationType: GraphRelationType;
  strength: GraphRelationStrength;
  evidence: string;
}

/**
 * Result of boundary graph extraction.
 */
export interface BoundaryGraphExtractionResult {
  nodes: BoundaryGraphNode[];
  edges: BoundaryGraphEdge[];
  facets: {
    contexts: string[];
    packages: string[];
    platforms: string[];
    versionConstraints: string[];
  };
}

/**
 * Extract graph nodes and edges from a Boundary object.
 *
 * @param trapNodeId - The trap node ID (e.g., 'trap:entry-123')
 * @param boundary - The boundary object (may be null)
 * @returns Extracted nodes, edges, and facets
 */
export function extractBoundaryGraphEntities(
  trapNodeId: string,
  boundary: Boundary | null,
): BoundaryGraphExtractionResult {
  const nodes: BoundaryGraphNode[] = [];
  const edges: BoundaryGraphEdge[] = [];
  const seenNodes = new Set<string>();

  // Build facets for keyword adapter
  const facets = buildBoundaryFacetIndex(boundary);

  // Handle null boundary
  if (!boundary) {
    return { nodes, edges, facets };
  }

  // Helper to add node if not already seen
  const addNode = (node: BoundaryGraphNode) => {
    if (!seenNodes.has(node.id)) {
      nodes.push(node);
      seenNodes.add(node.id);
    }
  };

  // Extract context nodes (applies-in relations)
  for (const contextLabel of boundary.context) {
    const nodeId = buildContextNodeId(contextLabel);
    addNode({
      id: nodeId,
      kind: 'boundary-context',
      label: contextLabel,
      evidence: `context: ${contextLabel}`,
    });
    edges.push({
      id: `${trapNodeId}->${nodeId}:applies-in`,
      sourceNodeId: trapNodeId,
      targetNodeId: nodeId,
      relationType: 'applies-in',
      strength: 'soft',
      evidence: `entry applies in context: ${contextLabel}`,
    });
  }

  // Extract version constraint nodes (requires-version relations)
  for (const constraint of boundary.versions) {
    const nodeId = buildVersionNodeId(constraint);
    const label = `${constraint.package}@${constraint.range}`;
    addNode({
      id: nodeId,
      kind: 'boundary-version',
      label,
      evidence: constraint.note ?? `version: ${label}`,
    });
    edges.push({
      id: `${trapNodeId}->${nodeId}:requires-version`,
      sourceNodeId: trapNodeId,
      targetNodeId: nodeId,
      relationType: 'requires-version',
      strength: 'hard', // Version requirements are hard dependencies
      evidence: `entry requires ${label}`,
    });
  }

  // Extract platform nodes from exclusions (excludes-context relations)
  const platforms = extractPlatformsFromExclusions(boundary.exclusions);
  for (const platform of platforms) {
    const nodeId = buildPlatformNodeId(platform);
    addNode({
      id: nodeId,
      kind: 'boundary-platform',
      label: platform,
      evidence: `excluded platform: ${platform}`,
    });
    edges.push({
      id: `${trapNodeId}->${nodeId}:excludes-context`,
      sourceNodeId: trapNodeId,
      targetNodeId: nodeId,
      relationType: 'excludes-context',
      strength: 'soft', // Exclusions are for ranking, not hard blocks
      evidence: `entry excluded on platform: ${platform}`,
    });
  }

  // Extract version exclusion nodes
  for (const exclusion of boundary.exclusions) {
    if (exclusion.kind === 'version') {
      // Parse version exclusion from description
      // e.g., "Not compatible with Node.js 12 or below"
      const versionMatch = exclusion.description.match(
        /(node|npm|python|java|typescript)\s*(\d+\.?\d*)/i,
      );
      if (versionMatch) {
        const tool = (versionMatch[1] ?? 'unknown').toLowerCase();
        const version = versionMatch[2] ?? '';
        const nodeId = `boundary-version:${tool}@<${version}`;
        addNode({
          id: nodeId,
          kind: 'boundary-version',
          label: `${tool}<${version}`,
          evidence: `excluded: ${exclusion.description}`,
        });
        edges.push({
          id: `${trapNodeId}->${nodeId}:excludes-version`,
          sourceNodeId: trapNodeId,
          targetNodeId: nodeId,
          relationType: 'excludes-version',
          strength: 'soft',
          evidence: exclusion.description,
        });
      }
    }
  }

  return { nodes, edges, facets };
}
