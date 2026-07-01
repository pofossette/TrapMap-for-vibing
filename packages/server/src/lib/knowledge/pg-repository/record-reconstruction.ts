/**
 * Reconstruct a full KnowledgeRecord from database rows.
 *
 * Combines the entry row with its revisions, lifecycle events,
 * structured labels, boundary sub-tables, and maintenance metadata.
 */

import type { Boundary } from '@trapmap/contracts';
import type { KnowledgeRecord, MaintenanceMetaRecord } from '@trapmap/server/lib/store.js';
import type {
  DrizzleKnowledgeEntryRow,
  DrizzleKnowledgeRevisionRow,
  DrizzleLifecycleEventRow,
} from './row-types.js';
import { rowToKnowledgeEntry, rowToKnowledgeRevision, rowToLifecycleEvent } from './row-mappers.js';

/**
 * Reconstruct a full KnowledgeRecord from database rows.
 * Round 3: Accepts structured labels, boundary, and maintenance meta.
 */
export function reconstructKnowledgeRecord(
  entryRow: DrizzleKnowledgeEntryRow,
  revisionRows: DrizzleKnowledgeRevisionRow[],
  eventRows: DrizzleLifecycleEventRow[],
  structuredLabels: string[],
  boundary: Boundary | null,
  maintenanceMeta: MaintenanceMetaRecord | null,
): KnowledgeRecord {
  const entry = rowToKnowledgeEntry(entryRow);

  // Round 3: Use structured labels from knowledge_labels table
  // Fall back to JSONB labels if structured labels are empty (migration period)
  if (structuredLabels.length > 0 || entryRow.labels.length === 0) {
    entry.labels = structuredLabels;
  }

  // Round 3: Use boundary from sub-tables, fall back to JSONB
  if (boundary !== null) {
    entry.boundary = boundary;
  }

  // Round 3: Use maintenance from structured table, fall back to JSONB
  if (maintenanceMeta !== null) {
    entry.maintenanceMeta = maintenanceMeta;
  }

  // Populate revisions
  const revisions = revisionRows.map(rowToKnowledgeRevision);
  entry.history = revisions;
  if (revisions.length > 0) {
    entry.latestRevision = revisions[revisions.length - 1]!;
  }

  // Populate lifecycle events
  const lifecycleHistory = eventRows.map(rowToLifecycleEvent);
  entry.lifecycleHistory = lifecycleHistory;

  entry.metadata.revisionCount = revisions.length > 0 ? revisions.length : 1;
  entry.metadata.latestSubmittedAt = revisions.at(-1)?.submittedAt ?? entry.createdAt;

  const reviewerEvents = lifecycleHistory.filter(
    (event) => event.type === 'reviewer-approved' || event.type === 'reviewer-rejected',
  );
  const latestReviewerEvent = reviewerEvents.at(-1) ?? null;
  if (latestReviewerEvent) {
    entry.metadata.latestReviewedAt = latestReviewerEvent.createdAt;
    entry.metadata.latestDecision =
      latestReviewerEvent.type === 'reviewer-approved' ? 'approve' : 'reject';
  } else {
    const latestAgentEvent = [...lifecycleHistory]
      .reverse()
      .find((event) => event.type === 'agent-reviewed');
    entry.metadata.latestReviewedAt = latestAgentEvent?.createdAt ?? null;
    entry.metadata.latestDecision = null;
  }

  const submissionIdByRevision = new Map<number, string>();
  for (const event of lifecycleHistory) {
    if (event.submissionId && event.revision !== null) {
      submissionIdByRevision.set(event.revision, event.submissionId);
    }
  }

  entry.submissionHistory = revisions.map((revision, index) => {
    const revisionNo = revision.revision;
    const submissionId =
      submissionIdByRevision.get(revisionNo) ?? `${entry.id}_submission_${revisionNo}`;
    const agentReviewedEvent = lifecycleHistory.find(
      (event) => event.type === 'agent-reviewed' && event.revision === revisionNo,
    );
    const reviewerEvent = lifecycleHistory.find(
      (event) =>
        (event.type === 'reviewer-approved' || event.type === 'reviewer-rejected') &&
        event.revision === revisionNo,
    );
    const submissionLifecycleState =
      reviewerEvent?.state ?? agentReviewedEvent?.state ?? entry.lifecycleState;
    const reviewNotes = revision.reviewNotes;
    const agentNotes = reviewNotes
      .filter((note) => note.authorType === 'agent')
      .map((note) => note.message);

    return {
      id: submissionId,
      revision: revisionNo,
      submittedAt: revision.submittedAt,
      submittedByUserId: revision.submittedByUserId,
      lifecycleState: submissionLifecycleState,
      resubmissionOf: index > 0 ? (entry.submissionHistory[index - 1]?.id ?? null) : null,
      agentReview: agentReviewedEvent
        ? {
            status: agentReviewedEvent.state as 'agent-pass' | 'agent-rejected',
            duplicateRisk: 'low',
            correctnessRisk: 'medium',
            completenessRisk: 'medium',
            checkedAt: agentReviewedEvent.createdAt,
            notes:
              agentNotes.length > 0
                ? agentNotes
                : agentReviewedEvent.note
                  ? [agentReviewedEvent.note]
                  : [],
          }
        : null,
      reviewerDecision: reviewerEvent?.actorUserId
        ? {
            decidedAt: reviewerEvent.createdAt,
            decidedByUserId: reviewerEvent.actorUserId,
            decision: reviewerEvent.type === 'reviewer-approved' ? 'approve' : 'reject',
            notes: reviewerEvent.note ?? '',
          }
        : null,
      reviewNotes,
    };
  });

  entry.latestSubmissionId = entry.submissionHistory.at(-1)?.id ?? null;
  entry.metadata.latestSubmissionId = entry.latestSubmissionId;
  entry.metadata.submissionCount = entry.submissionHistory.length;
  entry.metadata.resubmissionCount = Math.max(0, entry.submissionHistory.length - 1);

  entry.reviewHistory = entry.submissionHistory
    .map((submission) => submission.reviewerDecision)
    .filter((decision): decision is NonNullable<typeof decision> => decision !== null);
  entry.reviewNotes = revisions.flatMap((revision) => revision.reviewNotes);
  entry.agentReview = entry.submissionHistory.at(-1)?.agentReview ?? null;

  return entry;
}
