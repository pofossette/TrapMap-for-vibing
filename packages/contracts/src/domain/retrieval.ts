import { z } from 'zod';
import { skillCapsuleSchema, skillScriptDescriptorSchema } from './artifacts.js';

import { boundaryContextSchema, boundaryExplanationSchema } from './boundary.js';
import {
  entityIdSchema,
  labelSchema,
  scopeSchema,
  securityLevelSchema,
  sha256HexSchema,
} from './common.js';
import { conflictHintSchema } from './conflict.js';
import { canonicalPathSchema } from './path-validation.js';
import { planQuerySchema, trapFirstPlanSchema } from './plans.js';

/**
 * Query mode for retrieval requests.
 * Defines the retrieval strategy to use when searching knowledge.
 */
export const retrievalQueryModeSchema = z.enum(['semantic', 'hybrid', 'graph-assisted']);

export type RetrievalQueryMode = z.infer<typeof retrievalQueryModeSchema>;

export const retrievalFiltersSchema = z.object({
  teamId: entityIdSchema.nullable().optional(),
  labels: z.array(labelSchema).default([]),
  scopes: z.array(scopeSchema).default([]),
});

/**
 * Source type for retrieval citations.
 * Distinguishes whether a citation originated from the v1 knowledge-entry
 * pipeline or the v2 capsule-native pipeline.
 */
export const citationSourceTypeSchema = z.enum(['knowledge', 'capsule']);

export type CitationSourceType = z.infer<typeof citationSourceTypeSchema>;

/**
 * Canonical citation schema for Phase 10.
 * Provides structured, auditable metadata for each retrieval match.
 */
export const retrievalCitationSchema = z.object({
  source: z.object({
    entryId: entityIdSchema,
    scope: scopeSchema,
    shortcut: z.string(),
  }),
  /** Whether this citation came from the v1 knowledge-entry pipeline or v2 capsule pipeline */
  sourceType: citationSourceTypeSchema,
  snippet: z.string().min(1),
  tags: z.array(labelSchema),
  recallChannels: z.array(z.enum(['semantic', 'keyword', 'graph'])).min(1),
  scores: z
    .object({
      semantic: z.number().min(0).max(1).nullable(),
      keyword: z.number().min(0).max(1).nullable(),
      graph: z.number().min(0).max(1).nullable(),
      preRerank: z.number().min(0).max(1),
      final: z.number().min(0).max(1),
    })
    .refine((d) => d.preRerank >= 0 && d.final >= 0, {
      message: 'preRerank and final scores must be non-negative',
    }),
});

export type RetrievalCitation = z.infer<typeof retrievalCitationSchema>;

/**
 * Canonical summary schema for Phase 10.
 * Optional LLM-generated or extractive summary with citations.
 */
export const retrievalSummarySchema = z.object({
  text: z.string().min(1),
  citations: z.array(retrievalCitationSchema).min(1),
});

export type RetrievalSummary = z.infer<typeof retrievalSummarySchema>;

export const retrievalQuerySchema = z.object({
  seed: z.string().min(1).max(2000),
  filters: retrievalFiltersSchema.default({ labels: [], scopes: [] }),
  maxResults: z.number().int().min(1).max(50).default(10),
  includeRefinement: z.boolean().default(true),
  includeSummary: z.boolean().default(false),
  mode: retrievalQueryModeSchema.default('semantic'),
  /** Boundary context for determining entry applicability (Phase 66) */
  boundaryContext: boundaryContextSchema.optional(),
});

export const retrievalMatchSchema = z
  .object({
    entryId: entityIdSchema,
    scope: scopeSchema,
    requiredLevel: securityLevelSchema,
    shortcut: z.string(),
    detail: z.string(),
    labels: z.array(labelSchema),
    score: z.number().min(0).max(1),
    reason: z.string().min(1),
    citation: retrievalCitationSchema.optional(),
    /** Conflict hints showing related entries with different solutions */
    conflicts: z.array(conflictHintSchema).optional(),
    /** Boundary explanation for why this entry is applicable (Phase 66) */
    boundaryExplanation: boundaryExplanationSchema.optional(),
    /** Semver version declared on the artifact's latest revision (absent for unversioned entries) */
    version: z.string().optional(),
    /** Latest revision number of the artifact backing this entry (absent for legacy knowledge entries) */
    revision: z.number().int().min(1).optional(),
  })
  .strict();

