import { z } from 'zod';

import {
  entityIdSchema,
  isoTimestampSchema,
  labelSchema,
  mediaTypeSchema,
  scopeSchema,
  securityLevelSchema,
  sha256HexSchema,
} from './common.js';
import { canonicalPathSchema } from './path-validation.js';

/**
 * Status values for candidate submissions.
 * Tracks progression through the async ingestion pipeline.
 */
export const CandidateStatusSchema = z.enum([
  'received',
  'queued',
  'analyzing',
  'duplicate_detected',
  'ready_for_review',
  'resolved',
  'error',
]);

/**
 * Source type discriminator for candidate submissions.
 * Indicates whether this candidate is a trap (knowledge entry) or skill (artifact).
 */
export const CandidateSourceSchema = z.enum(['trap', 'skill']);

/**
 * Classification of duplicate match confidence.
 * Used to categorize similarity detection results.
 */
export const DuplicateMatchTypeSchema = z.enum(['exact', 'high-overlap', 'semantic-similar']);

/**
 * Payload for trap (knowledge entry) candidate submission.
 * Mirrors KnowledgeSubmission shape for pre-ingest validation.
 */
export const TrapCandidatePayloadSchema = z.object({
  scope: scopeSchema,
  labels: z.array(labelSchema).min(1),
  shortcut: z.string().min(1).max(280),
  detail: z.string().min(1).max(10000),
  requiredLevel: securityLevelSchema.optional(),
});

/**
 * Metadata for a single file within a skill bundle.
 */
export const SkillBundleFileMetadataSchema = z.object({
  /** Canonical path within the skill directory */
  path: canonicalPathSchema,
  /** SHA-256 hash of file content (lowercase hex) */
  sha256: sha256HexSchema,
  /** File size in bytes */
  sizeBytes: z.number().int().min(0),
  /** IANA media type (e.g. application/json, text/plain) */
  mediaType: mediaTypeSchema,
});

/**
 * Metadata for skill bundle submission.
 */
export const SkillBundleMetadataSchema = z.object({
  /** Human-readable title */
  title: z.string().min(1).max(280),
  /** URL-friendly slug */
  slug: z.string().min(1).max(160),
  /** Searchable labels */
  labels: z.array(labelSchema).min(1),
});

/**
 * Payload for skill (artifact) candidate submission.
 * Contains bundle files and metadata for pre-ingest validation.
 */
export const SkillCandidatePayloadSchema = z.object({
  files: z.array(SkillBundleFileMetadataSchema).min(1),
  metadata: SkillBundleMetadataSchema,
});

/**
 * Union payload for candidate submissions.
 * Only one of trap or skill should be present based on sourceType.
 */
export const CandidatePayloadSchema = z.object({
  trap: TrapCandidatePayloadSchema.optional(),
  skill: SkillCandidatePayloadSchema.optional(),
});

/**
 * Analysis snapshot captured during candidate processing.
 * Stores normalized content fingerprint and extracted features.
 */
export const AnalysisSnapshotSchema = z.object({
  /** When normalization was performed */
  normalizedAt: isoTimestampSchema,
  /** SHA-256 hash of normalized content */
  fingerprint: sha256HexSchema,
  /** Keywords extracted from content */
  keywords: z.array(z.string().min(1).max(48)),
  /** Tokens extracted from content for similarity matching */
  tokens: z.array(z.string().min(1).max(64)),
  /** Duplicate-path trace metadata for review/debugging */
  duplicateTrace: z
    .object({
      detector: z.enum(['in-memory', 'postgresql']),
      matchedLane: z.enum(['exact', 'indexed-recall', 'fallback', 'none']),
    })
    .optional(),
});

/**
 * Overlap details between candidate and existing entity.
 * Used to explain duplicate detection results.
 */
export const DuplicateOverlapDetailsSchema = z.object({
  /** Keywords shared between candidate and match */
  sharedKeywords: z.array(z.string().min(1).max(48)),
  /** Tokens shared between candidate and match */
  sharedTokens: z.array(z.string().min(1).max(64)),
  /** Text overlap percentage (0-100) */
  textOverlapPercent: z.number().min(0).max(100),
});

/**
 * A single duplicate match found during analysis.
 * References an existing entity that may be a duplicate.
 */
export const DuplicateMatchSchema = z.object({
  /** Type of the matched entity */
  entityType: z.enum(['trap', 'skill']),
  /** ID of the matched entity */
  entityId: entityIdSchema,
  /** Title of the matched entity for display */
  entityTitle: z.string().min(1).max(280),
  /** Similarity score (0-1, higher = more similar) */
  similarityScore: z.number().min(0).max(1),
  /** Classification of match confidence */
  matchType: DuplicateMatchTypeSchema,
  /** Detailed overlap analysis */
  overlapDetails: DuplicateOverlapDetailsSchema,
});

