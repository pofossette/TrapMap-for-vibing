/**
 * Live Retrieval Evaluation Contracts
 *
 * Canonical Zod schemas for live retrieval evaluation: snapshot versioning,
 * service profiles, live report metadata, and snapshot corpus format.
 *
 * Design decisions:
 * - Snapshot version = corpus state + service profile + derivation context
 * - Two restore modes: frozen (full derived state) and rebuild (source-only, pipeline rebuilds)
 * - Service profile is a first-class citizen in snapshot metadata
 * - Stability-aware assertions: stable (must pass all versions) vs version-sensitive (compare only)
 */

import { z } from 'zod';

import { retrievalEvalEndpointSchema } from './retrieval.js';

// =============================================================================
// Service Profile Schema
// =============================================================================

/**
 * Service configuration profile captured alongside snapshot data.
 * Records the environment variables and settings that affect retrieval behavior.
 * Used for both snapshot export documentation and live eval runtime verification.
 */
export const liveEvalServiceProfileSchema = z.object({
  /** Embedding model identifier: "text-embedding-3-small" | "fallback-hash" | etc. */
  embeddingModel: z.string().min(1),
  /** Whether PostgreSQL vector/keyword search is enabled (USE_DB_SEARCH) */
  useDbSearch: z.boolean(),
  /** Whether PG-backed keyword channel is enabled for capsule retrieval */
  capsulePgKeyword: z.boolean(),
  /** Whether PG-backed semantic channel is enabled for capsule retrieval */
  capsulePgSemantic: z.boolean(),
  /** Whether Neo4j graph backend is enabled */
  graphDbEnabled: z.boolean(),
  /** Graph backend provider (null when disabled) */
  graphDbProvider: z.string().nullable(),
  /** Whether freshness decay scoring is enabled */
  decayEnabled: z.boolean(),
});

export type LiveEvalServiceProfile = z.infer<typeof liveEvalServiceProfileSchema>;

// =============================================================================
// Derivation Context Schema
// =============================================================================

/**
 * Derivation context describes how the snapshot's derived state was produced.
 * - frozen: corpus.json contains all derived tables; restore only imports, never re-derives
 * - rebuild: corpus.json contains only source data; restore triggers full indexing pipeline
 */
export const liveSnapshotDerivationModeSchema = z.enum(['frozen', 'rebuild']);

export type LiveSnapshotDerivationMode = z.infer<typeof liveSnapshotDerivationModeSchema>;

export const liveSnapshotDerivationContextSchema = z.object({
  /** Restore mode */
  mode: liveSnapshotDerivationModeSchema,
  /** Pipeline version that produced the derived state (commit hash or semver, null if unknown) */
  pipelineVersion: z.string().nullable(),
  /** Embedding model actually used to generate vectors in this snapshot */
  embeddingModelUsed: z.string().min(1),
});

export type LiveSnapshotDerivationContext = z.infer<typeof liveSnapshotDerivationContextSchema>;

// =============================================================================
// Snapshot Meta Schema
// =============================================================================

/**
 * Snapshot version metadata.
 * Each named snapshot version has one meta.json describing the corpus,
 * its provenance, and the conditions under which it should be restored.
 */
export const liveSnapshotMetaSchema = z.object({
  /** Schema version for forward compatibility */
  schemaVersion: z.literal(1),
  /** Human-readable version name (e.g., "2026-07-baseline") */
  version: z.string().min(1),
  /** Free-text description of this snapshot's purpose */
  description: z.string().default(''),
  /** Provenance: where and when this snapshot was exported */
  source: z.object({
    /** Source environment */
    environment: z.enum(['local', 'staging', 'production']),
    /** Export timestamp (ISO 8601) */
    exportedAt: z.string().datetime({ offset: true }),
    /** Tool or commit that produced this export */
    exportedBy: z.string().min(1),
    /** Team scope filter applied during export (null = all teams) */
    teamId: z.string().nullable(),
  }),
  /** Service configuration that was active during export */
  serviceProfile: liveEvalServiceProfileSchema,
  /** How derived state was produced */
  derivationContext: liveSnapshotDerivationContextSchema,
  /** Quantitative summary of the corpus contents */
  corpusSummary: z.object({
    knowledgeEntryCount: z.number().int().min(0),
    skillArtifactCount: z.number().int().min(0),
    graphIndexDocumentCount: z.number().int().min(0),
    capsuleEmbeddingCount: z.number().int().min(0),
    capsuleKeywordCount: z.number().int().min(0),
  }),
  /** SHA-256 fingerprint of corpus.json for integrity verification */
  fingerprint: z.string().min(1),
  /** Endpoints this snapshot is compatible with */
  compatibleEndpoints: z.array(retrievalEvalEndpointSchema).min(1),
  /** Known limitations or caveats for this snapshot */
  knownLimitations: z.array(z.string()).default([]),
});

export type LiveSnapshotMeta = z.infer<typeof liveSnapshotMetaSchema>;

// =============================================================================
// Live Report Meta Schema
// =============================================================================