export type RetrievalMatch = z.infer<typeof retrievalMatchSchema>;

// =============================================================================
// Routing Strategy & Trace Schemas (moved before response schemas for declaration order)
// =============================================================================

/**
 * Internal routing strategy identifiers.
 * These represent the unified retrieval strategy layer behind both v1 and v2
 * endpoint surfaces. Public v1 mode values (`semantic`, `hybrid`, `graph-assisted`)
 * map into these strategies but remain the client-facing enum.
 *
 * Strategy semantics:
 * - naive: deterministic single-path fallback (keyword-only / token-overlap), no embeddings
 * - local: narrow, query-near retrieval (semantic recall / capsule ranking)
 * - global: broader artifact/context retrieval (profile + future excerpt)
 * - hybrid: balanced multi-channel recall without heaviest expansion
 * - mix: full multi-channel plan including graph expansion
 * - auto: deterministic router selects one of the above from parsed intent
 */
export const retrievalStrategySchema = z.enum([
  'naive',
  'local',
  'global',
  'hybrid',
  'mix',
  'auto',
]);

export type RetrievalStrategy = z.infer<typeof retrievalStrategySchema>;

/**
 * Route family distinguishes between legacy entry-based and capsule-native retrieval.
 * Used in routing trace metadata and evaluation slicing.
 */
export const routeFamilySchema = z.enum(['entry', 'capsule', 'graph-plan']);

export type RouteFamily = z.infer<typeof routeFamilySchema>;

/**
 * Canonical routing reason codes.
 * Each routing decision emits exactly one reason explaining why the strategy was chosen.
 * These are stable identifiers for evaluation baselines and CI regression comparison.
 */
export const routingReasonSchema = z.enum([
  'explicit-mode', // Client requested a specific v1 mode
  'auto-error-detected', // Auto mode detected error-like seed, chose naive
  'auto-goal-query', // Auto mode detected goal-oriented query, chose local
  'auto-broad-context', // Auto mode detected broad context need, chose global
  'auto-multi-channel', // Auto mode chose hybrid based on query complexity
  'fallback-default', // Fallback to default strategy when no explicit mode
  'v2-default-capsule', // v2 endpoint default capsule strategy
  'graph-plan-selected', // Graph-plan route returned the plan directly
  'graph-plan-low-confidence', // Graph-plan route fell back due to low readiness score
  'graph-plan-insufficient-trap-evidence', // Plan had weak blocker evidence
  'graph-plan-insufficient-skill-evidence', // Plan had no actionable skills
  'graph-plan-compilation-failed', // Plan compilation threw an error, fell back
]);

export type RoutingReason = z.infer<typeof routingReasonSchema>;

/**
 * Fallback target used by the GraphRAG-lite wrapper route.
 * Distinguishes which legacy retrieval surface was used when the plan
 * was not strong enough to return directly.
 */
export const graphPlanFallbackTargetSchema = z.enum(['v2-capsule', 'v1-graph-assisted']);

export type GraphPlanFallbackTarget = z.infer<typeof graphPlanFallbackTargetSchema>;

/**
 * Deterministic confidence bucket for GraphRAG-lite routing.
 */
export const graphPlanConfidenceBucketSchema = z.enum(['high', 'medium', 'low']);

export type GraphPlanConfidenceBucket = z.infer<typeof graphPlanConfidenceBucketSchema>;

/**
 * Routing trace metadata attached to retrieval responses (EOPS-03).
 * Captures the routing decision provenance so evaluation and debugging
 * can compare router behavior across runs without guessing.
 *
 * This trace is additive to existing response schemas and does not break
 * backward compatibility with v1 or v2 contracts.
 */
