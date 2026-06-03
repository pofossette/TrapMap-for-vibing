/**
 * Shared CLI utilities for skill candidate commands.
 *
 * Provides formatting helpers for:
 * - Candidate table display (find, list)
 * - Apply result display (apply)
 */

import type { ApplyResolutionResponse, CandidateSubmission } from '@trapmap/contracts';
import type { SkillApplyResult } from '@trapmap/contracts';

import { stripNewlines } from './sanitize.js';

/**
 * Format a single candidate row for table display.
 * Used by `skill find` and any other candidate listing commands.
 */
export function formatCandidateRow(candidate: CandidateSubmission): string {
  const fingerprint = candidate.analysisSnapshot?.fingerprint ?? '-';
  const similarity = candidate.duplicateCase?.highestSimilarity;
  const similarityStr = similarity != null ? similarity.toFixed(3) : '-';

  return [
    candidate.id,
    candidate.sourceType,
    candidate.status,
    fingerprint.slice(0, 12),
    similarityStr,
  ].join('\t');
}

/**
 * Format a list of candidates as a text table.
 * Includes a header row.
 */
export function formatCandidateTable(candidates: CandidateSubmission[]): string {
  if (candidates.length === 0) {
    return 'No candidates found';
  }

  const header = 'ID\tSource\tStatus\tFingerprint\tSimilarity';
  const rows = candidates.map(formatCandidateRow);
  return [header, ...rows].join('\n');
}

/**
 * Format a SkillApplyResult for human-readable output.
 * Handles all four outcome types: success, alreadyPublished, rejection, duplicate.
 */
export function formatSkillApplyResult(result: SkillApplyResult): string {
  if (result.success && result.skillId) {
    return `Applied successfully. Skill ID: ${result.skillId}`;
  }

  if (result.alreadyPublished) {
    return 'Candidate is already published.';
  }

  if (result.rejection) {
    const lines = [`Rejection: ${stripNewlines(result.rejection.reason)}`];
    if (result.rejection.conflictsWith) {
      lines.push(`Conflicts with: ${result.rejection.conflictsWith}`);
    }
    return lines.join('\n');
  }

  if (result.duplicate) {
    return [
      `Duplicate detected.`,
      `Existing ID: ${result.duplicate.existingId}`,
      `Similarity: ${(result.duplicate.similarity * 100).toFixed(1)}%`,
    ].join('\n');
  }

  if (result.success) {
    return 'Applied successfully.';
  }

  return 'Apply completed with unknown status.';
}

/**
 * Format an ApplyResolutionResponse for human-readable output.
 * Maps resolution outcomes to display messages.
 */
export function formatApplyResolutionText(response: ApplyResolutionResponse): string {
  const lines = [
    `Candidate: ${response.candidateId}`,
    `Status: ${response.status}`,
    `Decision: ${response.outcome.decision}`,
  ];

  if (response.outcome.decision === 'independent' && response.outcome.publishedEntityId) {
    lines.push(`Published as: ${response.outcome.entityType} (${response.outcome.publishedEntityId})`);
  } else if (response.outcome.decision === 'merged' && response.outcome.mergedIntoEntityId) {
    lines.push(`Merged into: ${response.outcome.entityType} (${response.outcome.mergedIntoEntityId})`);
  }

  if (response.lineage) {
    lines.push(`Lineage ID: ${response.lineage.id}`);
  }

  return lines.join('\n');
}
