/**
 * Internal types for the candidates module.
 * Used for fingerprint computation and duplicate detection.
 */

import type { AnalysisSnapshot, DuplicateCase } from '@trapmap/contracts';
import type {
  DerivedSkillProfileRecord,
  KnowledgeRecord,
  SkillArtifactRecord,
} from '@trapmap/server/lib/store.js';

/**
 * Input shape for computing candidate fingerprints.
 * Contains trap or skill payload depending on source type.
 */
export interface CandidateFingerprintInput {
  sourceType: 'trap' | 'skill';
  trapPayload?: {
    shortcut: string;
    detail: string;
    labels: string[];
  };
  skillPayload?: {
    profile: DerivedSkillProfileRecord | null;
    files: Array<{ path: string; sha256: string }>;
  };
}

/**
 * Input for duplicate detection operation.
 * Contains candidate data and existing corpus for comparison.
 */
export interface DuplicateDetectionInput {
  candidateId: string;
  candidateFingerprint: string;
  candidateKeywords: string[];
  candidateTokens: string[];
  trapEntries: KnowledgeRecord[];
  skillArtifacts: SkillArtifactRecord[];
  threshold: number;
}

/**
 * Output from duplicate detection operation.
 * Contains duplicate case if matches found, plus analysis snapshot.
 */
export interface DuplicateDetectionResult {
  duplicateCase: DuplicateCase | null;
  analysisSnapshot: AnalysisSnapshot;
}
