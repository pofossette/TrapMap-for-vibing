import { z } from 'zod';

import {
  compatibleScriptActivationPolicySchema,
  skillArtifactFileKindSchema,
  skillArtifactFileSourceSchema,
  skillArtifactSchema,
} from './artifacts.js';
import { feedbackFailureClassificationSchema } from './feedback.js';
import {
  actorRefSchema,
  auditMetadataSchema,
  entityIdSchema,
  isoTimestampSchema,
  labelSchema,
  lifecycleStateSchema,
  mediaTypeSchema,
  scopeSchema,
  securityLevelSchema,
  sha256HexSchema,
} from './common.js';
import { evidenceLevelSchema, evidenceSourceTypeSchema } from './evidence.js';
import {
  agentReviewResultSchema,
  knowledgeEntrySchema,
  knowledgeListItemSchema,
  knowledgeSubmissionSchema,
  reviewDecisionSchema,
} from './knowledge.js';
import { canonicalPathSchema } from './path-validation.js';

export const knowledgeDeactivateRequestSchema = z
  .object({
    entryId: entityIdSchema,
    reason: z.string().min(1).max(500),
  })
  .strict();

export const knowledgeListRequestSchema = z.object({
  scope: scopeSchema.optional(),
  lifecycleState: z.array(lifecycleStateSchema).optional(),
  requiredLevelMax: securityLevelSchema.optional(),
  ownerUserId: entityIdSchema.optional(),
  /** Filter by evidence level */
  evidenceLevel: z.array(evidenceLevelSchema).optional(),
  /** Filter by source type */
  sourceType: z.array(evidenceSourceTypeSchema).optional(),
  /** Filter entries verified before this timestamp */
  verifiedBefore: isoTimestampSchema.optional(),
  /** Filter entries verified after this timestamp */
  verifiedAfter: isoTimestampSchema.optional(),
  /** Filter entries with missing evidence metadata */
  missingEvidence: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(128).optional(),
});

export const knowledgeListResponseSchema = z
  .object({
    items: z.array(knowledgeListItemSchema),
    nextCursor: z.string().min(1).max(128).nullable(),
    total: z.number().int().min(0),
  })
  .strict()
  .refine((d) => d.total === d.items.length, {
    message: 'total must match items.length',
  });

export const knowledgeDeactivateResponseSchema = z
  .object({
    entry: knowledgeEntrySchema,
  })
  .strict();

export const exportRequestSchema = z.object({
  teamId: entityIdSchema.nullable().optional(),
  includeHistory: z.boolean().default(true),
});

export const exportBundleSchema = z
  .object({
    exportedAt: z.string(),
    exportedBy: actorRefSchema,
    items: z.array(knowledgeEntrySchema),
  })
  .strict();

export const importEntrySchema = knowledgeSubmissionSchema.extend({
  source: z.enum(['json', 'claude-skill']),
  requestedLevel: securityLevelSchema,
});

export const importRequestSchema = z.object({
  entries: z.array(importEntrySchema).min(1),
});

export const importResultItemSchema = z
  .object({
    success: z.boolean(),
    entry: knowledgeEntrySchema.nullable(),
    error: z.string().nullable(),
    source: z.enum(['json', 'claude-skill']),
  })
  .strict()
  .refine((d) => !d.success || d.entry !== null, {
    message: 'entry must be non-null when success is true',
  });

export const importResponseSchema = z
  .object({
    results: z.array(importResultItemSchema),
    importedCount: z.number().int().min(0),
    failedCount: z.number().int().min(0),
  })
  .strict()
  .refine((d) => d.importedCount === d.results.filter((r) => r.success).length, {
    message: 'importedCount must match the number of successful results',
  })
  .refine((d) => d.failedCount === d.results.filter((r) => !r.success).length, {
    message: 'failedCount must match the number of failed results',
  });

export const claudeSkillMetadataSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  version: z.string().optional(),
});

export const claudeSkillImportSchema = z.object({
  metadata: claudeSkillMetadataSchema,
  content: z.string().min(1),
  requestedLevel: securityLevelSchema,
});

/**
 * Canonical file payload within a bundle-json import.
 * Carries file metadata and inline content (bytes or UTF-8 text).
 */
export const bundleFilePayloadSchema = z.object({
  /** Canonical path within the skill directory */
  path: canonicalPathSchema,
  /** File kind for role classification */
  kind: z.enum(['skill-markdown', 'reference', 'asset', 'script']),
  /** SHA-256 hash of file content for integrity */
  sha256: sha256HexSchema,
  /** File size in bytes */
  sizeBytes: z.number().int().min(0),
  /** IANA media type */
  mediaType: mediaTypeSchema,
  /** Source directory within the skill artifact */
  source: z.enum(['references/', 'assets/', 'scripts/', 'SKILL.md']),
  /** If true, file may be used for capsule/profile derivation */
  includeInDerivation: z.boolean(),
  /** If true, file is activation-only */
  activationOnly: z.boolean(),
  /** Inline file content: base64-encoded bytes or UTF-8 text */
  content: z.union([z.string().base64(), z.string()]),
});

/**
 * Script descriptor within a bundle-json import.
 * Captures intent and constraints for executable scripts.
 */
