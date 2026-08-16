/**
 * Phase 25: Evaluation Contracts for Retrieval (REVAL-01, REVAL-02)
 *
 * Canonical Zod schemas for retrieval evaluation scenarios and cases.
 * These contracts support the repo-root `evals/` workspace and Phase 26 execution.
 *
 * Key design decisions:
 * - Endpoint specificity: `/v1/retrieval/search`, `/v1/retrieval/skills/search-by-content`,
 *   `/v2/retrieval/search`, and `/v3/retrieval/search` are distinct targets
 * - Governance vs relevance separation: every case has separate assertion groups
 * - Scenario/case split: fixture state is reusable across endpoint slices
 */

import { z } from 'zod';

import { entityIdSchema, labelSchema, scopeSchema, securityLevelSchema } from '@trapmap/contracts';

// =============================================================================
// Evaluation Tier Enum
// =============================================================================

/**
 * Evaluation tier for dataset organization.
 * - smoke: Minimal end-to-end validation, fast feedback
 * - core: Broader coverage for regression detection
 */
export const retrievalEvalTierSchema = z.enum(['smoke', 'core']);

export type RetrievalEvalTier = z.infer<typeof retrievalEvalTierSchema>;

// =============================================================================
// Retrieval Eval Endpoint Enum
// =============================================================================

/**
 * Explicit endpoint targeting for retrieval eval cases.
 * v1 returns bucketed results (globalConstraints, projectKnowledge).
 * v1 skill lookup returns artifact-first matches (`matches`) sourced from the capsule pipeline.
 * v2 returns capsule-first results with profile hints.
 * v3 returns either a graph plan or a governed fallback payload with routing trace.
 * These are kept distinct to prevent endpoint adapter drift.
 */
export const retrievalEvalEndpointSchema = z.enum([
  '/v1/retrieval/search',
  '/v1/retrieval/skills/search-by-content',
  '/v2/retrieval/search',
  '/v3/retrieval/search',
]);

export type RetrievalEvalEndpoint = z.infer<typeof retrievalEvalEndpointSchema>;

// =============================================================================
// Retrieval Eval Actor Schema
// =============================================================================

/**
 * Actor context for evaluation scenarios.
 * Defines who is making the retrieval request, which determines
 * visibility through team boundaries and security level filtering.
 */
export const retrievalEvalActorSchema = z.object({
  /** Actor type: user or system-admin */
  subjectType: z.enum(['user', 'system-admin']),
  /** Active team for project-scoped visibility. null for global-only actors. */
  activeTeamId: entityIdSchema.nullable(),
  /** Security level (0-10) for level-based filtering */
  securityLevel: securityLevelSchema,
  /** Required permissions for the actor */
  permissions: z.array(z.string().min(1)).min(1),
});

export type RetrievalEvalActor = z.infer<typeof retrievalEvalActorSchema>;

const retrievalEvalFixturesSchema = z.object({
  /** Legacy knowledge entries (for v1 compatibility testing) */
  knowledgeEntries: z.array(z.unknown()).default([]),
  /** Skill artifacts with capsules (for v2 testing) */
  skillArtifacts: z.array(z.unknown()).default([]),
  /** Graph index documents for v3 graph-plan testing */
  graphIndexDocuments: z.array(z.unknown()).default([]),
});

export const retrievalEvalScenarioSnapshotSchema = z.object({
  /** Optional actor baseline captured alongside the snapshot */
  actor: retrievalEvalActorSchema.optional(),
  /** Snapshot fixture corpus state */
  fixtures: retrievalEvalFixturesSchema,
});

export type RetrievalEvalScenarioSnapshot = z.infer<typeof retrievalEvalScenarioSnapshotSchema>;

// =============================================================================
// Retrieval Eval Scenario Schema
// =============================================================================

/**
 * Scenario schema for retrieval evaluation fixtures.
 * A scenario owns deterministic corpus state and actor context.
 * Multiple cases can reference the same scenario with different endpoints/requests.
 */
export const retrievalEvalScenarioSchema = z.object({
  /** Unique scenario identifier */
  scenarioId: z.string().min(1),
  /** Human-readable description */
  description: z.string().min(1),
  /** Actor context for this scenario */
  actor: retrievalEvalActorSchema,
  /** Optional external snapshot source for live-db derived fixture state */
  snapshot: z
    .object({
      kind: z.literal('retrieval-db-snapshot'),
      path: z.string().min(1),
    })
    .optional(),
  /** Fixture corpus state */
  fixtures: retrievalEvalFixturesSchema,
});

