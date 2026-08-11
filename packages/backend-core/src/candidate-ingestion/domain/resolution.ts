/**
 * Candidate-ingestion bounded context — resolution rules.
 *
 * Pure manual-resolution validation and normalization rules with zero
 * framework / DB / I/O imports. The application layer renders these into
 * InvocationError.validation failures; these functions are the single
 * source of the resolution shape rules.
 */

import type { ManualResultSubmission } from '@trapmap/contracts';

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
  const mergedWith = resolution.mergedWith;

  if (decision !== 'independent' && decision !== 'merged') {
    throw new Error('Candidate resolution requires decision "independent" or "merged"');
  }

  if (typeof notes !== 'string' || notes.trim().length === 0) {
    throw new Error('Candidate resolution requires non-empty notes');
  }

  if (decision === 'merged') {
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

    const entityType = mergedWith.entityType;
    const entityId = mergedWith.entityId;
    const entityTitle =
      'entityTitle' in mergedWith && typeof mergedWith.entityTitle === 'string'
        ? mergedWith.entityTitle
        : undefined;

    if ((entityType !== 'trap' && entityType !== 'skill') || typeof entityId !== 'string') {
      throw new Error('Merged candidate resolution requires a valid mergedWith target');
    }

    return {
      decision,
      notes,
      mergedWith: {
        entityType,
        entityId,
        ...(entityTitle ? { entityTitle } : {}),
      },
    };
  }

  return {
    decision,
    notes,
  };
}
