import { z } from 'zod';

/**
 * Kind of condition for prerequisites.
 */
export const conditionKindSchema = z.enum([
  'environment',
  'permission',
  'tool',
  'configuration',
  'other',
]);

/**
 * Kind of signal pattern for relevance detection.
 */
export const signalKindSchema = z.enum(['exact', 'keyword', 'regex', 'error-code', 'log-pattern']);

/**
 * Kind of exclusion rule.
 */
export const exclusionKindSchema = z.enum([
  'platform',
  'version',
  'context',
  'configuration',
  'other',
]);

/**
 * Kind of evidence reference.
 */
export const evidenceKindSchema = z.enum([
  'issue',
  'incident',
  'cve',
  'documentation',
  'test',
  'commit',
  'other',
]);

/**
 * Version constraint for tools and libraries.
 *
 * Package names follow npm naming conventions.
 * Ranges use semver-compatible syntax (parsed at retrieval time).
 */
export const versionConstraintSchema = z.object({
  /** Package or tool name (e.g., 'react', 'node', 'typescript') */
  package: z.string().min(1).max(128),
  /** Version range in semver-compatible syntax (e.g., '>=16.8.0', '^18.0.0') */
  range: z.string().min(1).max(64),
  /** Optional note explaining why this constraint exists */
  note: z.string().max(280).optional(),
});

/**
 * Condition for prerequisites and requirements.
 *
 * Describes what must be true before applying knowledge.
 */
export const boundaryConditionSchema = z.object({
  /** Human-readable condition description */
  description: z.string().min(1).max(280),
  /** Optional structured type hint for categorization */
  kind: conditionKindSchema.optional(),
  /** Whether this condition is required or optional */
  required: z.boolean(),
});

/**
 * Signal matcher for relevance detection.
 *
 * Patterns that indicate this knowledge is applicable.
 */
export const signalMatcherSchema = z.object({
  /** Pattern to match (exact string, keyword, regex, error code, or log pattern) */
  pattern: z.string().min(1).max(500),
  /** Pattern type determining matching semantics */
  kind: signalKindSchema.default('keyword'),
  /** Optional description of when this signal fires */
  description: z.string().max(280).optional(),
});

/**
 * Exclusion rule for applicability negation.
 *
 * Conditions that make this knowledge NOT applicable.
 */
export const exclusionRuleSchema = z.object({
  /** Human-readable exclusion description */
  description: z.string().min(1).max(280),
  /** Category of exclusion for filtering */
  kind: exclusionKindSchema.optional(),
});

/**
 * Evidence reference supporting boundary assertions.
 *
 * Links to external sources that validate the boundary.
 */
export const evidenceReferenceSchema = z.object({
  /** Type of evidence source */
  kind: evidenceKindSchema,
  /** Reference identifier (issue number, CVE ID, commit hash, etc.) */
  identifier: z.string().min(1).max(128),
  /** Optional URL to the evidence source */
  url: z.string().url().max(512).optional(),
  /** Optional note about relevance to this boundary */
  note: z.string().max(280).optional(),
});

/**
 * Unified boundary schema for knowledge applicability constraints.
 *
 * Six layers define when knowledge is applicable:
 * - context: Situational context labels (e.g., 'frontend', 'production')
 * - versions: Version constraints for tools and libraries
 * - prerequisites: Conditions that must be satisfied
 * - signals: Patterns indicating relevance
 * - exclusions: Conditions that make knowledge NOT applicable
 * - evidence: Supporting evidence for boundary assertions
 *
 * All layers default to empty arrays for backward compatibility.
 * Nullable on records to distinguish "no boundary" from "empty boundary".
 */
export const boundarySchema = z.object({
  /** Situational context labels where this knowledge applies */
  context: z.array(z.string().min(1).max(64)).max(10).default([]),
  /** Version constraints for tools and libraries */
  versions: z.array(versionConstraintSchema).max(10).default([]),
  /** Prerequisites that must be satisfied before applying */
  prerequisites: z.array(boundaryConditionSchema).max(10).default([]),
  /** Signals indicating this knowledge is relevant */
  signals: z.array(signalMatcherSchema).max(20).default([]),
  /** Exclusion conditions that make this knowledge NOT applicable */
  exclusions: z.array(exclusionRuleSchema).max(10).default([]),
  /** Supporting evidence for boundary assertions */
  evidence: z.array(evidenceReferenceSchema).max(10).default([]),
});

export type ConditionKind = z.infer<typeof conditionKindSchema>;
export type SignalKind = z.infer<typeof signalKindSchema>;
export type ExclusionKind = z.infer<typeof exclusionKindSchema>;
export type EvidenceKind = z.infer<typeof evidenceKindSchema>;
export type VersionConstraint = z.infer<typeof versionConstraintSchema>;
export type BoundaryCondition = z.infer<typeof boundaryConditionSchema>;
export type SignalMatcher = z.infer<typeof signalMatcherSchema>;
export type ExclusionRule = z.infer<typeof exclusionRuleSchema>;
export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;
export type Boundary = z.infer<typeof boundarySchema>;

/**
 * Boundary context for retrieval queries.
 *
 * Represents the runtime environment/constraints of a retrieval request.
 * Used to determine which knowledge entries are applicable.
 *
 * Note: versions use {package, version} (specific query version), NOT {package, range} (constraint).
 */
export const boundaryVersionQuerySchema = z
  .object({
    package: z.string().min(1).max(128),
    version: z.string().min(1).max(64),
  })
  .strict();

export const boundaryContextSchema = z
  .object({
    contexts: z.array(z.string().min(1).max(64)).optional(),
    platform: z.string().min(1).max(64).optional(),
    versions: z.array(boundaryVersionQuerySchema).optional(),
  })
  .strict();

export type BoundaryVersionQuery = z.infer<typeof boundaryVersionQuerySchema>;
export type BoundaryContext = z.infer<typeof boundaryContextSchema>;

/**
 * Boundary explanation for retrieval results.
 *
 * Describes why a knowledge entry is applicable or potentially inapplicable
 * given the boundary context of the query.
 */
export const boundaryExplanationSchema = z
  .object({
    checked: z.boolean(),
    requiredSatisfied: z.boolean(),
    warnings: z.array(z.string()),
    boosts: z.array(z.string()),
  })
  .strict();

export type BoundaryExplanation = z.infer<typeof boundaryExplanationSchema>;

/**
 * Boundary metadata for artifact records.
 * Aliases the full Boundary schema for artifact use.
 */
export type BoundaryMeta = Boundary;
export { boundarySchema as boundaryMetaSchema };
