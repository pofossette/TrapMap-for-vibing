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

import type { Scope } from '@trapmap/contracts';

// ---------------------------------------------------------------------------
// Node and edge record types
// ---------------------------------------------------------------------------

/**
 * Kinds of graph nodes in the TrapMap-specific vocabulary.
 */
export type GraphNodeKind =
  | 'trap'
  | 'skill'
  | 'cue'
  | 'tool'
  | 'environment'
  | 'prerequisite'
  | 'mitigation'
  | 'boundary-context' // Context labels like "frontend", "production"
  | 'boundary-version' // Version constraints like "react>=16.8.0"
  | 'boundary-platform'; // Platform identifiers like "linux", "docker"

/**
 * Typed relation vocabulary for the GraphRAG-lite index.
 */
export type GraphRelationType =
  | 'mitigates'
  | 'requires'
  | 'order'
  | 'risk-blocks'
  | 'co-occurs-with'
  | 'applies-in' // Entry applies in this context (trap -> boundary-context)
  | 'requires-version' // Entry requires this version (trap -> boundary-version)
  | 'excludes-context' // Entry excluded in this context (trap -> boundary-context)
  | 'excludes-version'; // Entry incompatible with this version (trap -> boundary-version)

/**
 * Edge strength distinguishing hard dependencies from soft precedence.
 * GraSP: hard edges must be respected by the compiler; soft edges may be reordered.
 */
export type GraphRelationStrength = 'hard' | 'soft';

/**
 * A single node record within a graph document.
 */
export interface GraphNodeRecord {
  /** Unique node identifier scoped to the graph document */
  id: string;
  /** Node kind from the TrapMap vocabulary */
  kind: GraphNodeKind;
  /** Human-readable label */
  label: string;
  /** Evidence text justifying this node */
  evidence: string;
  /** Pre-computed severity for trap nodes. Derived from risk-blocks edge strength. */
  severity?: 'hard' | 'soft';
}

/**
 * A single edge record within a graph document.
 */
export interface GraphEdgeRecord {
  /** Unique edge identifier scoped to the graph document */
  id: string;
  /** Source node id */
  sourceNodeId: string;
  /** Target node id */
  targetNodeId: string;
  /** Relation type from the locked vocabulary */
  relationType: GraphRelationType;
  /** Hard vs soft edge strength */
  strength: GraphRelationStrength;
  /** Evidence text justifying this edge */
  evidence: string;
}

// ---------------------------------------------------------------------------
// Document record type
// ---------------------------------------------------------------------------

/**
 * Durable graph document record stored in the JSON store.
 * Keyed by {sourceType, sourceId, revision} for deterministic upsert/remove.
 */
export interface GraphIndexDocumentRecord {
  /** Unique document identifier */
  id: string;
  /** Source type: trap (knowledge entry) or skill (artifact) */
  sourceType: 'trap' | 'skill';
  /** Source entity identifier (entry ID or artifact ID) */
  sourceId: string;
  /** Source revision number */
  revision: number;
  /** SHA-256 hash of the document content */
  contentHash: string;
  /** Team ID (null for global scope) */
  teamId: string | null;
  /** Governance scope */
  scope: Scope;
  /** Required security level (inherited from source) */
  requiredLevel: number;
  /** Graph nodes in this document */
  nodes: GraphNodeRecord[];
  /** Graph edges in this document */
  edges: GraphEdgeRecord[];
  /** Human-readable evidence description for audit trail */
  evidence: string;
  /** ISO timestamp when document was created */
  createdAt: string;
  /** ISO timestamp when document was last updated */
  updatedAt: string;
}

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