/**
 * Duplicate case record for manual review.
 * Created when duplicate detection finds potential matches.
 */
export const DuplicateCaseSchema = z
  .object({
    /** Unique case identifier */
    id: entityIdSchema,
    /** ID of the candidate submission this case belongs to */
    candidateId: entityIdSchema,
    /** When duplicates were detected */
    detectedAt: isoTimestampSchema,
    /** Algorithm version used for detection (e.g., "1.0.0") */
    detectionVersion: z.string().min(1),
    /** All matches found, sorted by similarity descending */
    matches: z.array(DuplicateMatchSchema).min(1),
    /** Highest similarity score across all matches */
    highestSimilarity: z.number().min(0).max(1),
    /** True if any match is an exact duplicate */
    hasExactDuplicate: z.boolean(),
    /** Classification of duplicate severity */
    duplicateType: z.enum(['exact', 'semantic', 'none']),
  })
  .refine(
    (d) =>
      d.matches.every(
        (m, i) => i === 0 || (d.matches[i - 1]?.similarityScore ?? 0) >= m.similarityScore,
      ),
    { message: 'matches must be sorted by similarity descending' },
  )
  .refine((d) => d.highestSimilarity === Math.max(...d.matches.map((m) => m.similarityScore)), {
    message: 'highestSimilarity must equal the max similarity across matches',
  })
  .refine((d) => d.hasExactDuplicate === d.matches.some((m) => m.matchType === 'exact'), {
    message: 'hasExactDuplicate must be true iff at least one match has matchType "exact"',
  })
  .refine(
    (d) => {
      if (d.duplicateType === 'exact') return d.hasExactDuplicate === true;
      if (d.duplicateType === 'none') return d.hasExactDuplicate === false;
      return true;
    },
    { message: 'duplicateType must be consistent with hasExactDuplicate' },
  );

/**
 * Candidate submission record for async ingestion.
 * Preserves original payload and tracks processing status.
 */
export const CandidateSubmissionSchema = z
  .object({
    /** Unique submission identifier */
    id: entityIdSchema,
    /** Source type (trap or skill) */
    sourceType: CandidateSourceSchema,
    /** User who submitted this candidate */
    submittedBy: entityIdSchema,
    /** Team ID if team-scoped */
    teamId: entityIdSchema.nullable(),
    /** Current processing status */
    status: CandidateStatusSchema,
    /** Original payload before any transformation */
    originalPayload: CandidatePayloadSchema,
    /** Analysis snapshot (null until analysis completes) */
    analysisSnapshot: AnalysisSnapshotSchema.nullable(),
    /** Duplicate case (null if no duplicates detected) */
    duplicateCase: DuplicateCaseSchema.nullable(),
    /** When the candidate was received */
    receivedAt: isoTimestampSchema,
    /** When the candidate was queued for processing (null if not yet queued) */
    queuedAt: isoTimestampSchema.nullable(),
    /** When analysis started (null if not yet analyzing) */
    analyzingAt: isoTimestampSchema.nullable(),
    /** When processing completed (null if not complete) */
    completedAt: isoTimestampSchema.nullable(),
    /** Last error message (null if no error) */
    lastError: z.string().max(2000).nullable(),
    /** Number of retry attempts */
    retryCount: z.number().int().min(0),
    /** Manual result from reviewer (null if no manual review yet) */
    manualResult: z
      .object({
        decision: z.enum(['independent', 'merged']),
        notes: z.string().min(1).max(1000),
        mergedWith: z
          .object({
            entityType: z.enum(['trap', 'skill']),
            entityId: entityIdSchema,
            entityTitle: z.string().min(1).max(280).optional(),
          })
          .optional(),
        submittedAt: isoTimestampSchema,
        submittedBy: entityIdSchema,
      })
      .nullable(),
  })
  .refine(
    (d) =>
      d.manualResult === null ||
      d.manualResult.decision !== 'merged' ||
      d.manualResult.mergedWith != null,
    { message: 'mergedWith is required when decision is "merged"' },
  );

// Type exports
// Request schemas

export const candidateTrapSubmissionSchema = z.object({
  scope: scopeSchema,
  labels: z.array(labelSchema).min(1),
  shortcut: z.string().min(1).max(280),
  detail: z.string().min(1).max(10000),
  requiredLevel: securityLevelSchema.optional(),
});

export const candidateSkillSubmissionSchema = z.object({
  // Matches artifact import bundle structure
  files: z
    .array(
      z.object({
        path: z.string(),
        content: z.string(), // base64 or text
        mediaType: z.string(),
      }),
    )
    .min(1),
  scope: scopeSchema,
  labels: z.array(labelSchema).min(1),
  requiredLevel: securityLevelSchema.optional(),
});

