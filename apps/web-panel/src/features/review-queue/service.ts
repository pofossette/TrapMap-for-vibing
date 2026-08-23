import { mapReviewQueueItem } from '@trapmap/web-panel/services/mappers/review-item-mapper';
import type {
  AdminPanelApiContract,
  ReviewQueuePage,
  ReviewQueueRequest,
} from '@trapmap/web-panel/shared/enum-types';

export async function loadPendingReviews(
  api: AdminPanelApiContract,
  request?: Partial<ReviewQueueRequest>,
): Promise<ReviewQueuePage> {
  const response = await api.loadPendingReviews(request);

  return {
    items: response.items.map(mapReviewQueueItem),
    filteredTotal: response.filteredTotal,
    nextCursor: response.nextCursor,
    total: response.total,
  };
}
