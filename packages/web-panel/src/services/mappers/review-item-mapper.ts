import type { KnowledgeEntry, ReviewDecision } from '@trapmap/contracts';
import type {
  ActorRefDto,
  ReviewArtifactFile,
  ReviewDetailViewModel,
  ReviewHistoryEntry,
  ReviewItemViewModel,
  ReviewQueueItemDto,
} from '../../shared/types/admin-panel';

function formatActor(actor: ActorRefDto | null | undefined): string | null {
  return actor?.handle ?? null;
}

function calculateRiskScore(item: ReviewQueueItemDto): number {
  const agentReview = item.agentReview;

  if (!agentReview) {
    return 0;
  }

  const getWeight = (risk: string | null | undefined): number => {
    if (risk === 'low') return 1;
    if (risk === 'medium') return 2;
    if (risk === 'high') return 3;
    return 0;
  };

  return (
    getWeight(agentReview.correctnessRisk) +
    getWeight(agentReview.completenessRisk) +
    getWeight(agentReview.duplicateRisk)
  );
}

function riskToneFromScore(score: number): ReviewItemViewModel['riskTone'] {
  if (score >= 8) {
    return 'danger';
  }

  if (score >= 4) {
    return 'warning';
  }

  return 'neutral';
}

function riskLabelFromScore(score: number): string {
  if (score >= 8) {
    return 'High Risk';
  }

  if (score >= 4) {
    return 'Needs Review';
  }

  return 'Low Risk';
}

function mapReviewHistoryItem(item: ReviewDecision): ReviewHistoryEntry {
  return {
    actor: item.decidedBy.handle,
    at: item.decidedAt,
    decision: item.decision,
    notes: item.notes,
  };
}

export function mapReviewQueueItem(item: ReviewQueueItemDto): ReviewItemViewModel {
  const riskScore = calculateRiskScore(item);
  const latestSubmission = item.latestSubmission;

  return {
    id: item.entry.id,
    title: item.entry.shortcut,
    subtitle: item.entry.detail,
    source: latestSubmission?.id ?? 'knowledge-entry',
    status: item.entry.lifecycleState,
    createdAt: latestSubmission?.submittedAt ?? item.entry.createdAt,
    assignedReviewer: formatActor(item.lastDecision?.decidedBy),
    riskScore,
    riskTone: riskToneFromScore(riskScore),
    riskLabel: riskLabelFromScore(riskScore),
  };
}

export function mapReviewDetail(entry: KnowledgeEntry): ReviewDetailViewModel {
  const latestSubmission = entry.latestSubmission;
  const warnings = [
    ...(entry.agentReview?.notes.map((note) => ({ kind: 'agent-note' as const, message: note })) ??
      []),
    ...entry.reviewNotes.map((note) => ({ kind: 'manual-flag' as const, message: note.message })),
  ];

  return {
    id: entry.id,
    title: entry.shortcut,
    summary: entry.detail,
    status: entry.lifecycleState,
    source: latestSubmission?.id ?? 'knowledge-entry',
    createdAt: latestSubmission?.submittedAt ?? entry.createdAt,
    assignedReviewer: entry.reviewHistory.at(-1)?.decidedBy.handle ?? null,
    files: [],
    rawEntry: entry,
    jsonPayload: JSON.stringify(entry, null, 2),
    metadata: [
      { label: 'Scope', value: entry.scope },
      { label: 'Required Level', value: String(entry.requiredLevel) },
      { label: 'Owner', value: entry.owner.handle },
      { label: 'Last Updated', value: entry.updatedAt },
    ],
    warnings,
    reviewHistory: entry.reviewHistory.map(mapReviewHistoryItem),
    activity: [],
  };
}

export function buildReviewDetailFiles(entry: KnowledgeEntry, files: ReviewArtifactFile[]) {
  if (files.length > 0) {
    return files;
  }

  return [
    {
      path: 'entry/review-payload.json',
      name: 'review-payload.json',
      language: 'json' as const,
      lastEditedAt: entry.updatedAt,
      size: JSON.stringify(entry, null, 2).length,
      content: JSON.stringify(entry, null, 2),
    },
  ];
}
