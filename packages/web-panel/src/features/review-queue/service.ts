import { mapReviewQueueItem } from '@trapmap/web-panel/services/mappers/review-item-mapper';
import type {
  AdminPanelApiContract,
  ReviewItemViewModel,
  ReviewQueuePage,
  ReviewQueueRequest,
} from '@trapmap/web-panel/shared/types/admin-panel';

function applyClientFilters(
  items: ReviewItemViewModel[],
  request?: Partial<ReviewQueueRequest>,
): ReviewItemViewModel[] {
  const filters = request?.filters;
  const search = filters?.search.trim().toLowerCase() ?? '';
  const source = filters?.source ?? 'all';
  const riskLevel = filters?.riskLevel ?? 'all';

  return items.filter((item) => {
    const matchesSearch =
      search.length === 0 ||
      item.title.toLowerCase().includes(search) ||
      item.subtitle.toLowerCase().includes(search) ||
      item.id.toLowerCase().includes(search);
    const matchesSource = source === 'all' || item.source === source;
    const matchesRisk =
      riskLevel === 'all' ||
      (riskLevel === 'high' && item.riskScore >= 8) ||
      (riskLevel === 'medium' && item.riskScore >= 4 && item.riskScore < 8) ||
      (riskLevel === 'low' && item.riskScore < 4);

    return matchesSearch && matchesSource && matchesRisk;
  });
}

function sortItems(
  items: ReviewItemViewModel[],
  request?: Partial<ReviewQueueRequest>,
): ReviewItemViewModel[] {
  const sort = request?.filters?.sort ?? 'highest-risk';
  const sorted = [...items];

  sorted.sort((left, right) => {
    if (sort === 'highest-risk') {
      return right.riskScore - left.riskScore;
    }

    if (sort === 'oldest' || sort === 'longest-waiting') {
      return left.createdAt.localeCompare(right.createdAt);
    }

    return right.createdAt.localeCompare(left.createdAt);
  });

  return sorted;
}

export async function loadPendingReviews(
  api: AdminPanelApiContract,
  request?: Partial<ReviewQueueRequest>,
): Promise<ReviewQueuePage> {
  const response = await api.loadPendingReviews(request);
  const mapped = response.items.map(mapReviewQueueItem);
  const filtered = applyClientFilters(mapped, request);

  return {
    items: sortItems(filtered, request),
    total: response.total,
  };
}
