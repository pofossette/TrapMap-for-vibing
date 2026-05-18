import { z } from 'zod';

/**
 * Graph node kinds that the LLM can extract.
 * Reuses the existing GraphNodeKind vocabulary from graph-lite/documents.ts
 * (excluding boundary-context, boundary-version, boundary-platform which are
 * extracted by boundary-extract.ts, not by LLM).
 */
export const llmNodeKindSchema = z.enum([
  'trap',
  'skill',
  'cue',
  'tool',
  'environment',
  'prerequisite',
  'mitigation',
]);

/**
 * Graph relation types that the LLM can assign to edges.
 * Reuses the existing GraphRelationType vocabulary from graph-lite/documents.ts
 * (excluding boundary-specific relations extracted by boundary-extract.ts).
 */
export const llmRelationTypeSchema = z.enum([
  'mitigates',
  'requires',
  'order',
  'risk-blocks',
  'co-occurs-with',
]);

/**
 * Relation strength classification.
 * hard: mandatory, blocking dependency (e.g., "requires X", "must do Y")
 * soft: optional, co-occurrence (e.g., "often used with X", "may need Y")
 */
export const llmRelationStrengthSchema = z.enum(['hard', 'soft']);

/**
 * A single graph node extracted by the LLM.
 *
 * @example { kind: 'tool', label: 'docker', description: 'Container runtime used for deployment' }
 */
export const llmGraphNodeSchema = z.object({
  kind: llmNodeKindSchema,
  label: z.string().min(1).max(128),
  description: z.string().max(512).optional(),
});

/**
 * A single graph edge extracted by the LLM.
 *
 * sourceLabel and targetLabel reference node labels (not IDs).
 * ID mapping happens downstream via buildNodeId().
 *
 * @example { sourceLabel: 'docker', targetLabel: 'container-timeout', relationType: 'co-occurs-with', strength: 'soft' }
 */
export const llmGraphEdgeSchema = z.object({
  sourceLabel: z.string().min(1).max(128),
  targetLabel: z.string().min(1).max(128),
  relationType: llmRelationTypeSchema,
  strength: llmRelationStrengthSchema,
  description: z.string().max(512).optional(),
});

/**
 * Full extraction result from a single LLM call.
 *
 * Constrained to prevent hallucination bloat:
 * - max 15 nodes, max 20 edges
 */
export const llmGraphExtractionSchema = z.object({
  nodes: z.array(llmGraphNodeSchema).max(15),
  edges: z.array(llmGraphEdgeSchema).max(20),
});

/**
 * Phase 1: Segment plan produced by the planning LLM call.
 *
 * For short text (<= CHUNK_THRESHOLD), a single segment is returned
 * without an LLM call. For longer text, the LLM divides it into
 * contextually meaningful segments.
 */
export const extractionPlanSegmentSchema = z.object({
  text: z.string().min(1),
  contextHint: z.string().max(256).optional(),
  priority: z.number().int().min(1).max(10).default(1),
});

export const extractionPlanSchema = z.object({
  segments: z.array(extractionPlanSegmentSchema).min(1).max(10),
});

/**
 * Metrics collected during LLM extraction for observability.
 */
export const extractionMetricsSchema = z.object({
  llmSuccessCount: z.number().int().min(0).default(0),
  cacheHitCount: z.number().int().min(0).default(0),
  fallbackCount: z.number().int().min(0).default(0),
  phase1Ms: z.number().min(0).default(0),
  phase2Ms: z.number().min(0).default(0),
  gleaningCount: z.number().int().min(0).default(0),
});

// --- Exported Types ---

export type LlmNodeKind = z.infer<typeof llmNodeKindSchema>;
export type LlmRelationType = z.infer<typeof llmRelationTypeSchema>;
export type LlmRelationStrength = z.infer<typeof llmRelationStrengthSchema>;
export type LlmGraphNode = z.infer<typeof llmGraphNodeSchema>;
export type LlmGraphEdge = z.infer<typeof llmGraphEdgeSchema>;
export type LlmGraphExtraction = z.infer<typeof llmGraphExtractionSchema>;
export type ExtractionPlanSegment = z.infer<typeof extractionPlanSegmentSchema>;
export type ExtractionPlan = z.infer<typeof extractionPlanSchema>;
export type ExtractionMetrics = z.infer<typeof extractionMetricsSchema>;
