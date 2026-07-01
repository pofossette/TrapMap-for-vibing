/**
 * Compat overlay: merges authoritative PG records with in-memory shadow store data.
 *
 * During the transition from snapshot-based storage to PG, some fields
 * (history, submissions, review notes, etc.) may still live in the compat store.
 * This module provides the merge logic.
 */

import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';

/**
 * Merge an authoritative PG entry with optional shadow data from the compat store.
 * Shadow fields override authoritative ones where they exist.
 */
export function mergeCompatEntry(
  authoritative: KnowledgeRecord,
  shadow: KnowledgeRecord | null,
): KnowledgeRecord {
  if (!shadow) {
    return authoritative;
  }

  return {
    ...authoritative,
    latestRevision: shadow.latestRevision,
    history: shadow.history,
    metadata: shadow.metadata,
    latestSubmissionId: shadow.latestSubmissionId,
    submissionHistory: shadow.submissionHistory,
    agentReview: shadow.agentReview,
    reviewHistory: shadow.reviewHistory,
    reviewNotes: shadow.reviewNotes,
    lifecycleHistory: shadow.lifecycleHistory,
    embeddingCache: shadow.embeddingCache,
    indexState: shadow.indexState,
    boundary: shadow.boundary ?? authoritative.boundary,
    decayMeta: shadow.decayMeta,
    evidenceMeta: shadow.evidenceMeta,
    maintenanceMeta: shadow.maintenanceMeta ?? authoritative.maintenanceMeta,
    ...(shadow.remediation !== undefined
      ? { remediation: shadow.remediation }
      : authoritative.remediation !== undefined
        ? { remediation: authoritative.remediation }
        : {}),
    updatedAt: shadow.updatedAt,
  };
}