export type RetrievalEvalScenario = z.infer<typeof retrievalEvalScenarioSchema>;

// =============================================================================
// Retrieval Eval Request Schema
// =============================================================================

/**
 * Request shape for retrieval eval cases.
 * Mirrors the live retrieval query contracts but stays serializable.
 */
export const retrievalEvalRequestSchema = z.object({
  /** The seed/query text */
  seed: z.string().min(1),
  /** Optional filters */
  filters: z
    .object({
      labels: z.array(labelSchema).default([]),
      scopes: z.array(scopeSchema).default([]),
    })
    .default({ labels: [], scopes: [] }),
  /** Maximum results to return (optional, uses defaults if omitted) */
  maxResults: z.number().int().min(1).max(50).optional(),
  /** Maximum number of graph-plan skills to keep (v3 only) */
  skillBudget: z.number().int().min(1).max(10).optional(),
  /** Maximum graph expansion depth (v3 only) */
  maxDepth: z.number().int().min(1).max(5).optional(),
  /** Query mode (optional, v1 only, uses default if omitted) */
  mode: z.enum(['semantic', 'hybrid', 'graph-assisted']).optional(),
  /** Explicit fallback policy (v3 only, defaults to auto) */
  fallbackMode: z.enum(['auto', 'v2-capsule', 'v1-graph-assisted']).optional(),
  /** Whether to include summary in response (v2 only) */
  includeSummary: z.boolean().optional(),
});

export type RetrievalEvalRequest = z.infer<typeof retrievalEvalRequestSchema>;

// =============================================================================
// Retrieval Eval Relevance Expectations Schema
// =============================================================================

/**
 * Relevance expectations for retrieval eval cases.
 * These assertions measure ranking quality, not governance correctness.
 */
export const retrievalEvalRelevanceExpectationsSchema = z
  .object({
    /** IDs of entries/capsules that should appear in results */
    relevantIds: z.array(entityIdSchema).default([]),
    /** Ideal ranking order (for Hit@K, MRR, nDCG calculation in Phase 26) */
    idealOrder: z.array(entityIdSchema).default([]),
  })
  .refine((d) => d.idealOrder.every((id) => new Set(d.relevantIds).has(id)), {
    message: 'idealOrder entries must all be in relevantIds',
  });

export type RetrievalEvalRelevanceExpectations = z.infer<
  typeof retrievalEvalRelevanceExpectationsSchema
>;

// =============================================================================
// Retrieval Eval Governance Expectations Schema
// =============================================================================

/**
 * Governance expectations for retrieval eval cases.
 * These assertions measure permission and policy correctness separately from relevance.
 * A high relevance score cannot hide a governance leak.
 */
export const retrievalEvalGovernanceExpectationsSchema = z
  .object({
    /** IDs of entries/capsules that must NOT appear in results */
    forbiddenIds: z.array(entityIdSchema).default([]),
    /** Reasons why items are forbidden (for precise failure categorization) */
    forbiddenReasons: z.array(z.enum(['cross-team', 'security-level', 'lifecycle'])).default([]),
  })
  .refine((d) => d.forbiddenIds.length === d.forbiddenReasons.length, {
    message: 'forbiddenIds and forbiddenReasons must have equal length',
  });

export type RetrievalEvalGovernanceExpectations = z.infer<
  typeof retrievalEvalGovernanceExpectationsSchema
>;

// =============================================================================
// Graph-Plan Structural Expectations Schema
// =============================================================================

/**
 * Graph-plan structural expectations for v3 responses.
 * These assertions verify the plan assembly correctness beyond capsule matching.
 */
export const graphPlanExpectationsSchema = z.object({
  /** Expected trap node IDs in graph.nodes (kind='trap') */
  expectedTrapNodeIds: z.array(entityIdSchema).default([]),
  /** Expected skill node IDs in graph.nodes (kind='skill') */
  expectedSkillNodeIds: z.array(entityIdSchema).default([]),
  /** Expected edge relations: {sourceId, targetId, type} tuples */
  expectedEdges: z
    .array(
      z.object({
        sourceNodeId: entityIdSchema,
        targetNodeId: entityIdSchema,
        type: z.enum(['risk-blocks', 'mitigates', 'requires', 'order', 'co-occurs-with']),
      }),
    )
    .default([]),
  /** Expected blocking trap node IDs in focus.blockingTrapNodeIds */
  expectedBlockingTrapNodeIds: z.array(entityIdSchema).default([]),
  /** Expected recommended skill node IDs in focus.recommendedSkillNodeIds */
  expectedRecommendedSkillNodeIds: z.array(entityIdSchema).default([]),
});

