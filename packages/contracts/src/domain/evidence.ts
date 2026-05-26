import { z } from 'zod';

import { actorRefSchema, isoTimestampSchema } from './common.js';

/**
 * Source type vocabulary for knowledge provenance.
 * Intentionally small for v1 - expandable in future phases.
 */
/** @internal Schema not directly imported by server or CLI — type EvidenceSourceType IS used. */
export const evidenceSourceTypeSchema = z.enum([
  'internal-experience', // Team's own experience, not externally documented
  'incident', // Derived from incident postmortem or outage
  'doc', // Official documentation (internal or external)
  'code', // Derived from source code analysis
  'external-reference', // External blog, article, or community knowledge
]);

/**
 * Evidence strength level indicating verification rigor.
 * Higher levels indicate stronger verification.
 */
export const evidenceLevelSchema = z.enum([
  'anecdotal', // Single occurrence, no reproduction
  'reproduced', // Reproduced in controlled environment
  'documented', // Supported by documentation
  'verified-in-prod', // Verified in production environment
]);

/**
 * Minimal evidence and provenance metadata.
 * Captures where knowledge came from and how strongly it was verified.
 */
export const evidenceMetaSchema = z.object({
  /** Type of source where this knowledge originated */
  sourceType: evidenceSourceTypeSchema,
  /** Reference to source (URL, doc ID, incident ID, etc.) */
  sourceRef: z.string().max(500).optional(),
  /** Strength of evidence supporting this knowledge */
  evidenceLevel: evidenceLevelSchema,
  /** When this knowledge was last verified by a human */
  verifiedAt: isoTimestampSchema,
  /** Who verified this knowledge */
  verifiedBy: actorRefSchema,
});

/**
 * Compact evidence hint for retrieval responses.
 * Excludes verbose fields (sourceRef, verifiedBy) for compact payload.
 */
/** @internal Not directly imported by server or CLI. */
export const evidenceHintSchema = z
  .object({
    /** Strength of evidence */
    evidenceLevel: evidenceLevelSchema,
    /** When last verified */
    verifiedAt: isoTimestampSchema,
    /** Type of source */
    sourceType: evidenceSourceTypeSchema,
  })
  .strict();

export type EvidenceSourceType = z.infer<typeof evidenceSourceTypeSchema>;
export type EvidenceLevel = z.infer<typeof evidenceLevelSchema>;
export type EvidenceMeta = z.infer<typeof evidenceMetaSchema>;
/** @internal */
export type EvidenceHint = z.infer<typeof evidenceHintSchema>;
