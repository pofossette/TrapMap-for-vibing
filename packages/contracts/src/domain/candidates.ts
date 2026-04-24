import { z } from 'zod';

import {
  entityIdSchema,
  isoTimestampSchema,
  labelSchema,
  scopeSchema,
  securityLevelSchema,
} from './common.js';

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
  path: z.string().min(1).max(512),
  /** SHA-256 hash of file content */
  sha256: z.string().length(64),
  /** File size in bytes */
  sizeBytes: z.number().int().min(0),
  /** IANA media type */
  mediaType: z.string().min(1).max(160),
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
  fingerprint: z.string().length(64),
  /** Keywords extracted from content */
  keywords: z.array(z.string().min(1).max(48)),
  /** Tokens extracted from content for similarity matching */
  tokens: z.array(z.string().min(1).max(64)),
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
export const DuplicateCaseSchema = z.object({
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
});

/**
 * Candidate submission record for async ingestion.
 * Preserves original payload and tracks processing status.
 */
export const CandidateSubmissionSchema = z.object({
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
});

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
  files: z.array(z.object({
    path: z.string(),
    content: z.string(), // base64 or text
    mediaType: z.string(),
  })),
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

export const candidateSubmissionResponseSchema = z.object({
  candidateId: entityIdSchema,
  status: CandidateStatusSchema,
  receivedAt: isoTimestampSchema,
});

export const candidateStatusResponseSchema = z.object({
  candidate: CandidateSubmissionSchema,
});

export const candidateListResponseSchema = z.object({
  items: z.array(CandidateSubmissionSchema),
  total: z.number().int().min(0),
});

export const duplicateCaseListResponseSchema = z.object({
  items: z.array(DuplicateCaseSchema),
  total: z.number().int().min(0),
});

export const duplicateCaseResponseSchema = z.object({
  duplicateCase: DuplicateCaseSchema,
});

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
