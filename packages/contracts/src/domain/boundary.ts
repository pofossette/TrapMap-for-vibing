import { z } from 'zod';

import { entityIdSchema, isoTimestampSchema, labelSchema } from './common.js';

// =============================================================================
// Enums
// =============================================================================

/**
 * Condition operator for prerequisite and exclusion conditions.
 *
 * - equals: Field value equals the specified value
 * - not-equals: Field value does not equal the specified value
 * - contains: Field value contains the specified substring
 * - not-contains: Field value does not contain the specified substring
 * - matches: Field value matches the specified regex pattern
 * - not-matches: Field value does not match the specified regex pattern
 */
export const conditionOperatorSchema = z.enum([
  'equals',
  'not-equals',
  'contains',
  'not-contains',
  'matches',
  'not-matches',
]);

/**
 * Evidence type for boundary evidence entries.
 *
 * - user-reported: Manually reported by a user
 * - auto-detected: Automatically detected by the system
 * - inferred: Inferred from context or usage patterns
 * - reviewed: Confirmed through human review
 */
export const evidenceTypeSchema = z.enum([
  'user-reported',
  'auto-detected',
  'inferred',
  'reviewed',
]);

/**
 * Constraint mode for version and prerequisite constraints.
 *
 * - required: Must match for entry to be applicable
 * - preferred: Matching boosts ranking, mismatch does not exclude
 * - excluded: Matching causes ranking penalty
 */
export const constraintModeSchema = z.enum(['required', 'preferred', 'excluded']);

// =============================================================================
// Layer Schemas
// =============================================================================

/**
 * Context layer: Environment, platform, and runtime constraints.
 *
 * All fields are optional string arrays with max length limits for indexing efficiency.
 */
export const contextLayerSchema = z.object({
  /** Target environments (e.g., 'production', 'staging', 'development') */
  environments: z.array(z.string().max(64)).max(10).optional(),
  /** Target platforms (e.g., 'linux', 'darwin', 'windows') */
  platforms: z.array(z.string().max(64)).max(10).optional(),
  /** Target runtimes (e.g., 'node', 'bun', 'deno') */
  runtimes: z.array(z.string().max(64)).max(10).optional(),
});

/**
 * Version constraint for dependency version matching.
 *
 * Supports semver-compliant range syntax compatible with npm ecosystem.
 */
export const versionConstraintSchema = z.object({
  /** Dependency name (e.g., 'react', 'node') */
  dependency: z.string().min(1).max(128),
  /** Semver range (e.g., '^18.0.0', '>=16 <19', '*') */
  range: z.string().min(1).max(64),
  /** Human-readable display name (e.g., 'React 18+') */
  displayName: z.string().max(128).optional(),
  /** Constraint mode for retrieval filtering */
  mode: constraintModeSchema.default('required'),
});

/**
 * Versions layer: Dependency version constraints.
 */
export const versionsLayerSchema = z.object({
  /** Version constraints for dependencies */
  constraints: z.array(versionConstraintSchema).max(20).optional(),
});

/**
 * Condition object for complex applicability rules.
 *
 * Used in prerequisites and exclusions for conditional matching.
 */
export const conditionSchema = z.object({
  /** Field name to check */
  field: z.string().min(1).max(128),
  /** Comparison operator */
  operator: conditionOperatorSchema,
  /** Value to compare against */
  value: z.string().min(1).max(512),
});

/**
 * Prerequisite entry with optional condition.
 *
 * Describes requirements for the knowledge to be applicable.
 */
export const prerequisiteSchema = z.object({
  /** Prerequisite identifier */
  id: z.string().min(1).max(128),
  /** Human-readable display name */
  displayName: z.string().max(256).optional(),
  /** Constraint mode for retrieval filtering */
  mode: constraintModeSchema.default('required'),
  /** Optional condition for complex matching */
  condition: conditionSchema.optional(),
});

/**
 * Prerequisites layer: Required or preferred conditions.
 */
export const prerequisitesLayerSchema = z.object({
  /** Prerequisite entries */
  items: z.array(prerequisiteSchema).max(20).optional(),
});

/**
 * Signals layer: Keywords and patterns for retrieval matching.
 *
 * Used for search and discovery of applicable knowledge.
 */