export const bundleScriptDescriptorSchema = z.object({
  /** Path to the script file */
  path: canonicalPathSchema,
  /** SHA-256 hash of the script content */
  sha256: sha256HexSchema,
  /** Human-readable capability description */
  capability: z.string().min(1).max(280),
  /** Brief summary of argument schema */
  argsSchemaSummary: z.string().max(280).default(''),
  /** Brief summary of side effects */
  sideEffectSummary: z.string().max(280).default(''),
  /** Default execution policy */
  defaultPolicy: compatibleScriptActivationPolicySchema,
});

/**
 * Canonical artifact bundle for import/export.
 * Carries one skill artifact's metadata, files, and descriptors.
 */
export const artifactBundleSchema = z.object({
  /** Root governance fields */
  scope: z.enum(['global', 'project']),
  labels: z.array(labelSchema).min(1),
  title: z.string().min(1).max(280),
  slug: z.string().min(1).max(160),
  requiredLevel: securityLevelSchema,
  /** How this artifact was created */
  sourceKind: z.enum(['skill-directory', 'single-skill-md', 'legacy-knowledge']),
  /** Canonical file manifest with inline payloads */
  files: z.array(bundleFilePayloadSchema).min(1),
  /** Script descriptors for executable scripts */
  scriptDescriptors: z.array(bundleScriptDescriptorSchema).default([]),
});

/**
 * Artifact-native import request using bundle-json transport.
 * Replaces legacy entries[] flattening with artifact bundles.
 */
export const artifactImportRequestSchema = z.object({
  /** One or more artifact bundles to import */
  bundles: z.array(artifactBundleSchema).min(1),
});

/**
 * Artifact import result item.
 * Returns created artifact or error details per bundle.
 */
export const artifactImportResultItemSchema = z
  .object({
    success: z.boolean(),
    artifactId: z.string().nullable(),
    title: z.string().nullable(),
    error: z.string().nullable(),
    sourceKind: z.enum(['skill-directory', 'single-skill-md', 'legacy-knowledge']).nullable(),
  })
  .strict();

/**
 * Artifact-native import response.
 * Returns per-bundle results and counts.
 */
export const artifactImportResponseSchema = z
  .object({
    results: z.array(artifactImportResultItemSchema),
    importedCount: z.number().int().min(0),
    failedCount: z.number().int().min(0),
  })
  .strict();

/**
 * Additive file payload storage record.
 * Internal server-side structure for imported file payloads.
 * Keyed by artifact id + revision + path for round-trip export.
 */
export const artifactFilePayloadRecordSchema = z
  .object({
    /** Artifact identifier */
    artifactId: entityIdSchema,
    /** Revision number */
    revision: z.number().int().min(1),
    /** Canonical path within the skill directory */
    path: canonicalPathSchema,
    /** SHA-256 hash of file content */
    sha256: sha256HexSchema,
    /** File size in bytes */
    sizeBytes: z.number().int().min(0),
    /** IANA media type */
    mediaType: mediaTypeSchema,
    /** Inline file content: base64-encoded bytes or UTF-8 text */
    content: z.union([z.string().base64(), z.string()]),
    /** When this payload was stored */
    storedAt: isoTimestampSchema,
  })
  .strict();

export const auditEventSchema = z
  .object({
    id: entityIdSchema,
    teamId: entityIdSchema.nullable(),
    actor: actorRefSchema,
    action: z.enum([
      'knowledge-submitted',
      'knowledge-reviewed',
      'knowledge-imported',
      'knowledge-exported',
      'knowledge-deactivated',
      'member-updated',
      'artifact-imported',
      'artifact-exported',
      'artifact-deactivated',
    ]),
    entityId: entityIdSchema,
    payload: z.record(z.string(), z.unknown()),
  })
  .merge(auditMetadataSchema);

export const auditQuerySchema = z.object({
  action: z
    .array(
      z.enum([
        'knowledge-reviewed',
        'knowledge-imported',
        'knowledge-exported',
        'knowledge-deactivated',
        'member-updated',
        'artifact-imported',
        'artifact-exported',
        'artifact-deactivated',
      ]),
    )
    .optional(),
  actorId: entityIdSchema.optional(),
  entityId: entityIdSchema.optional(),
  teamId: entityIdSchema.optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(128).optional(),
});

export const auditListResponseSchema = z
  .object({
    items: z.array(auditEventSchema),
    nextCursor: z.string().min(1).max(128).nullable(),
    total: z.number().int().min(0),
  })
  .strict();

/**
 * Export format selection for artifact-native exports.
 * - bundle-json: Canonical transport with full file payloads
 * - distilled-json: Compact projection of cached derived outputs
 * - skill-dir: CLI-local format selector (server returns bundle-json)
 */
export const artifactExportFormatSchema = z.enum(['bundle-json', 'distilled-json', 'skill-dir']);

/**
 * Artifact-native export request.
 * Targets one artifact by ID with explicit format selection.
 */
export const artifactExportRequestSchema = z.object({
  /** Target artifact to export */
  artifactId: entityIdSchema,
  /** Export format selection */
  format: artifactExportFormatSchema.default('bundle-json'),
});

/**
 * Distilled artifact export projection.
 * Compact view built from cached derived outputs.
 */
