import type { EvidenceMeta, EvidenceLevel, EvidenceSourceType } from '@trapmap/contracts';
import { evidenceLevelSchema, evidenceMetaSchema, evidenceSourceTypeSchema } from '@trapmap/contracts';

import type { ActorRef } from '@trapmap/contracts';

/**
 * Default evidence level when not explicitly provided.
 */
export const DEFAULT_EVIDENCE_LEVEL: EvidenceLevel = 'anecdotal';

/**
 * Default source type when not explicitly provided.
 */
export const DEFAULT_SOURCE_TYPE: EvidenceSourceType = 'internal-experience';

/**
 * Create default evidence metadata for an approval.
 * Used when reviewer approves without providing explicit evidence.
 */
export function createDefaultEvidenceMeta(
  verifiedAt: string,
  verifiedBy: ActorRef,
): EvidenceMeta {
  return {
    sourceType: DEFAULT_SOURCE_TYPE,
    evidenceLevel: DEFAULT_EVIDENCE_LEVEL,
    verifiedAt,
    verifiedBy,
  };
}

/**
 * Validate evidence metadata using zod schema.
 * Returns the validated evidence or throws on validation error.
 */
export function validateEvidence(evidence: unknown): EvidenceMeta {
  return evidenceMetaSchema.parse(evidence);
}

/**
 * Check if evidence level is valid.
 */
export function isValidEvidenceLevel(level: string): level is EvidenceLevel {
  return evidenceLevelSchema.safeParse(level).success;
}

/**
 * Check if source type is valid.
 */
export function isValidSourceType(sourceType: string): sourceType is EvidenceSourceType {
  return evidenceSourceTypeSchema.safeParse(sourceType).success;
}
