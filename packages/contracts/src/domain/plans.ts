import { z } from 'zod';

import { entityIdSchema, scopeSchema, securityLevelSchema } from './common.js';

/**
 * Plan edge relation types (subset of GraphRAG-lite vocabulary).
 * Excludes 'co-occurs-with' because co-occurrence is citation-only, not a plan edge.
 */
export const planEdgeTypeSchema = z.enum([
  'risk-blocks',
  'mitigates',
  'requires',
  'order',
]);

export type PlanEdgeType = z.infer<typeof planEdgeTypeSchema>;

/**
 * Edge strength for plan edges.
 * Hard edges must be respected by the compiler; soft edges may be reordered.
 */
export const planEdgeStrengthSchema = z.enum(['hard', 'soft']);

export type PlanEdgeStrength = z.infer<typeof planEdgeStrengthSchema>;

/**
 * A trap node in the execution plan.
 * Represents a blocker or guardrail that must be addressed.
 */
export const planTrapNodeSchema = z.object({
  /** Node identifier (matches graph node id) */
  nodeId: entityIdSchema,
  /** Source entry or artifact identifier */
  sourceId: entityIdSchema,
  /** Human-readable label */
  label: z.string().min(1).max(280),
  /** Whether this is a hard blocker (must resolve) or soft warning */
  severity: planEdgeStrengthSchema,
  /** Governance scope */
  scope: scopeSchema,
  /** Required security level */
  requiredLevel: securityLevelSchema,
  /** Evidence text justifying this trap */
  evidence: z.string().min(1),
  /** Score relevance to query */
  score: z.number().min(0).max(1),
});

export type PlanTrapNode = z.infer<typeof planTrapNodeSchema>;

/**
 * A skill node in the execution plan.
 * Represents a recommended action or knowledge reference.
 */
export const planSkillNodeSchema = z.object({
  /** Node identifier (matches graph node id) */
  nodeId: entityIdSchema,
  /** Source artifact identifier */
  artifactId: entityIdSchema,
  /** Optional capsule identifier if derived from capsule */
  capsuleId: entityIdSchema.optional(),
  /** Human-readable label (situation summary) */
  label: z.string().min(1).max(280),
  /** Situation context */
  situation: z.string().min(1).max(1000),
  /** Problem statement */
  problem: z.string().min(1).max(1000),
  /** Goal or solution */
  goal: z.string().min(1).max(1000),
  /** Governance scope */
  scope: scopeSchema,
  /** Required security level */
  requiredLevel: securityLevelSchema,
  /** Score relevance to query */
  score: z.number().min(0).max(1),
});

export type PlanSkillNode = z.infer<typeof planSkillNodeSchema>;

/**
 * A typed edge between plan nodes.
 */
export const planEdgeSchema = z.object({
  /** Unique edge identifier */
  id: entityIdSchema,
  /** Source node id */
  sourceNodeId: entityIdSchema,
  /** Target node id */
  targetNodeId: entityIdSchema,
  /** Edge relation type */
  type: planEdgeTypeSchema,
  /** Edge strength */
  strength: planEdgeStrengthSchema,
});

export type PlanEdge = z.infer<typeof planEdgeSchema>;

/**
 * Citation for supporting evidence not promoted to plan nodes.
 */
export const planCitationSchema = z.object({
  /** Source entry or artifact identifier */
  sourceId: entityIdSchema,
  /** Source type */
  sourceKind: z.enum(['trap', 'skill']),
  /** Human-readable label */
  label: z.string().min(1).max(280),
  /** Governance scope */
  scope: scopeSchema,
  /** Relevance score */
  score: z.number().min(0).max(1),
});

export type PlanCitation = z.infer<typeof planCitationSchema>;

/**
 * Trap-first execution plan (Phase 37 output).
 * A minimal typed graph with blockers surfaced first.
 */
export const trapFirstPlanSchema = z.object({
  /** Traps that block or warn about execution */
  blockingTraps: z.array(planTrapNodeSchema).default([]),
  /** Recommended skills to apply */
  recommendedSkills: z.array(planSkillNodeSchema).default([]),
  /** Typed edges between nodes */
  edges: z.array(planEdgeSchema).default([]),
  /** Supporting evidence not promoted to nodes */
  citations: z.array(planCitationSchema).default([]),
});

export type TrapFirstPlan = z.infer<typeof trapFirstPlanSchema>;

/**
 * Query schema for plan compilation.
 */
export const planQuerySchema = z.object({
  /** Natural-language seed string */
  seed: z.string().min(1).max(2000),
  /** Maximum number of skills to recommend */
  skillBudget: z.number().int().min(1).max(10).default(3),
  /** Maximum graph expansion depth */
  maxDepth: z.number().int().min(1).max(5).default(2),
});

export type PlanQuery = z.infer<typeof planQuerySchema>;