export const candidateSubmissionRequestSchema = z.discriminatedUnion('sourceType', [
  z.object({
    sourceType: z.literal('trap'),
    payload: candidateTrapSubmissionSchema,
  }),
  z.object({
    sourceType: z.literal('skill'),
    payload: candidateSkillSubmissionSchema,
  }),
]);

// Response schemas

export const candidateSubmissionResponseSchema = z
  .object({
    candidateId: entityIdSchema,
    status: CandidateStatusSchema,
    receivedAt: isoTimestampSchema,
  })
  .strict();

export const candidateStatusResponseSchema = z
  .object({
    candidate: CandidateSubmissionSchema,
  })
  .strict();

export const candidateListResponseSchema = z
  .object({
    items: z.array(CandidateSubmissionSchema),
    total: z.number().int().min(0),
  })
  .strict();

export const duplicateCaseListResponseSchema = z
  .object({
    items: z.array(DuplicateCaseSchema),
    total: z.number().int().min(0),
  })
  .strict();

export const duplicateCaseResponseSchema = z
  .object({
    duplicateCase: DuplicateCaseSchema,
  })
  .strict();

/**
 * Manual resolution decision for a duplicate case.
 * 'independent' means candidate is distinct and should proceed.
 * 'merged' means candidate should be rejected/merged into existing entity.
 */
export const ManualResultDecisionSchema = z.enum(['independent', 'merged']);

/**
 * Reference to the existing entity for merged decisions.
 */
export const MergedWithReferenceSchema = z.object({
  entityType: z.enum(['trap', 'skill']),
  entityId: entityIdSchema,
  entityTitle: z.string().min(1).max(280).optional(),
});

/**
 * Manual result submission from reviewer.
 * Stored on candidate record for Phase 35 processing.
 */
export const ManualResultSubmissionSchema = z.object({
  decision: ManualResultDecisionSchema,
  notes: z.string().min(1).max(1000),
  mergedWith: MergedWithReferenceSchema.optional(),
});

/**
 * Outcome of applying a manual resolution.
 * Captures what action was taken and what entities were affected.
 */
export const ResolutionOutcomeSchema = z
  .object({
    /** The candidate that was resolved */
    candidateId: entityIdSchema,
    /** The decision that was applied */
    decision: ManualResultDecisionSchema,
    /** For 'independent': ID of the newly created entity */
    publishedEntityId: entityIdSchema.nullable(),
    /** For 'merged': ID of the existing entity that absorbed the candidate */
    mergedIntoEntityId: entityIdSchema.nullable(),
    /** Type of the affected entity ('trap' or 'skill') */
    entityType: z.enum(['trap', 'skill']).nullable(),
    /** When the resolution was applied */
    resolvedAt: isoTimestampSchema,
    /** User who applied the resolution */
    resolvedBy: entityIdSchema,
    /** Notes from the manual result */
    notes: z.string(),
  })
  .strict();

/**
 * Lineage relationship record for tracking entity provenance.
 * Links candidates to their final published or merged outcomes.
 */
export const EntityLineageSchema = z.object({
  /** Unique lineage record identifier */
  id: entityIdSchema,
  /** Source candidate ID */
  candidateId: entityIdSchema,
  /** Type of lineage relationship */
  relationshipType: z.enum(['published_as', 'merged_into']),
  /** Source entity type */
  sourceType: z.enum(['candidate', 'trap', 'skill']),
  /** Source entity ID (candidate ID or entity ID) */
  sourceId: entityIdSchema,
  /** Target entity type */
  targetType: z.enum(['trap', 'skill']),
  /** Target entity ID */
  targetId: entityIdSchema,
  /** When this lineage was recorded */
  createdAt: isoTimestampSchema,
  /** Notes explaining the relationship */
  notes: z.string().nullable(),
});

/**
 * Response after applying a manual resolution.
 */
export const applyResolutionResponseSchema = z
  .object({
    candidateId: entityIdSchema,
    status: CandidateStatusSchema,
    outcome: ResolutionOutcomeSchema,
    lineage: EntityLineageSchema.nullable(),
  })
  .refine(
    (d) =>
      d.outcome.decision !== 'independent' ||
      d.lineage === null ||
      d.lineage.relationshipType !== 'merged_into',
    {
      message: 'relationshipType must not be "merged_into" when decision is "independent"',
    },
  );

/**
 * Response after submitting manual result.
 */
export const manualResultResponseSchema = z
  .object({
    candidateId: entityIdSchema,
    decision: ManualResultDecisionSchema,
    reviewedAt: isoTimestampSchema,
    reviewedBy: entityIdSchema,
    nextState: z.enum(['duplicate_detected', 'ready_for_review', 'rejected', 'resolved']),
  })
  .strict();