export const routingTraceSchema = z.object({
  /** The internal strategy selected by the router */
  selectedMode: retrievalStrategySchema,
  /** Whether this retrieval follows the entry or capsule route family */
  routeFamily: routeFamilySchema,
  /** Machine-readable reason code for the routing decision */
  routingReason: routingReasonSchema,
  /** Whether a fallback strategy was applied after initial selection failed */
  fallbackApplied: z.boolean().default(false),
  /** Recall channels that contributed to the final result set */
  channelsUsed: z
    .array(z.enum(['semantic', 'keyword', 'graph', 'capsule', 'profile', 'plan']))
    .default([]),
  /** Fallback destination when fallbackApplied is true */
  fallbackTarget: graphPlanFallbackTargetSchema.nullable().default(null),
  /** Deterministic confidence score when available */
  confidenceScore: z.number().min(0).max(1).nullable().default(null),
  /** Confidence bucket derived from confidenceScore when available */
  confidenceBucket: graphPlanConfidenceBucketSchema.nullable().default(null),
});

export type RoutingTrace = z.infer<typeof routingTraceSchema>;

export const retrievalResponseSchema = z.object({
  queryId: z.string().min(1).optional(),
  globalConstraints: z.array(retrievalMatchSchema),
  projectKnowledge: z.array(retrievalMatchSchema),
  refinementSummary: z.string().nullable(),
  summary: retrievalSummarySchema.nullable(),
  /** Diagnostic routing trace populated by the orchestrator */
  routingTrace: routingTraceSchema.optional(),
  /** Backend identifier that produced this response (for debugging) */
  backend: z.string().optional(),
  /** Wall-clock time the backend spent processing (ms, for debugging) */
  backendMs: z.number().optional(),
});

export type RetrievalQuery = z.infer<typeof retrievalQuerySchema>;
export type RetrievalResponse = z.infer<typeof retrievalResponseSchema>;

/**
 * Unified retrieval request schema.
 * Canonical input shape for retrieval endpoints. Provides a single source of
 * truth for client-supplied fields including optional backend selection and
 * graph traversal depth hints.
 */
export const retrievalRequestSchema = z.object({
  /** Natural-language search query or seed text */
  query: z.string().min(1).max(2000),
  /** Optional team scope to restrict retrieval results */
  teamId: z.string().optional(),
  /** Optional graph traversal depth (0 = no graph, 1-3 = expand) */
  graphDepth: z.number().int().min(0).max(3).optional(),
  /** Optional backend selector for debugging and evaluation */
  backend: z.enum(['in-memory', 'pgvector']).optional(),
  /** Optional capsule scope for capsule-native retrieval */
  capsuleId: z.string().optional(),
});

export type RetrievalRequest = z.infer<typeof retrievalRequestSchema>;

/**
 * Shared request body used by the gateway pilot `/v1/retrieval/search` route.
 * Preserves the existing host-local `limit` option while reusing canonical
 * retrieval field validation from the broader request contract.
 */
export const retrievalSearchBodySchema = retrievalRequestSchema
  .pick({
    query: true,
    teamId: true,
  })
  .extend({
    limit: z.number().int().positive().optional(),
  });

export type RetrievalSearchBody = z.infer<typeof retrievalSearchBodySchema>;

// =============================================================================
// Phase 14: Seed-Only Retrieval v2 Contracts (RETR-01, RETR-02, RETR-04, COMP-01)
// Capsule-native retrieval schemas that keep seed as the only required client input
// while returning distilled capsule-first results with governance inheritance.
// =============================================================================

/**
 * Capsule match in v2 retrieval response.
 * Extends the base SkillCapsule shape with score and reason for ranking transparency.
 * Inherits governance (scope, requiredLevel) from artifact root per T-14-01 mitigation.
 */
export const capsuleMatchSchema = skillCapsuleSchema
  .omit({ contextualPrefix: true, errorText: true })
  .extend({
    /** Optional error text for error-specific capsules */
    errorText: z.string().max(500).optional(),
    /** Final ranking score after all boosts applied */
    score: z.number().min(0).max(1),
    /** Human-readable explanation of why this capsule matched */
    reason: z.string().min(1),
    /** Conflict hints showing related entries with different solutions */
    conflicts: z.array(conflictHintSchema).optional(),
  })
  .strict();

/**
 * Profile hint in v2 retrieval response.
 * Provides lightweight artifact metadata without full profile content.
 * Used for activation hints and context assembly.
 */
