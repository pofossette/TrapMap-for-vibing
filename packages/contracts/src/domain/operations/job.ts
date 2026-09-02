import { z } from 'zod';

import { entityIdSchema, isoTimestampSchema } from '../common.js';

export const legacyMigrationResultItemSchema = z
  .object({
    /** Source legacy entry ID */
    entryId: entityIdSchema,
    /** Created artifact ID (null on failure) */
    artifactId: entityIdSchema.nullable(),
    /** Migration outcome */
    success: z.boolean(),
    /** Skip reason (e.g., 'already-migrated', 'invalid-state') */
    skipReason: z.string().max(280).nullable(),
    /** Error message on failure */
    error: z.string().max(500).nullable(),
  })
  .strict();

/**
 * Legacy entry migration response.
 * Returns migration results and counts.
 */

export const legacyMigrationResponseSchema = z
  .object({
    /** Per-entry migration results */
    results: z.array(legacyMigrationResultItemSchema),
    /** Count of successfully migrated entries */
    migratedCount: z.number().int().min(0),
    /** Count of skipped entries */
    skippedCount: z.number().int().min(0),
    /** Count of failed migrations */
    failedCount: z.number().int().min(0),
    /** Count of remaining unmigrated legacy entries */
    remainingLegacyCount: z.number().int().min(0),
    /** Migration timestamp */
    migratedAt: isoTimestampSchema,
  })
  .strict();

/**
 * Compatibility status response.
 * Provides migration progress and sunset readiness information.
 */

export const compatibilityStatusResponseSchema = z
  .object({
    /** Total legacy knowledge entries */
    totalLegacyEntries: z.number().int().min(0),
    /** Count of migrated entries (now artifacts) */
    migratedEntriesCount: z.number().int().min(0),
    /** Count of unmigrated entries */
    unmigratedEntriesCount: z.number().int().min(0),
    /** Count of total skill artifacts */
    totalArtifacts: z.number().int().min(0),
    /** Artifact count by source kind */
    artifactsBySourceKind: z.object({
      'skill-directory': z.number().int().min(0),
      'single-skill-md': z.number().int().min(0),
      'legacy-knowledge': z.number().int().min(0),
    }),
    /** IDs of unmigrated entries (bounded sample) */
    unmigratedEntryIds: z.array(entityIdSchema).max(50),
    /** Whether v1/v2 coexistence is active */
    coexistenceActive: z.boolean(),
    /** Ready to sunset v1 (no blockers remaining) */
    sunsetReady: z.boolean(),
    /** List of sunset blockers (if any) */
    sunsetBlockers: z.array(z.string().max(500)),
    /** Status timestamp */
    reportedAt: isoTimestampSchema,
  })
  .strict();

export const asyncWorkerDependencyStateSchema = z.enum([
  'running',
  'degraded',
  'remote',
  'not-configured',
]);

export const outboxEventOperatorSnapshotSchema = z
  .object({
    id: entityIdSchema,
    aggregateType: z.string().min(1),
    aggregateId: entityIdSchema,
    eventName: z.string().min(1),
    status: z.enum(['pending', 'processing', 'completed', 'failed']),
    attempts: z.number().int().min(0),
    workerId: z.string().nullable(),
    startedAt: isoTimestampSchema.nullable(),
    heartbeatAt: isoTimestampSchema.nullable(),
    leaseUntil: isoTimestampSchema.nullable(),
    createdAt: isoTimestampSchema,
    availableAt: isoTimestampSchema,
    publishedAt: isoTimestampSchema.nullable(),
    lastError: z.string().nullable(),
    ageSeconds: z.number().int().min(0),
  })
  .strict();

export const outboxStatusSnapshotSchema = z
  .object({
    provider: z.enum(['postgres', 'not-configured']),
    pending: z.number().int().min(0),
    processing: z.number().int().min(0),
    failed: z.number().int().min(0),
    staleProcessing: z.number().int().min(0),
    backlogOldestAgeSeconds: z.number().int().min(0).nullable(),
    processingOldestAgeSeconds: z.number().int().min(0).nullable(),
    failedOldestAgeSeconds: z.number().int().min(0).nullable(),
    reclaimCount: z.number().int().min(0),
    workerState: asyncWorkerDependencyStateSchema,
    serviceUnit: z.enum(['full-platform', 'candidate-ingestion', 'knowledge-governance']),
    ownership: z
      .object({
        ownsAny: z.boolean(),
        ownsOutboxWork: z.boolean(),
      })
      .strict(),
    recentFailures: z.array(outboxEventOperatorSnapshotSchema),
  })
  .strict();

export type LegacyMigrationResultItem = z.infer<typeof legacyMigrationResultItemSchema>;

export type LegacyMigrationResponse = z.infer<typeof legacyMigrationResponseSchema>;

export type CompatibilityStatusResponse = z.infer<typeof compatibilityStatusResponseSchema>;

export type AsyncWorkerDependencyState = z.infer<typeof asyncWorkerDependencyStateSchema>;

export type OutboxEventOperatorSnapshot = z.infer<typeof outboxEventOperatorSnapshotSchema>;

export type OutboxStatusSnapshot = z.infer<typeof outboxStatusSnapshotSchema>;

// =============================================================================
// Phase 19: Skill Edit and History Contracts (SKED-02, SKED-04)
// =============================================================================

/**
 * Skill edit response schema.
 * Returns updated artifact with revision tracking.
 */