export type GraphPlanExpectations = z.infer<typeof graphPlanExpectationsSchema>;

// =============================================================================
// Retrieval Eval Shape Expectations Schema
// =============================================================================

/**
 * Shape expectations for endpoint-specific response validation.
 * v1 search cases can assert bucket splits; v1 skill lookup cases can assert matched artifacts.
 * v2 cases can assert capsule/profile shapes.
 * v3 cases can assert graph-plan structure (nodes, edges, focus).
 */
export const retrievalEvalShapeExpectationsSchema = z.object({
  /**
   * Bucket expectations for v1 responses.
   * Maps bucket names ('globalConstraints', 'projectKnowledge') to expected entry IDs.
   */
  bucketExpectations: z
    .record(z.enum(['globalConstraints', 'projectKnowledge']), z.array(entityIdSchema))
    .optional(),
  /** Expected artifact IDs for v1 skill lookup responses */
  expectedArtifactIds: z.array(entityIdSchema).default([]),
  /** Expected profile hint artifact IDs for v2 responses */
  expectedProfileHintArtifactIds: z.array(entityIdSchema).default([]),
  /** Expected capsule count for v2 responses (optional) */
  expectedCapsuleCount: z.number().int().min(0).optional(),
  /** Graph-plan structural expectations (v3 only) */
  graphPlanExpectations: graphPlanExpectationsSchema.optional(),
});

export type RetrievalEvalShapeExpectations = z.infer<typeof retrievalEvalShapeExpectationsSchema>;

// =============================================================================
// Retrieval Eval Expected Outcome Schema
// =============================================================================

/**
 * Expected outcome for a retrieval eval case.
 * Combines outcome classification with separate relevance, governance, and shape assertions.
 */
export const retrievalEvalExpectedSchema = z.object({
  /** Whether results should be non-empty or empty */
  outcome: z.enum(['non-empty', 'empty']),
  /** Relevance assertions (ranking quality) */
  relevance: retrievalEvalRelevanceExpectationsSchema,
  /** Governance assertions (permission/policy correctness) */
  governance: retrievalEvalGovernanceExpectationsSchema,
  /** Shape assertions (endpoint-specific response structure) */
  shape: retrievalEvalShapeExpectationsSchema.default({
    expectedArtifactIds: [],
    expectedProfileHintArtifactIds: [],
  }),
});

export type RetrievalEvalExpected = z.infer<typeof retrievalEvalExpectedSchema>;

// =============================================================================
// Retrieval Eval Case Schema
// =============================================================================

/**
 * Canonical case schema for retrieval evaluation (REVAL-01, REVAL-02).
 * Each case targets a specific endpoint and carries separate relevance/governance expectations.
 * Cases reference scenarios for fixture state and actor context.
 *
 * Design constraints enforced:
 * - Endpoint must be explicit
 * - Relevance and governance are separate assertion groups
 * - Schema version field supports future contract evolution
 */
export const retrievalEvalCaseSchema = z.object({
  /** Schema version for future contract evolution */
  schemaVersion: z.literal(1),
  /** Unique case identifier */
  caseId: z.string().min(1),
  /** Evaluation tier (smoke for fast feedback, core for broader coverage) */
  tier: retrievalEvalTierSchema,
  /** Target endpoint (explicit to prevent adapter drift) */
  endpoint: retrievalEvalEndpointSchema,
  /** Request to send to the endpoint */
  request: retrievalEvalRequestSchema,
  /** Reference to the scenario providing fixture state and actor context */
  scenarioId: z.string().min(1),
  /** Expected outcomes and assertions */
  expected: retrievalEvalExpectedSchema,
  /** Tags for filtering and categorization */
  tags: z.array(z.string()).default([]),
});

export type RetrievalEvalCase = z.infer<typeof retrievalEvalCaseSchema>;
