import { z } from 'zod';

import {
  skillArtifactFileKindSchema,
  skillArtifactFileSourceSchema,
  skillArtifactSchema,
  skillScriptDescriptorSchema,
} from './artifacts.js';
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
import {
  agentReviewResultSchema,
  knowledgeEntrySchema,
  knowledgeListItemSchema,
  knowledgeSubmissionSchema,
  reviewDecisionSchema,
} from './knowledge.js';
import { canonicalPathSchema } from './path-validation.js';

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
 * Reuses the canonical skillScriptDescriptorSchema from artifacts.
 */
export const bundleScriptDescriptorSchema = skillScriptDescriptorSchema;

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
    eventVersion: z.number().int().positive().optional(),
    sourceService: z.string().min(1).max(128).optional(),
    requestId: entityIdSchema.optional(),
    traceId: z
      .string()
      .regex(/^[0-9a-f]{32}$/)
      .optional(),
    operationId: entityIdSchema.optional(),
    causationId: entityIdSchema.optional(),
    outcome: z.enum(['success', 'rejected', 'failed']).optional(),
  })
  .merge(auditMetadataSchema);

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
export type AuditListResponse = z.infer<typeof auditListResponseSchema>;
export type KnowledgeListResponse = z.infer<typeof knowledgeListResponseSchema>;
export type KnowledgeDeactivateResponse = z.infer<typeof knowledgeDeactivateResponseSchema>;
export type ArtifactExportFormat = z.infer<typeof artifactExportFormatSchema>;
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
export type ActivationResponse = z.infer<typeof activationResponseSchema>;

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
  /** Semver version declared in SKILL.md frontmatter (absent for unversioned skills) */
  version: z
    .string()
    .regex(
      /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/,
    )
    .optional(),
  /** SHA-256 hash of all source files for this revision */
  sourceHash: sha256HexSchema.optional(),
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

export type SkillEditResponse = z.infer<typeof skillEditResponseSchema>;
export type SkillRevisionSummary = z.infer<typeof skillRevisionSummarySchema>;
export type SkillHistoryResponse = z.infer<typeof skillHistoryResponseSchema>;

// ============================================================================
// Phase 20: Skill Review Contracts (SKED-03)
// ============================================================================
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
export type SkillReviewDecisionResponse = z.infer<typeof skillReviewDecisionResponseSchema>;
