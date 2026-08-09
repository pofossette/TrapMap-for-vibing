import type { ReviewDecisionRequest } from '@trapmap/contracts';

import { mapActivityFeed } from '@trapmap/web-panel/services/mappers/activity-event-mapper';
import {
  buildReviewDetailFiles,
  mapReviewDetail,
} from '@trapmap/web-panel/services/mappers/review-item-mapper';
import type {
  AdminPanelApiContract,
  ReviewDetailViewModel,
} from '@trapmap/web-panel/shared/enum-types';

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
