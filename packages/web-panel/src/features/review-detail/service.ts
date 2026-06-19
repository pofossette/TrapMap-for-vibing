import type { ReviewDecisionRequest } from '@trapmap/contracts';

import { mapActivityFeed } from '../../services/mappers/activity-event-mapper';
import { buildReviewDetailFiles, mapReviewDetail } from '../../services/mappers/review-item-mapper';
import type {
  AdminPanelApiContract,
  ManualJsonEditInput,
  ReviewDetailViewModel,
} from '../../shared/types/admin-panel';

export async function loadReviewDetail(
  api: AdminPanelApiContract,
  reviewId: string,
): Promise<ReviewDetailViewModel> {
  const response = await api.loadReviewDetail(reviewId);
  const detail = mapReviewDetail(response.entry);

  return {
    ...detail,
    activity: mapActivityFeed(response.activity),
    files: buildReviewDetailFiles(response.entry, response.files),
  };
}

export async function submitReviewDecision(
  api: AdminPanelApiContract,
  input: ReviewDecisionRequest,
): Promise<ReviewDetailViewModel> {
  const response = await api.submitReviewDecision(input);
  return mapReviewDetail(response.entry);
}

export async function saveManualJsonEdit(
  api: AdminPanelApiContract,
  input: ManualJsonEditInput,
): Promise<{ savedAt: string }> {
  return api.saveManualJsonEdit(input);
}
