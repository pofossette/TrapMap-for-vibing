/**
 * GraphRAG-lite document types and builders for durable graph persistence.
 *
 * Provides typed node/edge records, document builders for trap and skill sources,
 * and the core GraphIndexDocumentRecord that is stored in the JSON store.
 *
 * Builders accept only caller-supplied derived text and metadata.
 * They do NOT read assets/ or scripts/ payload bodies (D-01/D-02).
 */

import { createHash } from 'node:crypto';

import type {
  GraphEdgeRecord,
  GraphIndexDocumentRecord,
  GraphNodeRecord,
  Scope,
} from '@trapmap/contracts';

export type {
  GraphEdgeRecord,
  GraphIndexDocumentRecord,
  GraphNodeKind,
  GraphNodeRecord,
  GraphRelationStrength,
  GraphRelationType,
} from '@trapmap/contracts';

// ---------------------------------------------------------------------------
// Document builders
// ---------------------------------------------------------------------------

/**
 * Input for building a trap-sourced graph document.
 */
export interface TrapGraphDocumentInput {
  sourceId: string;
  revision: number;
  teamId: string | null;
  scope: Scope;
  requiredLevel: number;
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
}

/**
 * Input for building a skill-sourced graph document.
 * Requires derivedTextHash to prove caller used approved capsule/profile text only.
 */
export interface SkillGraphDocumentInput {
  artifactId: string;
  revision: number;
  teamId: string | null;
  scope: Scope;
  requiredLevel: number;
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
  /** Hash of derived text (capsule/profile) to prove activation-only bodies were not used */
  derivedTextHash: string;
}

/**
 * Build a graph document from a trap (knowledge entry) source.
 */
export function buildTrapGraphDocument(input: TrapGraphDocumentInput): GraphIndexDocumentRecord {
  const contentHash = computeDocumentHash(input.nodes, input.edges);
  const now = new Date().toISOString();

  return {
    id: `graphdoc_trap_${input.sourceId}_r${input.revision}`,
    sourceType: 'trap',
    sourceId: input.sourceId,
    revision: input.revision,
    contentHash,
    teamId: input.teamId,
    scope: input.scope,
    requiredLevel: input.requiredLevel,
    nodes: input.nodes,
    edges: input.edges,
    evidence: `derived from approved trap entry ${input.sourceId} revision ${input.revision}`,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Build a graph document from a skill artifact source.
 * Caller must supply derivedTextHash proving they used approved capsule/profile text only.
 */
export function buildSkillGraphDocument(input: SkillGraphDocumentInput): GraphIndexDocumentRecord {
  const contentHash = computeDocumentHash(input.nodes, input.edges);
  const now = new Date().toISOString();

  return {
    id: `graphdoc_skill_${input.artifactId}_r${input.revision}`,
    sourceType: 'skill',
    sourceId: input.artifactId,
    revision: input.revision,
    contentHash,
    teamId: input.teamId,
    scope: input.scope,
    requiredLevel: input.requiredLevel,
    nodes: input.nodes,
    edges: input.edges,
    evidence: `derived from approved capsule/profile text for artifact ${input.artifactId} revision ${input.revision}`,
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeDocumentHash(nodes: GraphNodeRecord[], edges: GraphEdgeRecord[]): string {
  const hash = createHash('sha256');
  for (const node of nodes) {
    hash.update(`node:${node.id}:${node.kind}:${node.label}`);
  }
  for (const edge of edges) {
    hash.update(
      `edge:${edge.id}:${edge.sourceNodeId}->${edge.targetNodeId}:${edge.relationType}:${edge.strength}`,
    );
  }
  return hash.digest('hex');
}
