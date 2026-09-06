import type { ReviewQueueItem } from '@trapmap/contracts';
import type { ReviewQueueRequest } from '@trapmap/web-panel/shared/enum-types';
import { calculateReviewQueueRiskScore } from '../mappers/review-item-mapper';

type QueueQueryRequest = NonNullable<ReviewQueueRequest>;

type MockReviewQueuePage = {
  filteredTotal: number;
  items: ReviewQueueItem[];
  nextCursor: string | null;
  total: number;
};

function createdAt(item: ReviewQueueItem): string {
  return item.latestSubmission?.submittedAt ?? item.entry.createdAt;
}

function source(item: ReviewQueueItem): string {
  return item.latestSubmission?.id ?? 'knowledge-entry';
}

function matchesRiskLevelForItem(
  item: ReviewQueueItem,
  riskLevel: NonNullable<ReviewQueueRequest['filters']>['riskLevel'],
): boolean {
  const score = calculateReviewQueueRiskScore(item);
  if (riskLevel === 'high') return score >= 8;
  if (riskLevel === 'medium') return score >= 4 && score < 8;
  if (riskLevel === 'low') return score < 4;
  return true;
}

function matchesStatusAndSearch(
  item: ReviewQueueItem,
  filters: Partial<ReviewQueueRequest['filters']>,
): boolean {
  const status = filters.status ?? 'all';
  if (status !== 'all' && item.entry.lifecycleState !== status) return false;

  const search = filters.search?.trim().toLowerCase() ?? '';
  if (search.length === 0) return true;

  return [item.entry.shortcut, item.entry.detail, item.entry.id].some((value) =>
    value.toLowerCase().includes(search),
  );
}

function matchesSourceAndRisk(
  item: ReviewQueueItem,
  filters: Partial<ReviewQueueRequest['filters']>,
): boolean {
  const sourceFilter = filters.source ?? 'all';
  if (sourceFilter !== 'all' && source(item) !== sourceFilter) return false;
  return matchesRiskLevelForItem(item, filters.riskLevel ?? 'all');
}

function matchesFilters(
  item: ReviewQueueItem,
  filters: Partial<ReviewQueueRequest['filters']>,
): boolean {
  return matchesStatusAndSearch(item, filters) && matchesSourceAndRisk(item, filters);
}

export function applyReviewQueueQuery(
  items: readonly ReviewQueueItem[],
  request?: Partial<QueueQueryRequest>,
): MockReviewQueuePage {
  const paging = request?.paging;
  const filtered = items.filter((item) => matchesFilters(item, request?.filters ?? {}));

  const sort = request?.filters?.sort ?? 'highest-risk';
  const sorted = [...filtered].sort((left, right) => {
    if (sort === 'highest-risk') {
      return (
        calculateReviewQueueRiskScore(right) - calculateReviewQueueRiskScore(left) ||
        left.entry.createdAt.localeCompare(right.entry.createdAt) ||
        left.entry.id.localeCompare(right.entry.id)
      );
    }

    const ageComparison =
      createdAt(left).localeCompare(createdAt(right)) ||
      left.entry.id.localeCompare(right.entry.id);
    return sort === 'newest' ? -ageComparison : ageComparison;
  });

  const limit = paging?.limit ?? 25;
  let offset = 0;
  if (paging?.cursor) {
    if (!/^[0-9]{1,128}$/.test(paging.cursor)) {
      throw new Error('Invalid review queue cursor');
    }
    offset = Number.parseInt(paging.cursor, 10);
  }

  return {
    items: sorted.slice(offset, offset + limit),
    filteredTotal: sorted.length,
    nextCursor: offset + limit < sorted.length ? String(offset + limit) : null,
    total: items.length,
  };
}
