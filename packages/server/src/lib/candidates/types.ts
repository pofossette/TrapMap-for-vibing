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
 *
 * `candidateTitle` and `candidateBody` (Phase 2) carry the normalized
 * title/body text from the candidate submission so the LLM refinement
 * stage can use real text pairs instead of partial keyword fallbacks.
 * They are optional for backward compatibility with existing test
 * fixtures that pre-date the Phase 2 normalization helper.
 */
export interface DuplicateDetectionInput {
  candidateId: string;
  candidateFingerprint: string;
  /** Exact-match lookup key (Phase 1). */
  candidateExactLookupKey?: string;
  candidateKeywords: string[];
  candidateTokens: string[];
  trapEntries: KnowledgeRecord[];
  skillArtifacts: SkillArtifactRecord[];
  threshold: number;
  /** Optional normalized title text (Phase 2). */
  candidateTitle?: string;
  /** Optional normalized body text (Phase 2). */
  candidateBody?: string;
}

/**
 * Output from duplicate detection operation.
 * Contains duplicate case if matches found, plus analysis snapshot.
 */
export interface DuplicateDetectionResult {
  duplicateCase: DuplicateCase | null;
  analysisSnapshot: AnalysisSnapshot;
}

/**
 * Shared normalized duplicate input (Phase 2).
 *
 * Produced by `buildNormalizedDuplicateInput` and consumed by both the
 * in-memory and PostgreSQL duplicate detectors so that trap and skill
 * candidates flow through the same recall/embedding/keyword channels.
 *
 * Field names are frozen by the plan; do not rename.
 */
export interface NormalizedDuplicateInput {
  sourceType: 'trap' | 'skill';
  fingerprint: string;
  titleText: string;
  bodyText: string;
  keywordTerms: string[];
  tokenTerms: string[];
  exactLookupKey: string;
}
