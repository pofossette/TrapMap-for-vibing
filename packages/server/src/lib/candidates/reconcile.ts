import type { CandidateSubmission, ManualResultSubmission } from '@trapmap/contracts';
import type { StoreData, KnowledgeRecord, SkillArtifactRecord } from '../store.js';
import { getCandidateById } from './store.js';

/**
 * Validation result for a manual result before resolution.
 */
export interface RevalidationResult {
  valid: boolean;
  error?: {
    code: string;
    message: string;
  };
  candidate?: CandidateSubmission;
  existingTrap?: KnowledgeRecord;
  existingSkill?: SkillArtifactRecord;
}

/**
 * Error codes for revalidation failures.
 */
export const REVALIDATION_ERRORS = {
  CANDIDATE_NOT_FOUND: 'candidate_not_found',
  INVALID_STATUS: 'invalid_candidate_status',
  NO_MANUAL_RESULT: 'no_manual_result',
  MERGE_TARGET_NOT_FOUND: 'merge_target_not_found',
  MERGE_TARGET_INCOMPATIBLE: 'merge_target_incompatible',
  ALREADY_RESOLVED: 'already_resolved',
} as const;

/**
 * Revalidate a manual result before applying resolution.
 *
 * Checks:
 * 1. Candidate exists
 * 2. Candidate is in 'duplicate_detected' status
 * 3. Manual result is attached
 * 4. For 'merged' decision: target entity exists and is not deactivated
 *
 * @param data - Store data snapshot
 * @param candidateId - ID of the candidate to validate
 * @returns RevalidationResult with validation status and any error details
 */
export function revalidateManualResult(
  data: StoreData,
  candidateId: string,
): RevalidationResult {
  // 1. Check candidate exists
  const candidate = getCandidateById(data, candidateId);
  if (!candidate) {
    return {
      valid: false,
      error: {
        code: REVALIDATION_ERRORS.CANDIDATE_NOT_FOUND,
        message: `Candidate ${candidateId} not found`,
      },
    };
  }

  // 2. Check candidate is not already resolved
  if (candidate.status === 'resolved') {
    return {
      valid: false,
      error: {
        code: REVALIDATION_ERRORS.ALREADY_RESOLVED,
        message: `Candidate ${candidateId} is already resolved`,
      },
      candidate,
    };
  }

  // 3. Check candidate is in duplicate_detected status
  if (candidate.status !== 'duplicate_detected') {
    return {
      valid: false,
      error: {
        code: REVALIDATION_ERRORS.INVALID_STATUS,
        message: `Candidate ${candidateId} is not in duplicate_detected status (current: ${candidate.status})`,
      },
      candidate,
    };
  }

  // 4. Check manual result is attached
  if (!candidate.manualResult) {
    return {
      valid: false,
      error: {
        code: REVALIDATION_ERRORS.NO_MANUAL_RESULT,
        message: `Candidate ${candidateId} has no manual result attached`,
      },
      candidate,
    };
  }

  // 5. For merged decision, verify target entity exists and is compatible
  if (candidate.manualResult.decision === 'merged' && candidate.manualResult.mergedWith) {
    const { entityType, entityId } = candidate.manualResult.mergedWith;

    if (entityType === 'trap') {
      const existingTrap = data.knowledgeEntries.find(e => e.id === entityId);
      if (!existingTrap) {
        return {
          valid: false,
          error: {
            code: REVALIDATION_ERRORS.MERGE_TARGET_NOT_FOUND,
            message: `Merge target trap ${entityId} not found`,
          },
          candidate,
        };
      }
      if (existingTrap.lifecycleState === 'deactivated') {
        return {
          valid: false,
          error: {
            code: REVALIDATION_ERRORS.MERGE_TARGET_INCOMPATIBLE,
            message: `Merge target trap ${entityId} is deactivated`,
          },
          candidate,
          existingTrap,
        };
      }
      return { valid: true, candidate, existingTrap };
    }

    if (entityType === 'skill') {
      const existingSkill = data.skillArtifacts.find(a => a.id === entityId);
      if (!existingSkill) {
        return {
          valid: false,
          error: {
            code: REVALIDATION_ERRORS.MERGE_TARGET_NOT_FOUND,
            message: `Merge target skill ${entityId} not found`,
          },
          candidate,
        };
      }
      if (existingSkill.lifecycleState === 'deactivated') {
        return {
          valid: false,
          error: {
            code: REVALIDATION_ERRORS.MERGE_TARGET_INCOMPATIBLE,
            message: `Merge target skill ${entityId} is deactivated`,
          },
          candidate,
          existingSkill,
        };
      }
      return { valid: true, candidate, existingSkill };
    }
  }

  return { valid: true, candidate };
}

/**
 * Check if a candidate can be idempotently resolved.
 * Returns true if already resolved with a matching manual result.
 */
export function isAlreadyResolved(
  candidate: CandidateSubmission,
  manualResult: ManualResultSubmission,
): boolean {
  if (candidate.status !== 'resolved') {
    return false;
  }

  // If already resolved, check if the manual result matches
  if (candidate.manualResult) {
    return (
      candidate.manualResult.decision === manualResult.decision &&
      candidate.manualResult.notes === manualResult.notes
    );
  }

  return false;
}