export const profileHintSchema = z.object({
  /** Artifact identifier */
  artifactId: entityIdSchema,
  /** Human-readable title */
  title: z.string().min(1).max(280),
  /** URL-friendly slug for references */
  slug: z.string().min(1).max(160),
  /** Searchable labels */
  labels: z.array(labelSchema).min(1),
});

/**
 * v2 retrieval query schema (RETR-01).
 * Accepts only seed as the required client input.
 * Server internally parses seed into situation/problem/goal/errorText per RETR-02.
 * Structured intent fields are NOT part of the client contract.
 */
export const retrievalV2QuerySchema = z.object({
  /** Single natural-language seed string - the only required input */
  seed: z.string().min(1).max(2000),
  /** Optional filters to narrow search scope */
  filters: retrievalFiltersSchema.default({ labels: [], scopes: [] }),
  /** Maximum number of capsules to return */
  maxResults: z.number().int().min(1).max(50).default(10),
  /** Whether to include a summary over filtered capsule hits (backward-compatible, defaults false) */
  includeSummary: z.boolean().default(false),
});

/**
 * v2 retrieval response schema (RETR-04, COMP-01).
 * Returns capsule-first distilled results instead of flat knowledge entries.
 * Capsules inherit governance from artifact root per T-14-01 mitigation.
 * Coexists with legacy retrievalResponseSchema for backward compatibility.
 * Optional summary consumes only already-filtered distilled hits (T-14-08).
 */
export const retrievalV2ResponseSchema = z.object({
  /** Ranked capsule matches with governance inheritance */
  capsules: z.array(capsuleMatchSchema).default([]),
  /** Lightweight artifact metadata for activation hints */
  profileHints: z.array(profileHintSchema).default([]),
  /** Optional refinement summary over filtered capsules */
  refinementSummary: z.string().nullable().optional(),
  /** Optional summary over filtered distilled capsule hits */
  summary: retrievalSummarySchema.nullable().default(null),
  /** Diagnostic routing trace populated by the orchestrator */
  routingTrace: routingTraceSchema.optional(),
});

export type CapsuleMatch = z.infer<typeof capsuleMatchSchema>;
export type ProfileHint = z.infer<typeof profileHintSchema>;
export type RetrievalV2Query = z.infer<typeof retrievalV2QuerySchema>;
export type RetrievalV2Response = z.infer<typeof retrievalV2ResponseSchema>;

// =============================================================================
// Phase 15: Activation Hints for References, Assets, and Scripts (RETR-05, ACTV-01)
// Additive activation metadata that tells clients what to read/fetch next.
// Stays metadata-only - never includes file bodies or script content.
// =============================================================================

/**
 * Read-next reference hint for capsule matches.
 * Points to reference files the client should read for additional context.
 * Metadata-only - does not include file content (T-15-01).
 */
export const readNextReferenceHintSchema = z.object({
  /** Artifact identifier containing the reference */
  artifactId: entityIdSchema,
  /** Revision number for cache validation */
  revision: z.number().int().min(1),
  /** Path to the reference file within the skill directory */
  path: canonicalPathSchema,
  /** SHA-256 hash for integrity verification */
  sha256: sha256HexSchema,
  /** Human-readable description of what this reference provides */
  description: z.string().max(280).optional(),
});

/**
 * Asset availability hint for capsule matches.
 * Describes assets the client can activate/download on demand.
 * Metadata-only - does not include asset bodies (T-15-01).
 */
export const assetAvailabilityHintSchema = z.object({
  /** Artifact identifier containing the asset */
  artifactId: entityIdSchema,
  /** Revision number for cache validation */
  revision: z.number().int().min(1),
  /** Path to the asset file within the skill directory */
  path: canonicalPathSchema,
  /** SHA-256 hash for integrity verification */
  sha256: sha256HexSchema,
  /** File size in bytes for transfer planning */
  sizeBytes: z.number().int().min(0),
  /** IANA media type for content handling */
  mediaType: z.string().min(1).max(160),
});

/**
 * Script profile hint for capsule matches.
 * Describes script capabilities without exposing script bodies.
 * Metadata-only - does not include script content (T-15-01, T-15-03).
 */