/**
 * Matched entity data included in bundle for offline review.
 * Contains enough data for reviewer to make merge decision.
 */
export const DuplicateJobMatchEntitySchema = z.object({
  entityType: z.enum(['trap', 'skill']),
  entityId: entityIdSchema,
  title: z.string().min(1).max(280),
  // For traps
  shortcut: z.string().optional(),
  detail: z.string().optional(),
  labels: z.array(labelSchema).optional(),
  scope: scopeSchema.optional(),
  requiredLevel: securityLevelSchema.optional(),
  // For skills - include slug and file metadata
  slug: z.string().optional(),
  files: z.array(SkillBundleFileMetadataSchema).optional(),
});

/**
 * Full match entry in bundle with match metadata and entity data.
 */
export const DuplicateJobMatchEntrySchema = z.object({
  match: DuplicateMatchSchema,
  entity: DuplicateJobMatchEntitySchema,
});

/**
 * Expected result schema reference for manual submission.
 */
export const expectedManualResultDef = z.object({
  description: z.string(),
  fields: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      required: z.boolean(),
      description: z.string(),
    }),
  ),
});

/**
 * Full duplicate job bundle for offline review.
 * Contains all data needed to make and submit a manual decision.
 */
export const DuplicateJobBundleResponseSchema = z
  .object({
    candidate: z.object({
      id: entityIdSchema,
      sourceType: CandidateSourceSchema,
      status: CandidateStatusSchema,
      receivedAt: isoTimestampSchema,
      submittedBy: entityIdSchema,
    }),
    originalPayload: CandidatePayloadSchema,
    analysisSnapshot: AnalysisSnapshotSchema.nullable(),
    matches: z.array(DuplicateJobMatchEntrySchema),
    expectedResultSchema: expectedManualResultDef,
  })
  .strict();

// Type exports

export type CandidateStatus = z.infer<typeof CandidateStatusSchema>;
export type CandidateSource = z.infer<typeof CandidateSourceSchema>;
export type DuplicateMatchType = z.infer<typeof DuplicateMatchTypeSchema>;
export type TrapCandidatePayload = z.infer<typeof TrapCandidatePayloadSchema>;
export type SkillBundleFileMetadata = z.infer<typeof SkillBundleFileMetadataSchema>;
export type SkillBundleMetadata = z.infer<typeof SkillBundleMetadataSchema>;
export type SkillCandidatePayload = z.infer<typeof SkillCandidatePayloadSchema>;
export type CandidatePayload = z.infer<typeof CandidatePayloadSchema>;
export type AnalysisSnapshot = z.infer<typeof AnalysisSnapshotSchema>;
export type DuplicateOverlapDetails = z.infer<typeof DuplicateOverlapDetailsSchema>;
export type DuplicateMatch = z.infer<typeof DuplicateMatchSchema>;
export type DuplicateCase = z.infer<typeof DuplicateCaseSchema>;
export type CandidateSubmission = z.infer<typeof CandidateSubmissionSchema>;
export type CandidateTrapSubmission = z.infer<typeof candidateTrapSubmissionSchema>;
export type CandidateSkillSubmission = z.infer<typeof candidateSkillSubmissionSchema>;
export type CandidateSubmissionRequest = z.infer<typeof candidateSubmissionRequestSchema>;
export type CandidateSubmissionResponse = z.infer<typeof candidateSubmissionResponseSchema>;
export type CandidateStatusResponse = z.infer<typeof candidateStatusResponseSchema>;
export type CandidateListResponse = z.infer<typeof candidateListResponseSchema>;
export type DuplicateCaseListResponse = z.infer<typeof duplicateCaseListResponseSchema>;
export type DuplicateCaseResponse = z.infer<typeof duplicateCaseResponseSchema>;
export type ManualResultDecision = z.infer<typeof ManualResultDecisionSchema>;
export type MergedWithReference = z.infer<typeof MergedWithReferenceSchema>;
export type ManualResultSubmission = z.infer<typeof ManualResultSubmissionSchema>;
export type ResolutionOutcome = z.infer<typeof ResolutionOutcomeSchema>;
export type EntityLineage = z.infer<typeof EntityLineageSchema>;
export type ApplyResolutionResponse = z.infer<typeof applyResolutionResponseSchema>;
export type ManualResultResponse = z.infer<typeof manualResultResponseSchema>;
export type DuplicateJobMatchEntity = z.infer<typeof DuplicateJobMatchEntitySchema>;
export type DuplicateJobMatchEntry = z.infer<typeof DuplicateJobMatchEntrySchema>;
export type ExpectedManualResultSchema = z.infer<typeof expectedManualResultDef>;
export type DuplicateJobBundleResponse = z.infer<typeof DuplicateJobBundleResponseSchema>;