/**
 * Live eval report metadata, extending the offline report meta with
 * snapshot versioning, backend connection, and index health fields.
 */
export const liveEvalReportMetaSchema = z.object({
  schemaVersion: z.literal(1),
  timestamp: z.string().datetime({ offset: true }),
  durationMs: z.number().int().min(0),
  options: z.object({
    tier: z.enum(['smoke', 'core']),
    endpoint: retrievalEvalEndpointSchema.optional(),
    dryRun: z.boolean(),
    allowEmpty: z.boolean(),
    verbose: z.number().int().min(0),
  }),
  /** Snapshot version used for this run */
  snapshotVersion: z.string().min(1),
  /** SHA-256 fingerprint of the corpus.json that was restored */
  snapshotFingerprint: z.string().min(1),
  /** Restore mode that was used */
  restoreMode: liveSnapshotDerivationModeSchema,
  /** Base URL of the live backend service */
  backendBaseUrl: z.string().url(),
  /** Service profile captured from the running service at test time */
  serviceProfileSnapshot: liveEvalServiceProfileSchema,
  /** Index health summary collected after snapshot restore */
  indexHealthSummary: z.object({
    knowledgeEntryCount: z.number().int().min(0),
    skillArtifactCount: z.number().int().min(0),
    graphDocCount: z.number().int().min(0),
    capsuleEmbeddingCount: z.number().int().min(0),
    graphProjectionHealthy: z.boolean(),
  }),
});

export type LiveEvalReportMeta = z.infer<typeof liveEvalReportMetaSchema>;

// =============================================================================
// Stability Tag for Case Assertions
// =============================================================================

/**
 * Stability classification for eval case assertions.
 * - stable: assertion should hold across all compatible snapshot versions (failure = regression)
 * - version-sensitive: assertion value may differ per version (used for cross-version comparison only)
 */
export const assertionStabilitySchema = z.enum(['stable', 'version-sensitive']);

export type AssertionStability = z.infer<typeof assertionStabilitySchema>;

// =============================================================================
// Live Eval Case Extension
// =============================================================================

/**
 * Extended case schema for live eval, adding stability classification.
 * Reuses the base retrievalEvalCaseSchema shape but adds the stability field.
 */
export const liveEvalCaseExtensionSchema = z.object({
  /**
   * Stability classification for this case's assertions.
   * - stable: governance, outcome, and shape structure must pass on any snapshot version
   * - version-sensitive: ranking/Hit@K may vary by snapshot; used for comparison only
   */
  stability: assertionStabilitySchema.default('stable'),
});

export type LiveEvalCaseExtension = z.infer<typeof liveEvalCaseExtensionSchema>;

// =============================================================================
// Version Comparison Report Schema
// =============================================================================

/**
 * Per-case diff between two snapshot versions.
 */
export const liveEvalCaseDiffSchema = z.object({
  caseId: z.string().min(1),
  endpoint: retrievalEvalEndpointSchema,
  /** Metric diffs */
  hitAt1Diff: z.number(),
  mrrDiff: z.number(),
  /** Whether outcome changed between versions */
  outcomeChanged: z.boolean(),
  /** Whether governance status changed */
  governanceChanged: z.boolean(),
  /** Whether graph-plan fallback status changed (v3 only) */
  fallbackChanged: z.boolean().optional(),
  /** Verdict for this case diff */
  verdict: z.enum(['improved', 'regressed', 'stable', 'diverged']),
});

export type LiveEvalCaseDiff = z.infer<typeof liveEvalCaseDiffSchema>;

/**
 * Slice-level comparison between two snapshot versions.
 */
export const liveEvalSliceDiffSchema = z.object({
  endpoint: retrievalEvalEndpointSchema,
  caseCount: z.number().int().min(0),
  hitAt1Baseline: z.number(),
  hitAt1Current: z.number(),
  hitAt1Diff: z.number(),
  mrrBaseline: z.number(),
  mrrCurrent: z.number(),
  mrrDiff: z.number(),
  governanceFailuresBaseline: z.number().int().min(0),
  governanceFailuresCurrent: z.number().int().min(0),
  verdict: z.enum(['improved', 'regressed', 'stable']),
});

export type LiveEvalSliceDiff = z.infer<typeof liveEvalSliceDiffSchema>;

/**
 * Full version comparison report.
 */
export const liveEvalComparisonReportSchema = z.object({
  baseline: z.object({
    snapshotVersion: z.string(),
    snapshotFingerprint: z.string(),
    restoreMode: liveSnapshotDerivationModeSchema,
    timestamp: z.string(),
  }),
  current: z.object({
    snapshotVersion: z.string(),
    snapshotFingerprint: z.string(),
    restoreMode: liveSnapshotDerivationModeSchema,
    timestamp: z.string(),
  }),
  slices: z.array(liveEvalSliceDiffSchema),
  cases: z.array(liveEvalCaseDiffSchema),
  overallVerdict: z.enum(['improved', 'regressed', 'stable', 'mixed']),
});

export type LiveEvalComparisonReport = z.infer<typeof liveEvalComparisonReportSchema>;