export const distilledArtifactSchema = z.object({
  /** Artifact identifier */
  artifactId: entityIdSchema,
  /** Governance scope */
  scope: scopeSchema,
  /** Artifact labels */
  labels: z.array(labelSchema).min(1),
  /** Human-readable title */
  title: z.string().min(1).max(280),
  /** URL-safe slug */
  slug: z
    .string()
    .min(1)
    .max(160)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  /** Security level */
  requiredLevel: securityLevelSchema,
  /** Source kind */
  sourceKind: z.enum(['skill-directory', 'single-skill-md', 'legacy-knowledge']),
  /** Cached derived profile (if available) */
  profile: z.record(z.string(), z.unknown()).nullable(),
  /** Cached derived capsules (if available) */
  capsules: z.array(z.record(z.string(), z.unknown())).nullable(),
  /** Cached client manifest (if available) */
  clientManifest: z.record(z.string(), z.unknown()).nullable(),
  /** Export timestamp */
  exportedAt: isoTimestampSchema,
});

/**
 * Artifact-native export response.
 * Returns either canonical bundle or distilled projection.
 */
export const artifactExportResponseSchema = z
  .object({
    /** Export format used */
    format: artifactExportFormatSchema,
    /** Export timestamp */
    exportedAt: isoTimestampSchema,
    /** Exporting actor */
    exportedBy: actorRefSchema,
    /** Canonical bundle (when format is bundle-json or skill-dir) */
    bundle: artifactBundleSchema.nullable(),
    /** Distilled projection (when format is distilled-json) */
    distilled: distilledArtifactSchema.nullable(),
  })
  .refine((d) => d.format !== 'bundle-json' || d.bundle !== null, {
    message: 'bundle must be non-null when format is bundle-json',
  });

export type ExportBundle = z.infer<typeof exportBundleSchema>;
export type ImportEntry = z.infer<typeof importEntrySchema>;
export type ImportRequest = z.infer<typeof importRequestSchema>;
export type ImportResultItem = z.infer<typeof importResultItemSchema>;
export type ImportResponse = z.infer<typeof importResponseSchema>;
export type ClaudeSkillMetadata = z.infer<typeof claudeSkillMetadataSchema>;
export type ClaudeSkillImport = z.infer<typeof claudeSkillImportSchema>;
export type BundleFilePayload = z.infer<typeof bundleFilePayloadSchema>;
export type BundleScriptDescriptor = z.infer<typeof bundleScriptDescriptorSchema>;
export type ArtifactBundle = z.infer<typeof artifactBundleSchema>;
export type ArtifactImportRequest = z.infer<typeof artifactImportRequestSchema>;
export type ArtifactImportResultItem = z.infer<typeof artifactImportResultItemSchema>;
export type ArtifactImportResponse = z.infer<typeof artifactImportResponseSchema>;
export type ArtifactFilePayloadRecord = z.infer<typeof artifactFilePayloadRecordSchema>;
export type AuditEvent = z.infer<typeof auditEventSchema>;
export type AuditQuery = z.infer<typeof auditQuerySchema>;
export type AuditListResponse = z.infer<typeof auditListResponseSchema>;
export type KnowledgeListRequest = z.infer<typeof knowledgeListRequestSchema>;
export type KnowledgeListResponse = z.infer<typeof knowledgeListResponseSchema>;
export type KnowledgeDeactivateResponse = z.infer<typeof knowledgeDeactivateResponseSchema>;
export type ArtifactExportFormat = z.infer<typeof artifactExportFormatSchema>;
export type ArtifactExportRequest = z.infer<typeof artifactExportRequestSchema>;
export type DistilledArtifact = z.infer<typeof distilledArtifactSchema>;
export type ArtifactExportResponse = z.infer<typeof artifactExportResponseSchema>;

/**
 * Activation/download file payload.
 * Selected file with inline content for activation-time delivery.
 */
export const activationFilePayloadSchema = z
  .object({
    /** Canonical path within the skill directory */
    path: canonicalPathSchema,
    /** File kind */
    kind: skillArtifactFileKindSchema,
    /** SHA-256 hash of file content */
    sha256: sha256HexSchema,
    /** File size in bytes */
    sizeBytes: z.number().int().min(0),
    /** IANA media type */
    mediaType: mediaTypeSchema,
    /** Source directory */
    source: skillArtifactFileSourceSchema,
    /** Inline file content: base64-encoded bytes or UTF-8 text */
    content: z.union([z.string().base64(), z.string()]),
  })
  .strict();

/**
 * Selective activation request targeting one artifact revision.
 * Allows bounded path selection for references, assets, and scripts.
 */
export const activationRequestSchema = z.object({
  /** Target artifact identifier */
  artifactId: entityIdSchema,
  /** Optional revision number (defaults to latest) */
  revision: z.number().int().min(1).optional(),
  /** Selected paths to fetch (bounded set) */
  selectedPaths: z.array(canonicalPathSchema).min(1).max(50),
});

/**
 * Selective activation response.
 * Returns only requested files with metadata for policy-aware materialization.
 */
export const activationResponseSchema = z
  .object({
    /** Artifact identifier */
    artifactId: entityIdSchema,
    /** Artifact title */
    title: z.string().min(1).max(280),
    /** Revision number */
    revision: z.number().int().min(1),
    /** Security level */
    requiredLevel: securityLevelSchema,
    /** Selected file payloads with inline content */
    files: z.array(activationFilePayloadSchema),
    /** Script descriptors for any scripts in selected paths */
    scriptDescriptors: z.array(bundleScriptDescriptorSchema).default([]),
    /** Activation timestamp */
    activatedAt: isoTimestampSchema,
    /** Activating actor */
    activatedBy: actorRefSchema,
  })
  .strict();

export type ActivationFilePayload = z.infer<typeof activationFilePayloadSchema>;
export type ActivationRequest = z.infer<typeof activationRequestSchema>;
export type ActivationResponse = z.infer<typeof activationResponseSchema>;

