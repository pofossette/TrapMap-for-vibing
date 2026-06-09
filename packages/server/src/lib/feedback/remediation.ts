import type { FeedbackRemediationState } from '@trapmap/contracts';

import type {
  FeedbackQueueRecord,
  KnowledgeRecord,
  SkillArtifactRecord,
} from '@trapmap/server/lib/store.js';

export const FEEDBACK_REMEDIATION_THRESHOLD = 10;

type RemediationStatus = NonNullable<FeedbackQueueRecord['remediationStatus']>;

function toStatus(feedback: FeedbackQueueRecord[]): RemediationStatus {
  const statuses = feedback
    .map((record) => record.remediationStatus)
    .filter((status): status is RemediationStatus => status != null);

  if (statuses.includes('ready-to-reindex')) return 'ready-to-reindex';
  if (statuses.includes('in-remediation')) return 'in-remediation';
  return 'pending-human-review';
}

export function getActiveEntryFeedback(
  feedbackQueue: FeedbackQueueRecord[],
  entryId: string,
): FeedbackQueueRecord[] {
  return feedbackQueue.filter(
    (record) =>
      record.entryId === entryId && (record.status === 'new' || record.status === 'triaged'),
  );
}

export function computeFeedbackRemediationState(
  feedbackQueue: FeedbackQueueRecord[],
  entryId: string,
  threshold = FEEDBACK_REMEDIATION_THRESHOLD,
): FeedbackRemediationState | null {
  const active = getActiveEntryFeedback(feedbackQueue, entryId);
  if (active.length < threshold) {
    return null;
  }

  const ordered = [...active].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  const first = ordered[0]!;
  const latestResolved = [...ordered]
    .map((record) => record.remediationResolvedAt)
    .filter((value): value is string => value != null)
    .sort()
    .at(-1);
  const latestResolver = [...ordered]
    .map((record) => record.remediationResolvedByUserId)
    .filter((value): value is string => value != null)
    .at(-1);

  return {
    status: toStatus(ordered),
    triggeredByFeedbackCount: ordered.length,
    threshold,
    suppressedFromRetrieval: true,
    suppressedFromIndex: true,
    activeFeedbackIds: ordered.map((record) => record.id),
    openedAt: first.remediationOpenedAt ?? first.submittedAt,
    openedByUserId: first.remediationOpenedByUserId ?? null,
    resolvedAt: latestResolved ?? null,
    resolvedByUserId: latestResolver ?? null,
  };
}

export function attachRemediationToKnowledgeEntries(
  entries: KnowledgeRecord[],
  feedbackQueue: FeedbackQueueRecord[],
): KnowledgeRecord[] {
  return entries.map((entry) => {
    const remediation = computeFeedbackRemediationState(feedbackQueue, entry.id);
    return remediation ? { ...entry, remediation } : entry;
  });
}

export function attachRemediationToArtifacts(
  artifacts: SkillArtifactRecord[],
  feedbackQueue: FeedbackQueueRecord[],
): SkillArtifactRecord[] {
  return artifacts.map((artifact) => {
    const remediation = computeFeedbackRemediationState(feedbackQueue, artifact.id);
    return remediation ? { ...artifact, remediation } : artifact;
  });
}

export function isSuppressedByFeedback(
  record: { remediation?: FeedbackRemediationState | null } | null | undefined,
): boolean {
  return (
    record?.remediation?.suppressedFromRetrieval === true ||
    record?.remediation?.suppressedFromIndex === true
  );
}
