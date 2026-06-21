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
export const llmGraphNodeSchema = z
  .object({
    kind: llmNodeKindSchema,
    label: z.string().min(1).max(128),
    description: z.string().max(512).optional(),
  })
  .strict();

/**
 * A single graph edge extracted by the LLM.
 *
 * sourceLabel and targetLabel reference node labels (not IDs).
 * ID mapping happens downstream via buildNodeId().
 *
 * @example { sourceLabel: 'docker', targetLabel: 'container-timeout', relationType: 'co-occurs-with', strength: 'soft' }
 */
export const llmGraphEdgeSchema = z
  .object({
    sourceLabel: z.string().min(1).max(128),
    targetLabel: z.string().min(1).max(128),
    relationType: llmRelationTypeSchema,
    strength: llmRelationStrengthSchema,
    description: z.string().max(512).optional(),
  })
  .strict();

/**
 * Full extraction result from a single LLM call.
 *
 * Constrained to prevent hallucination bloat:
 * - max 15 nodes, max 20 edges
 */
export const llmGraphExtractionSchema = z
  .object({
    nodes: z.array(llmGraphNodeSchema).max(15),
    edges: z.array(llmGraphEdgeSchema).max(20),
  })
  .strict();

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
export const extractionMetricsSchema = z
  .object({
    llmSuccessCount: z.number().int().min(0).default(0),
    cacheHitCount: z.number().int().min(0).default(0),
    llmUnavailableCount: z.number().int().min(0).default(0),
    extractionErrorCount: z.number().int().min(0).default(0),
    emptyExtractionCount: z.number().int().min(0).default(0),
    phase1Ms: z.number().min(0).default(0),
    phase2Ms: z.number().min(0).default(0),
    gleaningCount: z.number().int().min(0).default(0),
  })
  .strict();

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

// ---------------------------------------------------------------------------
// Label alignment schemas
// ---------------------------------------------------------------------------

/**
 * A candidate canonical label presented to the LLM for alignment.
 * Compact — max 8 candidates per alignment call.
 */
export const labelAlignmentCandidateSchema = z
  .object({
    id: z.string().min(1),
    canonicalName: z.string().min(1).max(128),
    definition: z.string().max(512).nullable().optional(),
    aliases: z.array(z.string()).default([]),
    recallReason: z.enum(['exact-alias', 'normalized-name', 'semantic-embedding']),
  })
  .strict();

/**
 * The LLM's alignment decision for a raw label.
 * Must be one of: existing (maps to catalog), new (create new), unsure (needs review).
 */
export const labelAlignmentDecisionSchema = z
  .object({
    decision: z.enum(['existing', 'new', 'unsure']),
    canonicalLabelId: z.string().optional(),
    canonicalName: z.string().min(1).max(128).optional(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string().min(1).max(512),
  })
  .strict()
  .refine(
    (data) => {
      if (data.decision === 'existing') return !!data.canonicalLabelId;
      if (data.decision === 'new') return !!data.canonicalName;
      return true;
    },
    {
      message:
        'canonicalLabelId required for "existing" decision; canonicalName required for "new" decision',
    },
  );

/**
 * Full alignment input: raw label + evidence + candidate table.
 */
export const labelAlignmentInputSchema = z
  .object({
    rawLabel: z.string().min(1).max(128),
    rawEvidence: z.string().max(1024),
    candidates: z.array(labelAlignmentCandidateSchema).max(8),
  })
  .strict();

// --- Label Alignment Exported Types ---

export type LabelAlignmentCandidate = z.infer<typeof labelAlignmentCandidateSchema>;
export type LabelAlignmentDecision = z.infer<typeof labelAlignmentDecisionSchema>;
export type LabelAlignmentInput = z.infer<typeof labelAlignmentInputSchema>;
