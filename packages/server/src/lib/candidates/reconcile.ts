/**
 * Resolution orchestration for candidate reconciliation.
 *
 * This module contains the main resolution orchestrator and
 * re-exports all split modules for backward compatibility.
 *
 * @module candidates/reconcile
 */

import type {
  CandidateSubmission,
  ManualResultSubmission,
  ResolutionOutcome,
} from '@trapmap/contracts';
import type { ResolvedAuthContext } from '@trapmap/server/lib/context.js';
import type { LineageRepository } from '@trapmap/server/lib/lineage/index.js';
import type {
  EntityLineageRecord,
  SkillShareerStore,
  StoreData,
} from '@trapmap/server/lib/store.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { markCandidateResolved } from './store.js';

import { getLineageByCandidate } from './lineage.js';
import { recordMergeLineage } from './lineage.js';
import { publishSkillCandidate, publishTrapCandidate } from './publish.js';
import { REVALIDATION_ERRORS, revalidateManualResult } from './validate.js';

// Re-export everything from split modules for backward compatibility
export { revalidateManualResult, REVALIDATION_ERRORS } from './validate.js';
export type { RevalidationResult } from './validate.js';
export { publishTrapCandidate, publishSkillCandidate } from './publish.js';
export {
  recordMergeLineage,
  getLineageByCandidate,
  getLineageByTarget,
  getLineageById,
} from './lineage.js';

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

/**
 * Result of applying a manual resolution.
 */
export interface ApplyResolutionResult {
  success: boolean;
  candidate: CandidateSubmission | undefined;
  outcome: ResolutionOutcome | undefined;
  lineage: EntityLineageRecord | undefined;
  error:
    | {
        code: string;
        message: string;
      }
    | undefined;
}

/**
 * Main orchestrator for applying a manual resolution.
 *
 * Steps:
 * 1. Revalidate the manual result
 * 2. If 'independent': publish as new entity
 * 3. If 'merged': record lineage to existing entity
 * 4. Mark candidate as resolved
 *
 * Idempotent: if already resolved with same decision, returns success without re-processing.
 */
export async function applyManualResultResolution(args: {
  store: SkillShareerStore;
  data: StoreData;
  candidateId: string;
  actor: ResolvedAuthContext;
  lineageRepo: LineageRepository;
}): Promise<ApplyResolutionResult> {
  const resolvedAt = nowIso();
  const resolvedBy = args.actor.user?.id;

  if (!resolvedBy) {
    return {
      success: false,
      error: {
        code: 'user_required',
        message: 'Resolution requires a real user account',
      },
      candidate: undefined,
      outcome: undefined,
      lineage: undefined,
    };
  }

  // Step 1: Revalidate
  const revalidation = revalidateManualResult(args.data, args.candidateId);

  // Handle idempotency - if already resolved, return success
  if (!revalidation.valid && revalidation.error?.code === REVALIDATION_ERRORS.ALREADY_RESOLVED) {
    const candidate = revalidation.candidate!;
    const existingLineage = (await getLineageByCandidate(args.lineageRepo, candidate.id))[0];
    return {
      success: true,
      candidate,
      outcome: {
        candidateId: candidate.id,
        decision: candidate.manualResult!.decision,
        publishedEntityId:
          existingLineage?.relationshipType === 'published_as' ? existingLineage.targetId : null,
        mergedIntoEntityId:
          existingLineage?.relationshipType === 'merged_into' ? existingLineage.targetId : null,
        entityType: existingLineage?.targetType ?? null,
        resolvedAt: candidate.manualResult!.submittedAt,
        resolvedBy: candidate.manualResult!.submittedBy,
        notes: candidate.manualResult!.notes,
      },
      lineage: existingLineage,
      error: undefined,
    };
  }

  if (!revalidation.valid) {
    return {
      success: false,
      error: revalidation.error,
      candidate: undefined,
      outcome: undefined,
      lineage: undefined,
    };
  }

  const candidate = revalidation.candidate!;

  const manualResult = candidate.manualResult!;

  // Step 2 & 3: Apply decision
  let outcome: ResolutionOutcome;
  let lineage: EntityLineageRecord;

  if (manualResult.decision === 'independent') {
    // Publish as new entity
    if (candidate.sourceType === 'trap') {
      const result = publishTrapCandidate({
        store: args.store,
        data: args.data,
        candidate,
        resolvedBy,
        resolvedAt,
      });
      lineage = result.lineage;
      outcome = {
        candidateId: candidate.id,
        decision: 'independent',
        publishedEntityId: result.entry.id,
        mergedIntoEntityId: null,
        entityType: 'trap',
        resolvedAt,
        resolvedBy,
        notes: manualResult.notes,
      };
    } else {
      const result = publishSkillCandidate({
        store: args.store,
        data: args.data,
        candidate,
        resolvedBy,
        resolvedAt,
      });
      lineage = result.lineage;
      outcome = {
        candidateId: candidate.id,
        decision: 'independent',
        publishedEntityId: result.artifact.id,
        mergedIntoEntityId: null,
        entityType: 'skill',
        resolvedAt,
        resolvedBy,
        notes: manualResult.notes,
      };
    }
  } else {
    // Merged decision
    const mergedWith = manualResult.mergedWith!;
    const result = recordMergeLineage({
      store: args.store,
      data: args.data,
      candidate,
      existingEntityId: mergedWith.entityId,
      existingEntityType: mergedWith.entityType,
      resolvedBy,
      resolvedAt,
      notes: manualResult.notes,
    });
    lineage = result.lineage;
    outcome = {
      candidateId: candidate.id,
      decision: 'merged',
      publishedEntityId: null,
      mergedIntoEntityId: mergedWith.entityId,
      entityType: mergedWith.entityType,
      resolvedAt,
      resolvedBy,
      notes: manualResult.notes,
    };
  }

  // Step 4: Mark candidate as resolved
  markCandidateResolved({
    data: args.data,
    candidateId: candidate.id,
    resolvedBy,
  });

  return {
    success: true,
    candidate,
    outcome,
    lineage,
    error: undefined,
  };
}