/**
 * Migration mode for legacy knowledge entries.
 * - explicit: Migrate specific entry IDs provided in entryIds
 * - all-approved: Migrate all approved legacy entries (bounded by limit)
 * - all-team: Migrate all entries for a specific team (bounded by limit)
 */
export const legacyMigrationModeSchema = z.enum(['explicit', 'all-approved', 'all-team']);

/**
 * Legacy entry migration request.
 * Requests conversion of legacy knowledge entries into minimal skill artifacts.
 */
export const legacyMigrationRequestSchema = z
  .object({
    /** Migration mode controlling which entries to migrate */
    mode: legacyMigrationModeSchema,
    /** Explicit entry IDs to migrate (required for 'explicit' mode) */
    entryIds: z.array(entityIdSchema).max(100).optional(),
    /** Team ID for 'all-team' mode */
    teamId: entityIdSchema.optional(),
    /** Maximum entries to migrate in bounded modes (default 50, max 200) */
    limit: z.number().int().min(1).max(200).default(50),
  })
  .strict();

/**
 * Result item for a single legacy entry migration attempt.
 */
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
 * Compatibility status request.
 * Requests current migration and compatibility window status.
 */
export const compatibilityStatusRequestSchema = z.object({
  /** Optional team ID to filter status */
  teamId: entityIdSchema.optional(),
});

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

