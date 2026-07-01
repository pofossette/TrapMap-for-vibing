/**
 * Database row type definitions for the candidate PG repository.
 *
 * Drizzle maps snake_case column names to camelCase property names.
 */

import type { AnalysisSnapshot, CandidateSubmission, DuplicateCase } from '@trapmap/contracts';

export interface DrizzleCandidateRow {
  id: string;
  sourceType: string;
  submittedByUserId: string;
  teamId: string | null;
  status: string;
  originalPayload: CandidateSubmission['originalPayload'];
  analysisSnapshot: AnalysisSnapshot | null;
  duplicateCase: DuplicateCase | null;
  receivedAt: Date;
  queuedAt: Date | null;
  analyzingAt: Date | null;
  completedAt: Date | null;
  lastError: string | null;
  retryCount: number;
  manualResult: CandidateSubmission['manualResult'];
  createdAt: Date;
  updatedAt: Date;
}
