import type { KnowledgeEntry, ReviewQueueQuery } from '@trapmap/contracts';

export type ReviewQueueQueryResult = {
  filteredTotal: number;
  items: KnowledgeEntry[];
  nextCursor: string | null;
  total: number;
};

function reviewQueueSource(entry: KnowledgeEntry): string {
  return entry.latestSubmission?.id ?? 'knowledge-entry';
}

function reviewQueueCreatedAt(entry: KnowledgeEntry): string {
  return entry.latestSubmission?.submittedAt ?? entry.createdAt;
}

function matchesSearch(entry: KnowledgeEntry, search: string): boolean {
  const normalizedSearch = search.trim().toLowerCase();
  if (normalizedSearch.length === 0) return true;

  return [entry.shortcut, entry.detail, entry.id].some((value) =>
    value.toLowerCase().includes(normalizedSearch),
  );
}

function matchesStatus(entry: KnowledgeEntry, status: ReviewQueueQuery['status']): boolean {
  return !status || entry.lifecycleState === status;
}

export function calculateReviewQueueRiskScore(agentReview: KnowledgeEntry['agentReview']): number {
  if (!agentReview) return 0;
  const weight = (risk: string): number => {
    if (risk === 'low') return 1;
    if (risk === 'medium') return 2;
    if (risk === 'high') return 3;
    return 0;
  };
  return (
    weight(agentReview.correctnessRisk) +
    weight(agentReview.completenessRisk) +
    weight(agentReview.duplicateRisk)
  );
}

function matchesRiskLevel(
  agentReview: KnowledgeEntry['agentReview'],
  riskLevel: ReviewQueueQuery['riskLevel'],
): boolean {
  if (!riskLevel) return true;

  const score = calculateReviewQueueRiskScore(agentReview);
  if (riskLevel === 'high') return score >= 8;
  if (riskLevel === 'medium') return score >= 4 && score < 8;
  return score < 4;
}

export function decodeReviewQueueOffset(cursor?: string): number {
  if (cursor === undefined) return 0;
  if (!/^[0-9]{1,128}$/.test(cursor)) {
    throw new Error('Invalid review queue cursor');
  }

  return Number.parseInt(cursor, 10);
}

export function applyReviewQueueQuery(
  entries: readonly KnowledgeEntry[],
  query: ReviewQueueQuery,
): ReviewQueueQueryResult {
  const filtered = entries.filter((entry) => {
    if (!matchesStatus(entry, query.status)) return false;
    if (!matchesSearch(entry, query.search ?? '')) return false;
    if (query.source && reviewQueueSource(entry) !== query.source) return false;
    return matchesRiskLevel(entry.agentReview, query.riskLevel);
  });

  const sort = query.sort;
  const sorted = [...filtered].sort((left, right) => {
    if (sort === 'highest-risk') {
      const scoreDifference =
        calculateReviewQueueRiskScore(right.agentReview) -
        calculateReviewQueueRiskScore(left.agentReview);
      if (scoreDifference !== 0) return scoreDifference;
      return left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id);
    }

    const timeComparison =
      reviewQueueCreatedAt(left).localeCompare(reviewQueueCreatedAt(right)) ||
      left.id.localeCompare(right.id);
    if (sort === 'newest') return -timeComparison;
    return timeComparison;
  });

  const offset = decodeReviewQueueOffset(query.cursor);
  return {
    items: sorted.slice(offset, offset + query.limit),
    filteredTotal: sorted.length,
    nextCursor: offset + query.limit < sorted.length ? String(offset + query.limit) : null,
    total: entries.length,
  };
}