export const scriptProfileHintSchema = skillScriptDescriptorSchema.extend({
  /** Artifact identifier containing the script */
  artifactId: entityIdSchema,
  /** Revision number for cache validation */
  revision: z.number().int().min(1),
});

/**
 * Activation hints for a single capsule match.
 * Aggregates read-next references, available assets, and script profiles.
 * All hints are metadata-only (T-15-01).
 */
export const capsuleActivationHintsSchema = z.object({
  /** Capsule identifier these hints are associated with */
  capsuleId: entityIdSchema,
  /** Reference files the client should read next */
  readNext: z.array(readNextReferenceHintSchema).default([]),
  /** Assets available for activation/download */
  assets: z.array(assetAvailabilityHintSchema).default([]),
  /** Scripts with capability profiles (no bodies) */
  scripts: z.array(scriptProfileHintSchema).default([]),
});

/**
 * v2 retrieval response schema with activation hints (RETR-05, ACTV-01).
 * Extends the base v2 response with optional activation metadata.
 * Stays distilled-first and metadata-only (T-15-01, T-15-02).
 */
/** Heuristic: detect strings that look like raw source code */
const looksLikeRawCode = (s: string): boolean =>
  /^#!\//.test(s) ||
  /\b(import\s+.*from\s|require\s*\(|export\s+(default\s+)?(function|class|const|let|var)|function\s+\w+\s*\(|const\s+\w+\s*=\s*(\(|async\s))/m.test(
    s,
  );

export const retrievalV2ResponseWithHintsSchema = z
  .object({
    queryId: z.string().min(1).optional(),
    /** Ranked capsule matches with governance inheritance */
    capsules: z.array(capsuleMatchSchema).default([]),
    /** Lightweight artifact metadata for activation hints */
    profileHints: z.array(profileHintSchema).default([]),
    /** Activation hints per capsule (metadata-only) */
    activationHints: z.array(capsuleActivationHintsSchema).default([]),
    /** Optional refinement summary over filtered capsules */
    refinementSummary: z.string().nullable().default(null),
    /** Optional summary over filtered distilled capsule hits */
    summary: retrievalSummarySchema.nullable().default(null),
  })
  .refine((d) => d.capsules.every((c) => !looksLikeRawCode(c.content)), {
    message: 'distilled-first: capsule content must not be raw source code',
  })
  .refine(
    (d) =>
      d.activationHints.every((h) =>
        h.scripts.every(
          (s) => !looksLikeRawCode(s.capability) && !looksLikeRawCode(s.sideEffectSummary),
        ),
      ),
    { message: 'metadata-only: activation hints must not contain executable content' },
  );

export type ReadNextReferenceHint = z.infer<typeof readNextReferenceHintSchema>;
export type AssetAvailabilityHint = z.infer<typeof assetAvailabilityHintSchema>;
export type ScriptProfileHint = z.infer<typeof scriptProfileHintSchema>;
export type CapsuleActivationHints = z.infer<typeof capsuleActivationHintsSchema>;
export type RetrievalV2ResponseWithHints = z.infer<typeof retrievalV2ResponseWithHintsSchema>;

// =============================================================================
// Phase 18: Skill Lookup by Content (SKED-01)
// Artifact-first lookup contract for skill search-by-content CLI command.
// Returns unique artifact IDs with brief metadata, not capsule content.
// =============================================================================

/**
 * Source kind for skill artifacts.
 * Indicates how the artifact was originally created.
 */
export const skillSourceKindSchema = z.enum([
  'skill-directory',
  'single-skill-md',
  'legacy-knowledge',
]);

/**
 * Skill lookup query schema (SKED-01).
 * Accepts search text and optional result limit.
 * Designed for CLI `skill search-by-content <text>` command.
 */
export const skillLookupQuerySchema = z.object({
  /** Natural-language search text */
  text: z.string().min(1).max(2000),
  /** Maximum number of matches to return */
  maxResults: z.number().int().min(1).max(50).default(10),
});

/**
 * Single artifact match in skill lookup response (SKED-01).
 * Artifact-first: returns skill ID with brief metadata.
 * Does NOT include capsule content, activation hints, or file payloads.
 */
export const skillLookupResultItemSchema = z.object({
  /** Unique artifact/skill identifier */
  artifactId: entityIdSchema,
  /** Human-readable title */
  title: z.string().min(1).max(280),
  /** URL-friendly slug for references */
  slug: z.string().min(1).max(160),
  /** Searchable labels */
  labels: z.array(labelSchema),
  /** Governance scope (global or project) */
  scope: scopeSchema,
  /** Required security level to access this artifact */
  requiredLevel: securityLevelSchema,
  /** How this artifact was originally created */
  sourceKind: skillSourceKindSchema,
  /** Final ranking score after all boosts applied */
  score: z.number().min(0).max(1),
  /** Human-readable explanation of why this artifact matched */
  reason: z.string().min(1),
});

/**
 * Skill lookup response schema (SKED-01).
 * Returns artifact-first matches with metadata-only fields.
 * Stays distinct from capsule-native retrievalV2ResponseWithHintsSchema.
 */
export const skillLookupResponseSchema = z.object({
  queryId: z.string().min(1).optional(),
  /** Ranked artifact matches with brief metadata */
  matches: z.array(skillLookupResultItemSchema).default([]),
});

export type SkillSourceKind = z.infer<typeof skillSourceKindSchema>;
export type SkillLookupQuery = z.infer<typeof skillLookupQuerySchema>;
export type SkillLookupResultItem = z.infer<typeof skillLookupResultItemSchema>;
export type SkillLookupResponse = z.infer<typeof skillLookupResponseSchema>;

/**
 * Query schema for the additive GraphRAG-lite wrapper route.
 * Reuses the raw plan query and adds an optional fallback policy.
 */
export const graphPlanSearchQuerySchema = planQuerySchema.extend({
  /** Optional explicit fallback target; auto chooses based on plan evidence */
  fallbackMode: z.enum(['auto', 'v2-capsule', 'v1-graph-assisted']).default('auto'),
});

export type GraphPlanSearchQuery = z.infer<typeof graphPlanSearchQuerySchema>;

/**
 * Routing trace returned by the GraphRAG-lite wrapper route.
 * Always includes non-null confidence details.
 */
export const graphPlanRoutingTraceSchema = routingTraceSchema.extend({
  fallbackTarget: graphPlanFallbackTargetSchema.nullable().default(null),
  confidenceScore: z.number().min(0).max(1),
  confidenceBucket: graphPlanConfidenceBucketSchema,
});

export type GraphPlanRoutingTrace = z.infer<typeof graphPlanRoutingTraceSchema>;

/**
 * Capsule fallback payload for GraphRAG-lite wrapper responses.
 */
export const graphPlanCapsuleFallbackSchema = z.object({
  routeFamily: z.literal('capsule'),
  response: retrievalV2ResponseWithHintsSchema,
});

export type GraphPlanCapsuleFallback = z.infer<typeof graphPlanCapsuleFallbackSchema>;

/**
 * Entry fallback payload for GraphRAG-lite wrapper responses.
 */
export const graphPlanEntryFallbackSchema = z.object({
  routeFamily: z.literal('entry'),
  response: retrievalResponseSchema,
});

export type GraphPlanEntryFallback = z.infer<typeof graphPlanEntryFallbackSchema>;

/**
 * GraphRAG-lite wrapper fallback payload.
 */
export const graphPlanFallbackSchema = z.union([
  graphPlanCapsuleFallbackSchema,
  graphPlanEntryFallbackSchema,
]);

export type GraphPlanFallback = z.infer<typeof graphPlanFallbackSchema>;

/**
 * Wrapper response for additive GraphRAG-lite retrieval.
 * Returns either a selected trap-first plan or a governed legacy fallback payload.
 */
export const graphPlanSearchResponseSchema = z
  .object({
    queryId: z.string().min(1).optional(),
    /** Canonical routing and confidence metadata for the request */
    routingTrace: graphPlanRoutingTraceSchema,
    /** Selected plan when confidence is high enough */
    plan: trapFirstPlanSchema.nullable().default(null),
    /** Governed fallback payload when the plan is not selected */
    fallback: graphPlanFallbackSchema.nullable().default(null),
  })
  .strict();

export type GraphPlanSearchResponse = z.infer<typeof graphPlanSearchResponseSchema>;
