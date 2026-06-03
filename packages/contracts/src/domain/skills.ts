import { z } from 'zod';

/**
 * Source types for skill evidence provenance.
 * Tracks how a skill was introduced or verified.
 */
export const SkillEvidenceSourceEnum = z.enum([
  'manual', // Manually created by a user
  'import', // Imported from external source
  'candidate_duplicate', // Detected as duplicate during candidate processing
]);

/**
 * Result of applying a skill candidate to the system.
 * Captures success/failure and duplicate detection outcomes.
 */
export const SkillApplyResultSchema = z.object({
  success: z.boolean(),
  skillId: z.string().optional(),
  alreadyPublished: z.boolean().optional(),
  rejection: z
    .object({
      reason: z.string(),
      conflictsWith: z.string().optional(),
    })
    .optional(),
  duplicate: z
    .object({
      existingId: z.string(),
      similarity: z.number(),
    })
    .optional(),
});

/**
 * Schema for skill candidate with duplicate detection fields.
 * Extends the basic skill candidate concept with fingerprinting
 * and duplicate tracking capabilities.
 */
export const SkillCandidateSchema = z.object({
  fingerprint: z.string().optional(),
  duplicateOf: z.string().optional(),
  similarity: z.number().optional(),
});

// Type exports
export type SkillEvidenceSource = z.infer<typeof SkillEvidenceSourceEnum>;
export type SkillApplyResult = z.infer<typeof SkillApplyResultSchema>;
export type SkillCandidate = z.infer<typeof SkillCandidateSchema>;