export const signalsLayerSchema = z.object({
  /** Keywords for search matching */
  keywords: z.array(labelSchema).max(20).optional(),
  /** Error patterns to match against (regex supported) */
  errorPatterns: z.array(z.string().max(256)).max(20).optional(),
  /** Symptom descriptions for problem matching */
  symptoms: z.array(z.string().max(256)).max(20).optional(),
});

/**
 * Exclusion entry with optional condition and reason.
 *
 * Describes cases where the knowledge is NOT applicable.
 */
export const exclusionSchema = z.object({
  /** Exclusion identifier */
  id: z.string().min(1).max(128),
  /** Human-readable reason for exclusion */
  reason: z.string().max(256).optional(),
  /** Optional condition for complex matching */
  condition: conditionSchema.optional(),
});

/**
 * Exclusions layer: Cases where knowledge is not applicable.
 */
export const exclusionsLayerSchema = z.object({
  /** Exclusion entries */
  items: z.array(exclusionSchema).max(20).optional(),
});

/**
 * Evidence entry for boundary provenance tracking.
 *
 * Tracks the source and confidence of boundary constraints.
 */
export const evidenceEntrySchema = z.object({
  /** Source of this evidence (who/what provided it) */
  source: z.string().min(1).max(256),
  /** Type of evidence */
  type: evidenceTypeSchema,
  /** Confidence score in range [0, 1] */
  confidence: z.number().min(0).max(1),
  /** When this evidence was collected */
  timestamp: isoTimestampSchema.optional(),
  /** Additional details about the evidence */
  details: z.string().max(1000).optional(),
});

/**
 * Evidence layer: Provenance tracking for boundary constraints.
 */
export const evidenceLayerSchema = z.object({
  /** Evidence entries */
  entries: z.array(evidenceEntrySchema).max(10).optional(),
});

// =============================================================================
// Composite Boundary Schema
// =============================================================================

/**
 * Complete boundary schema with all 6 layers.
 *
 * Each layer is optional, allowing partial boundary specification.
 * Layers are designed for indexing efficiency with flat array structures.
 */
export const boundarySchema = z.object({
  /** Context layer: environment, platform, runtime constraints */
  context: contextLayerSchema.optional(),
  /** Versions layer: dependency version constraints */
  versions: versionsLayerSchema.optional(),
  /** Prerequisites layer: required or preferred conditions */
  prerequisites: prerequisitesLayerSchema.optional(),
  /** Signals layer: keywords and patterns for retrieval */
  signals: signalsLayerSchema.optional(),
  /** Exclusions layer: cases where knowledge is not applicable */
  exclusions: exclusionsLayerSchema.optional(),
  /** Evidence layer: provenance tracking for boundary constraints */
  evidence: evidenceLayerSchema.optional(),
});

/**
 * Boundary metadata for attachment to knowledge entries and skill artifacts.
 *
 * Wraps the boundary schema with tracking metadata for auditability.
 */
export const boundaryMetaSchema = z.object({
  /** The boundary constraints */
  boundary: boundarySchema,
  /** When the boundary was last updated */
  lastUpdated: isoTimestampSchema,
  /** Who last updated the boundary */
  updatedBy: entityIdSchema.optional(),
  /** Free-form notes about the boundary */
  notes: z.string().max(1000).optional(),
});

// =============================================================================
// Type Exports
// =============================================================================

export type ConditionOperator = z.infer<typeof conditionOperatorSchema>;
export type EvidenceType = z.infer<typeof evidenceTypeSchema>;
export type ConstraintMode = z.infer<typeof constraintModeSchema>;
export type ContextLayer = z.infer<typeof contextLayerSchema>;
export type VersionConstraint = z.infer<typeof versionConstraintSchema>;
export type VersionsLayer = z.infer<typeof versionsLayerSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type Prerequisite = z.infer<typeof prerequisiteSchema>;
export type PrerequisitesLayer = z.infer<typeof prerequisitesLayerSchema>;
export type SignalsLayer = z.infer<typeof signalsLayerSchema>;
export type Exclusion = z.infer<typeof exclusionSchema>;
export type ExclusionsLayer = z.infer<typeof exclusionsLayerSchema>;
export type EvidenceEntry = z.infer<typeof evidenceEntrySchema>;
export type EvidenceLayer = z.infer<typeof evidenceLayerSchema>;
export type Boundary = z.infer<typeof boundarySchema>;
export type BoundaryMeta = z.infer<typeof boundaryMetaSchema>;
