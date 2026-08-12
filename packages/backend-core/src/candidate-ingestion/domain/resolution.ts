/**
 * Candidate-ingestion bounded context — resolution rules.
 *
 * Pure manual-resolution validation and normalization rules with zero
 * framework / DB / I/O imports. The application layer renders these into
 * InvocationError.validation failures; these functions are the single
 * source of the resolution shape rules.
 */

import type { ManualResultSubmission } from '@trapmap/contracts';

function assertResolutionDecision(decision: unknown): asserts decision is 'independent' | 'merged' {
  if (decision !== 'independent' && decision !== 'merged') {
    throw new Error('Candidate resolution requires decision "independent" or "merged"');
  }
}

function assertResolutionNotes(notes: unknown): asserts notes is string {
  if (typeof notes !== 'string' || notes.trim().length === 0) {
    throw new Error('Candidate resolution requires non-empty notes');
  }
}

interface RawMergedTarget {
  entityType: unknown;
  entityId: unknown;
  entityTitle?: string;
}

function requireMergedTargetFields(mergedWith: unknown): RawMergedTarget {
  if (
    !mergedWith ||
    typeof mergedWith !== 'object' ||
    !('entityType' in mergedWith) ||
    !('entityId' in mergedWith)
  ) {
    throw new Error(
      'Merged candidate resolution requires mergedWith.entityType and mergedWith.entityId',
    );
  }
  const raw: RawMergedTarget = {
    entityType: mergedWith.entityType,
    entityId: mergedWith.entityId,
  };
  if ('entityTitle' in mergedWith && typeof mergedWith.entityTitle === 'string') {
    raw.entityTitle = mergedWith.entityTitle;
  }
  return raw;
}

function requireValidMergedTarget(raw: RawMergedTarget): {
  entityType: 'trap' | 'skill';
  entityId: string;
  entityTitle?: string;
} {
  if ((raw.entityType !== 'trap' && raw.entityType !== 'skill') || typeof raw.entityId !== 'string') {
    throw new Error('Merged candidate resolution requires a valid mergedWith target');
  }
  return {
    entityType: raw.entityType,
    entityId: raw.entityId,
    ...(raw.entityTitle ? { entityTitle: raw.entityTitle } : {}),
  };
}

/**
 * Validate and normalize a raw manual resolution payload.
 * Throws a plain Error (message preserved verbatim by the application
 * layer, which rethrows it as a validation InvocationError).
 */
export function normalizeManualResolution(
  resolution: Record<string, unknown>,
): ManualResultSubmission {
  const decision = resolution.decision;
  const notes = resolution.notes;

  assertResolutionDecision(decision);
  assertResolutionNotes(notes);

  if (decision === 'merged') {
    return {
      decision,
      notes,
      mergedWith: requireValidMergedTarget(requireMergedTargetFields(resolution.mergedWith)),
    };
  }

  return {
    decision,
    notes,
  };
}