export const queueTaskOperatorSnapshotSchema = z
  .object({
    id: entityIdSchema,
    type: z.string().min(1),
    status: z.enum(['pending', 'running', 'completed', 'failed', 'dead']),
    attempts: z.number().int().min(0),
    maxAttempts: z.number().int().min(1),
    dedupeKey: z.string().nullable(),
    workerId: z.string().nullable(),
    startedAt: isoTimestampSchema.nullable(),
    heartbeatAt: isoTimestampSchema.nullable(),
    leaseUntil: isoTimestampSchema.nullable(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    processAfter: isoTimestampSchema,
    completedAt: isoTimestampSchema.nullable(),
    lastError: z.string().nullable(),
    ageSeconds: z.number().int().min(0),
  })
  .strict();

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

export const queueStatusSnapshotSchema = z
  .object({
    provider: z.enum(['postgres', 'rabbitmq', 'not-configured']),
    pending: z.number().int().min(0),
    running: z.number().int().min(0),
    dead: z.number().int().min(0),
    staleRunning: z.number().int().min(0),
    backlogOldestAgeSeconds: z.number().int().min(0).nullable(),
    runningOldestAgeSeconds: z.number().int().min(0).nullable(),
    deadOldestAgeSeconds: z.number().int().min(0).nullable(),
    reclaimCount: z.number().int().min(0),
    workerState: asyncWorkerDependencyStateSchema,
    serviceUnit: z.enum(['full-platform', 'candidate-ingestion', 'knowledge-governance']),
    ownership: z
      .object({
        ownsAny: z.boolean(),
        ownsCandidateTaskWork: z.boolean(),
        ownsSharedJobTaskWork: z.boolean(),
      })
      .strict(),
    recentDeadLetters: z.array(queueTaskOperatorSnapshotSchema),
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

export const workflowRunSnapshotSchema = z
  .object({
    runId: entityIdSchema,
    workflowType: z.enum([
      'candidate-processing',
      'capsule-index-rebuild',
      'knowledge-index-follow-up',
      'skill-index-follow-up',
      'feedback-remediation-reactivation',
      'badcase-export-draft',
    ]),
    subjectId: entityIdSchema,
    status: z.enum(['pending', 'running', 'completed', 'failed']),
    stepName: z.string().nullable(),
    attempt: z.number().int().min(0),
    startedAt: isoTimestampSchema.nullable(),
    completedAt: isoTimestampSchema.nullable(),
    lastError: z.string().nullable(),
    stats: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .strict();

export const retrievalCacheNamespaceStatsSchema = z
  .object({
    hits: z.number().int().min(0),
    misses: z.number().int().min(0),
    evictions: z.number().int().min(0),
    invalidations: z.number().int().min(0),
    size: z.number().int().min(0),
    hitRate: z.number().min(0).max(1),
    staleRecoveries: z.number().int().min(0),
    pendingInvalidation: z.boolean(),
    lastInvalidatedAt: isoTimestampSchema.nullable(),
    lastRecoveredAt: isoTimestampSchema.nullable(),
  })
  .strict();

export const operatorStatusGroupSchema = z
  .object({
    headline: z.string().min(1).max(280),
    status: z.enum(['healthy', 'degraded', 'investigate']),
    summary: z.string().min(1).max(1000),
  })
  .strict();

export const configGovernanceSummarySchema = z
  .object({
    fingerprint: z.string().min(1).max(128),
    deploymentProfile: z.enum(['local-agent', 'team-monolith', 'distributed']),
    runtimeMode: z.enum(['api', 'task-worker', 'outbox-worker', 'combined']),
    serviceUnit: z.enum(['full-platform', 'candidate-ingestion', 'knowledge-governance']),
    taskTransportProvider: z.enum(['postgres', 'rabbitmq']),
    eventTransportProvider: z.literal('postgres'),
    profileAwareCapabilitySummary: z
      .object({
        routeSurface: z.enum(['minimal-agent', 'gateway-core', 'worker-status']),
        asyncOwnershipExpectation: z.enum(['local-owned', 'split-owned', 'remote-expected']),
        storagePosture: z.enum(['json-store-ok', 'postgres-required']),
        authTeamExpectation: z.enum(['single-user', 'team-auth']),
      })
      .strict(),
    deprecatedEnvKeys: z.array(z.string().min(1).max(120)),
    conflictWarnings: z.array(z.string().min(1).max(500)),
  })
  .strict();

export const capacityModelSummarySchema = z
  .object({
    databasePool: z
      .object({
        configured: z.boolean(),
        maxConnections: z.number().int().min(0).nullable(),
      })
      .strict(),
    handlerLatency: z
      .object({
        averageMs: z.number().min(0),
        investigateAboveMs: z.number().min(0),
      })
      .strict(),
    backlogPressure: z
      .object({
        queuePending: z.number().int().min(0),
        outboxPending: z.number().int().min(0),
        workflowsInFlight: z.number().int().min(0),
      })
      .strict(),
    cachePressure: z
      .object({
        namespacesWithPendingInvalidation: z.number().int().min(0),
        staleRecoveryCount: z.number().int().min(0),
      })
      .strict(),
  })
  .strict();

export const workflowOperatorSummarySchema = z
  .object({
    runId: entityIdSchema,
    workflowType: workflowRunSnapshotSchema.shape.workflowType,
    status: workflowRunSnapshotSchema.shape.status,
    stepName: z.string().nullable(),
    lastError: z.string().nullable(),
    checkpoint: z.string().nullable(),
    resumeAllowed: z.boolean(),
    progress: z
      .object({
        completed: z.number().min(0).nullable(),
        total: z.number().min(0).nullable(),
        percent: z.number().min(0).max(100).nullable(),
      })
      .strict(),
    failureSample: z.string().nullable(),
  })
  .strict();

export const asyncFailureCategorySchema = z.enum([
  'user-error',
  'auth-policy-error',
  'dependency-error',
  'timeout',
  'stale-projection',
  'retryable-async-failure',
  'permanent-failure',
]);

export const asyncFailureTaxonomyItemSchema = z
  .object({
    category: asyncFailureCategorySchema,
    meaning: z.string().min(1).max(500),
    operatorAction: z.string().min(1).max(1000),
  })
  .strict();

export const asyncFreshnessContractSchema = z
  .object({
    consistencyModel: z.literal('eventual-consistency'),
    writeVisibility: z
      .object({
        authoritativeWriteCommitted: z.boolean(),
        projectionRefreshPending: z.boolean(),
        cachesPendingInvalidation: z.boolean(),
      })
      .strict(),
    projectionLag: z
      .object({
        queueBacklog: z.number().int().min(0),
        outboxBacklog: z.number().int().min(0),
        staleWorkers: z.number().int().min(0),
        workflowsInFlight: z.number().int().min(0),
      })
      .strict(),
    operatorGuidance: z.string().min(1).max(1000),
  })
  .strict();

export const asyncRuntimeContractSchema = z
  .object({
    workerModes: z
      .object({
        api: z.string().min(1).max(500),
        'task-worker': z.string().min(1).max(500),
        'outbox-worker': z.string().min(1).max(500),
        combined: z.string().min(1).max(500),
      })
      .strict(),
    degradedSemantics: z.string().min(1).max(1000),
  })
  .strict();

export const asyncIdempotencyContractSchema = z
  .object({
    syncCommandKey: z.string().min(1).max(280),
    asyncTaskKey: z.string().min(1).max(280),
    bulkJobKey: z.string().min(1).max(280),
    dedupeWindow: z.string().min(1).max(500),
  })
  .strict();

export const asyncRetryResumeContractSchema = z
  .object({
    queueRetryPolicy: z.string().min(1).max(500),
    outboxRetryPolicy: z.string().min(1).max(500),
    deadLetterPolicy: z.string().min(1).max(500),
    reclaimPolicy: z.string().min(1).max(500),
    workflowCheckpointSource: z.string().min(1).max(500),
    bulkResumePolicy: z.string().min(1).max(500),
  })
  .strict();

export const asyncOperationsStatusResponseSchema = z
  .object({
    asyncRuntimeEnabled: z.boolean(),
    deploymentProfile: z.enum(['local-agent', 'team-monolith', 'distributed']),
    runtimeMode: z.enum(['api', 'task-worker', 'outbox-worker', 'combined']),
    serviceUnit: z.enum(['full-platform', 'candidate-ingestion', 'knowledge-governance']),
    routeSurface: z.enum(['minimal-agent', 'gateway-core', 'worker-status']),
    asyncOwnershipExpectation: z.enum(['local-owned', 'split-owned', 'remote-expected']),
    storagePosture: z.enum(['json-store-ok', 'postgres-required']),
    authTeamExpectation: z.enum(['single-user', 'team-auth']),
    taskTransportProvider: z.enum(['postgres', 'rabbitmq', 'not-configured']),
    eventTransportProvider: z.enum(['postgres', 'not-configured']),
    adoptionGuidance: z.string(),
    runtimeContract: asyncRuntimeContractSchema,
    idempotencyContract: asyncIdempotencyContractSchema,
    retryResumeContract: asyncRetryResumeContractSchema,
    freshnessContract: asyncFreshnessContractSchema,
    failureTaxonomy: z.array(asyncFailureTaxonomyItemSchema).length(7),
    operatorHome: z
      .object({
        health: operatorStatusGroupSchema,
        status: operatorStatusGroupSchema,
        freshness: operatorStatusGroupSchema,
        capacity: operatorStatusGroupSchema,
        jobControl: operatorStatusGroupSchema,
      })
      .strict(),
    configGovernance: configGovernanceSummarySchema,
    capacityModel: capacityModelSummarySchema,
    queue: queueStatusSnapshotSchema,
    outbox: outboxStatusSnapshotSchema,
    diagnostics: z
      .object({
        dominantFailureCategory: asyncFailureCategorySchema.nullable(),
        owningSubsystem: z.enum(['queue', 'outbox', 'workflow', 'cache', 'badcase', 'none']),
        nextInspection: z.string().min(1).max(500),
        evidence: z.array(z.string().min(1).max(500)).max(10),
        badcaseClassificationSummary: z
          .object({
            totalClassified: z.number().int().min(0),
            dominantClassification: feedbackFailureClassificationSchema.nullable(),
            counts: z.array(
              z
                .object({
                  classification: feedbackFailureClassificationSchema,
                  count: z.number().int().min(0),
                })
                .strict(),
            ),
          })
          .strict(),
      })
      .strict(),
    cache: z.record(z.string(), retrievalCacheNamespaceStatsSchema),
    workflows: z.array(workflowRunSnapshotSchema),
    bulkOperations: z.array(workflowOperatorSummarySchema),
    reportedAt: isoTimestampSchema,
  })
  .strict();

export const asyncTaskRequeueResponseSchema = z
  .object({
    taskId: entityIdSchema,
    requeued: z.boolean(),
    reportedAt: isoTimestampSchema,
  })
  .strict();

export type LegacyMigrationMode = z.infer<typeof legacyMigrationModeSchema>;
export type LegacyMigrationRequest = z.infer<typeof legacyMigrationRequestSchema>;
export type LegacyMigrationResultItem = z.infer<typeof legacyMigrationResultItemSchema>;
export type LegacyMigrationResponse = z.infer<typeof legacyMigrationResponseSchema>;
export type CompatibilityStatusRequest = z.infer<typeof compatibilityStatusRequestSchema>;
export type CompatibilityStatusResponse = z.infer<typeof compatibilityStatusResponseSchema>;
export type AsyncWorkerDependencyState = z.infer<typeof asyncWorkerDependencyStateSchema>;
export type QueueTaskOperatorSnapshot = z.infer<typeof queueTaskOperatorSnapshotSchema>;
export type OutboxEventOperatorSnapshot = z.infer<typeof outboxEventOperatorSnapshotSchema>;
export type QueueStatusSnapshot = z.infer<typeof queueStatusSnapshotSchema>;
export type OutboxStatusSnapshot = z.infer<typeof outboxStatusSnapshotSchema>;
export type WorkflowRunSnapshot = z.infer<typeof workflowRunSnapshotSchema>;
export type RetrievalCacheNamespaceStats = z.infer<typeof retrievalCacheNamespaceStatsSchema>;
export type OperatorStatusGroup = z.infer<typeof operatorStatusGroupSchema>;
export type ConfigGovernanceSummary = z.infer<typeof configGovernanceSummarySchema>;
export type CapacityModelSummary = z.infer<typeof capacityModelSummarySchema>;
export type WorkflowOperatorSummary = z.infer<typeof workflowOperatorSummarySchema>;
export type AsyncFailureCategory = z.infer<typeof asyncFailureCategorySchema>;
export type AsyncFailureTaxonomyItem = z.infer<typeof asyncFailureTaxonomyItemSchema>;
export type AsyncFreshnessContract = z.infer<typeof asyncFreshnessContractSchema>;
export type AsyncRuntimeContract = z.infer<typeof asyncRuntimeContractSchema>;
export type AsyncIdempotencyContract = z.infer<typeof asyncIdempotencyContractSchema>;
export type AsyncRetryResumeContract = z.infer<typeof asyncRetryResumeContractSchema>;
export type AsyncOperationsStatusResponse = z.infer<typeof asyncOperationsStatusResponseSchema>;
export type AsyncTaskRequeueResponse = z.infer<typeof asyncTaskRequeueResponseSchema>;

export const badcaseEvalDraftSchema = z
  .object({
    kind: z.enum(['retrieval', 'summary']),
    caseId: entityIdSchema,
    sourceFeedbackId: entityIdSchema,
    queryId: z.string().nullable(),
    routeFamily: z.enum(['entry', 'capsule', 'graph-plan']).nullable(),
    request: z.record(z.string(), z.unknown()),
    expected: z.record(z.string(), z.unknown()),
    notes: z.array(z.string().min(1)),
  })
  .strict();

export const badcaseExportResponseSchema = z
  .object({
    feedbackId: entityIdSchema,
    draft: badcaseEvalDraftSchema,
    exportedAt: isoTimestampSchema,
  })
  .strict();

export const architectureDecisionThresholdSchema = z
  .object({
    metric: z.string().min(1),
    healthyBelowOrEqual: z.number().min(0).nullable(),
    investigateAbove: z.number().min(0).nullable(),
    action: z.string().min(1),
  })
  .strict();

// =============================================================================
// Phase 19: Skill Edit and History Contracts (SKED-02, SKED-04)
// =============================================================================

/**
 * Skill edit request schema.
 * Allows partial updates to title, labels, or full file replacement.
 * At least one update field must be provided.
 */
export const skillEditRequestSchema = z
  .object({
    /** Target artifact to edit */
    artifactId: entityIdSchema,
    /** New title (optional) */
    title: z.string().min(1).max(280).optional(),
    /** New labels (optional) */
    labels: z.array(labelSchema).min(1).optional(),
    /** Full file replacement (optional) */
    files: z.array(bundleFilePayloadSchema).min(1).optional(),
    /** Script descriptors for executable scripts */
    scriptDescriptors: z.array(bundleScriptDescriptorSchema).default([]),
  })
  .refine(
    (data) => data.title !== undefined || data.labels !== undefined || data.files !== undefined,
    {
      message: 'At least one of title, labels, or files must be provided',
    },
  );

/**
 * Skill edit response schema.
 * Returns updated artifact with revision tracking.
 */
export const skillEditResponseSchema = z
  .object({
    /** Updated artifact with new revision */
    artifact: skillArtifactSchema,
    /** Revision number before this edit */
    previousRevision: z.number().int().min(1),
    /** Lifecycle state transition if applicable */
    lifecycleTransition: z
      .object({
        from: lifecycleStateSchema,
        to: lifecycleStateSchema,
      })
      .optional(),
  })
  .strict();

/**
 * Skill revision summary schema.
 * Lightweight view of a revision without full file manifests.
 * Used in history listing to avoid over-exposing artifact content.
 */
export const skillRevisionSummarySchema = z.object({
  /** Revision number */
  revision: z.number().int().min(1),
  /** When this revision was submitted */
  submittedAt: isoTimestampSchema,
  /** Who submitted this revision */
  submittedBy: actorRefSchema,
  /** Brief description of changes (optional) */
  summary: z.string().max(500).optional(),
  /** Lifecycle state after this revision */
  lifecycleState: lifecycleStateSchema,
});

/**
 * Skill history request schema.
 * Requests revision history for a specific artifact.
 */
export const skillHistoryRequestSchema = z.object({
  /** Target artifact to view history for */
  artifactId: entityIdSchema,
});

/**
 * Skill history response schema.
 * Returns revision summaries without full file manifests.
 * Distinct from artifact export - metadata-only for history viewing.
 */
export const skillHistoryResponseSchema = z
  .object({
    /** Artifact identifier */
    artifactId: entityIdSchema,
    /** Artifact title */
    title: z.string().min(1).max(280),
    /** Current (latest) revision number */
    currentRevision: z.number().int().min(1),
    /** Current lifecycle state */
    lifecycleState: lifecycleStateSchema,
    /** Revision history summaries */
    revisions: z.array(skillRevisionSummarySchema),
  })
  .strict();

export type SkillEditRequest = z.infer<typeof skillEditRequestSchema>;
export type SkillEditResponse = z.infer<typeof skillEditResponseSchema>;
export type SkillRevisionSummary = z.infer<typeof skillRevisionSummarySchema>;
export type SkillHistoryRequest = z.infer<typeof skillHistoryRequestSchema>;
export type SkillHistoryResponse = z.infer<typeof skillHistoryResponseSchema>;

// ============================================================================
// Phase 20: Skill Review Contracts (SKED-03)
// ============================================================================

/**
 * Skill review queue item schema.
 * Represents a single artifact pending review.
 */
export const skillReviewQueueItemSchema = z.object({
  /** The artifact with pending review */
  artifact: skillArtifactSchema,
  /** The revision under review */
  revision: z.number().int().min(1),
  /** Agent review result */
  agentReview: agentReviewResultSchema.nullable(),
  /** Who submitted this revision */
  submittedBy: actorRefSchema,
  /** Previous review decision if any */
  lastDecision: reviewDecisionSchema.nullable(),
});

/**
 * Skill review queue response schema.
 * Lists artifacts pending review.
 */
export const skillReviewQueueResponseSchema = z
  .object({
    /** Queue items */
    items: z.array(skillReviewQueueItemSchema),
    /** Pagination cursor */
    nextCursor: z.string().nullable(),
    /** Total count */
    total: z.number().int().min(0),
  })
  .refine((d) => d.items.length <= d.total, {
    message: 'items.length must be <= total',
  });

/**
 * Skill review decision request schema.
 * Used to submit approve/reject decisions.
 */
export const skillReviewDecisionRequestSchema = z.object({
  /** The artifact to review */
  artifactId: entityIdSchema,
  /** The review decision */
  decision: z.enum(['approve', 'reject']),
  /** Reviewer notes (required, 1-2000 characters) */
  notes: z
    .string()
    .min(1)
    .refine((s) => [...s].length <= 2000, {
      message: 'notes must be at most 2000 Unicode characters',
    }),
});

/**
 * Skill review decision response schema.
 * Returns the updated artifact and state transition.
 */
export const skillReviewDecisionResponseSchema = z
  .object({
    /** The updated artifact */
    artifact: skillArtifactSchema,
    /** Lifecycle state before review */
    previousState: lifecycleStateSchema,
    /** Lifecycle state after review */
    newState: lifecycleStateSchema,
  })
  .strict();

export type SkillReviewQueueItem = z.infer<typeof skillReviewQueueItemSchema>;
export type SkillReviewQueueResponse = z.infer<typeof skillReviewQueueResponseSchema>;
export type SkillReviewDecisionRequest = z.infer<typeof skillReviewDecisionRequestSchema>;
export type SkillReviewDecisionResponse = z.infer<typeof skillReviewDecisionResponseSchema>;

// =============================================================================
// Phase 36: Artifact Deactivation Contracts (P36-02)
// =============================================================================

/**
 * Artifact deactivation request schema.
 * Used to deactivate an approved skill artifact.
 */
export const artifactDeactivateRequestSchema = z.object({
  /** Reason for deactivation (required) */
  reason: z.string().min(1).max(500),
});

/**
 * Artifact deactivation response schema.
 * Returns the updated artifact with deactivated lifecycle state.
 */
export const artifactDeactivateResponseSchema = z
  .object({
    /** The updated artifact */
    artifact: skillArtifactSchema,
    /** Lifecycle state before deactivation */
    previousState: lifecycleStateSchema,
    /** Lifecycle state after deactivation (always 'deactivated') */
    newState: lifecycleStateSchema,
  })
  .strict();

export type ArtifactDeactivateRequest = z.infer<typeof artifactDeactivateRequestSchema>;
export type ArtifactDeactivateResponse = z.infer<typeof artifactDeactivateResponseSchema>;

// =============================================================================
// Phase 89: Usage Analytics Contracts
// =============================================================================

/**
 * Entry type for usage analytics.
 */
export const statsEntryTypeSchema = z.enum(['skill', 'trap', 'knowledge']);

/**
 * Granularity for time-series aggregation.
 */
export const statsGranularitySchema = z.enum(['hour', 'day', 'week', 'month']);

/**
 * Usage time-series query schema.
 * Request usage counts aggregated by time bucket.
 */
export const statsUsageQuerySchema = z.object({
  teamId: entityIdSchema.optional(),
  accountId: entityIdSchema.optional(),
  from: isoTimestampSchema,
  to: isoTimestampSchema,
  granularity: statsGranularitySchema.default('day'),
});

/**
 * Usage time-series item schema.
 * Single time bucket with event count.
 */
export const statsUsageItemSchema = z.object({
  period: z.string().min(1),
  count: z.number().int().min(0),
});

/**
 * Usage time-series response schema.
 */
export const statsUsageResponseSchema = z
  .object({
    items: z.array(statsUsageItemSchema),
  })
  .strict();

/**
 * Hit ranking query schema.
 * Request top N entries by hit count.
 */
export const statsHitRankingQuerySchema = z.object({
  teamId: entityIdSchema.optional(),
  entryType: statsEntryTypeSchema.optional(),
  from: isoTimestampSchema.optional(),
  to: isoTimestampSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

/**
 * Hit ranking item schema.
 * Single entry with hit count.
 */
export const statsHitRankingItemSchema = z.object({
  entryId: entityIdSchema,
  entryType: statsEntryTypeSchema,
  count: z.number().int().min(0),
});

/**
 * Hit ranking response schema.
 */
export const statsHitRankingResponseSchema = z
  .object({
    items: z.array(statsHitRankingItemSchema),
  })
  .strict();

/**
 * System summary query schema.
 * Request system-wide statistics.
 */
export const statsSummaryQuerySchema = z
  .object({
    from: isoTimestampSchema.optional(),
    to: isoTimestampSchema.optional(),
  })
  .refine((d) => d.from == null || d.to == null || d.from <= d.to, {
    message: 'from must be on or before to',
  });

/**
 * System summary response schema.
 * Aggregate statistics across the system.
 */
export const statsSummaryResponseSchema = z
  .object({
    totalEvents: z.number().int().min(0),
    uniqueQueries: z.number().int().min(0),
    uniqueTeams: z.number().int().min(0),
    uniqueAccounts: z.number().int().min(0),
    asyncArchitecture: z
      .object({
        queueBacklogByType: z.record(z.string(), z.number().int().min(0)),
        deadLetterByType: z.record(z.string(), z.number().int().min(0)),
        retryRateByType: z.record(z.string(), z.number().min(0)),
        avgHandlerLatencyMsByType: z.record(z.string(), z.number().min(0)),
        cacheHitRateByNamespace: z.record(z.string(), z.number().min(0).max(1)),
        cacheInvalidationByNamespace: z.record(z.string(), z.number().int().min(0)),
        cachePendingInvalidationByNamespace: z.record(z.string(), z.boolean()),
        badcaseExportCount: z.number().int().min(0),
        retrievalFailureDistribution: z.record(z.string(), z.number().int().min(0)),
        thresholds: z.array(architectureDecisionThresholdSchema),
      })
      .strict(),
  })
  .strict();

export type StatsEntryType = z.infer<typeof statsEntryTypeSchema>;
export type StatsGranularity = z.infer<typeof statsGranularitySchema>;
export type StatsUsageQuery = z.infer<typeof statsUsageQuerySchema>;
export type StatsUsageItem = z.infer<typeof statsUsageItemSchema>;
export type StatsUsageResponse = z.infer<typeof statsUsageResponseSchema>;
export type StatsHitRankingQuery = z.infer<typeof statsHitRankingQuerySchema>;
export type StatsHitRankingItem = z.infer<typeof statsHitRankingItemSchema>;
export type StatsHitRankingResponse = z.infer<typeof statsHitRankingResponseSchema>;
export type StatsSummaryQuery = z.infer<typeof statsSummaryQuerySchema>;
export type StatsSummaryResponse = z.infer<typeof statsSummaryResponseSchema>;
export type BadcaseEvalDraft = z.infer<typeof badcaseEvalDraftSchema>;
export type BadcaseExportResponse = z.infer<typeof badcaseExportResponseSchema>;
