/**
 * Row-to-domain mapping functions for the candidate PG repository.
 *
 * Handles Date-to-ISO-string conversion and type casting
 * when reading from the Drizzle ORM layer.
 */

import type { CandidateStatus, CandidateSubmission } from '@trapmap/contracts';

import type { DrizzleCandidateRow } from './row-types.js';

/**
 * Map a Drizzle row to CandidateSubmission shape.
 * Handles Date to ISO string conversion.
 */
export function rowToCandidateSubmission(row: DrizzleCandidateRow): CandidateSubmission {
  return {
    id: row.id,
    sourceType: row.sourceType as 'trap' | 'skill',
    submittedBy: row.submittedByUserId,
    teamId: row.teamId,
    status: row.status as CandidateStatus,
    originalPayload: row.originalPayload,
    analysisSnapshot: row.analysisSnapshot,
    duplicateCase: row.duplicateCase,
    receivedAt: row.receivedAt.toISOString(),
    queuedAt: row.queuedAt?.toISOString() ?? null,
    analyzingAt: row.analyzingAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    lastError: row.lastError,
    retryCount: row.retryCount,
    manualResult: row.manualResult,
  };
}
