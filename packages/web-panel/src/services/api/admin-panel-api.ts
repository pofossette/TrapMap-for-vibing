import type {
  ReviewDecisionRequest,
  ReviewQueueQuery,
  ReviewQueueResponse,
} from '@trapmap/contracts';

import type {
  ActivityFeedQuery,
  ActivityFeedResponse,
  AdminPanelApiContract,
  AdminPanelSession,
  ManualJsonEditInput,
  ReviewDetailResponse,
  ReviewQueueRequest,
  RuntimeOverviewResponse,
} from '../../shared/types/admin-panel';
import type { HttpClient } from './http-client';

function buildReviewQueueQuery(request?: Partial<ReviewQueueRequest>): string {
  const query = new URLSearchParams();
  const filters = request?.filters;
  const paging = request?.paging;

  if (filters?.status && filters.status !== 'all') {
    query.set('status', filters.status);
  }

  if (paging?.cursor) {
    query.set('cursor', paging.cursor);
  }

  if (paging?.limit) {
    query.set('limit', String(paging.limit));
  }

  const serialized = query.toString();
  return serialized.length > 0 ? `?${serialized}` : '';
}

function buildActivityQuery(query?: ActivityFeedQuery): string {
  const params = new URLSearchParams();

  if (query?.actor) {
    params.set('actor', query.actor);
  }

  if (query?.type) {
    params.set('type', query.type);
  }

  if (query?.limit) {
    params.set('limit', String(query.limit));
  }

  const serialized = params.toString();
  return serialized.length > 0 ? `?${serialized}` : '';
}

export function createAdminPanelApi(client: HttpClient): AdminPanelApiContract {
  return {
    loadSession() {
      return client.request<AdminPanelSession>({
        path: '/v1/auth/session',
      });
    },

    switchSessionAccount(accountId) {
      return client.request<AdminPanelSession>({
        path: '/v1/auth/session/switch',
        method: 'POST',
        body: { accountId },
      });
    },

    loadRuntimeOverview() {
      return client.request<RuntimeOverviewResponse>({
        path: '/api/admin/runtime-overview',
      });
    },

    loadPendingReviews(request) {
      return client.request<ReviewQueueResponse>({
        path: `/v1/knowledge/review-queue${buildReviewQueueQuery(request)}`,
      });
    },

    loadReviewDetail(reviewId) {
      return client.request<ReviewDetailResponse>({
        path: `/api/admin/reviews/${reviewId}`,
      });
    },

    submitReviewDecision(input: ReviewDecisionRequest) {
      return client.request<{ entry: ReviewDetailResponse['entry'] }>({
        path: '/v1/knowledge/review',
        method: 'POST',
        body: input,
      });
    },

    saveManualJsonEdit(input: ManualJsonEditInput) {
      return client.request<{ savedAt: string }>({
        path: `/api/admin/reviews/${input.reviewId}/json-edits`,
        method: 'POST',
        body: input,
      });
    },

    loadActivityFeed(query?: ActivityFeedQuery) {
      return client.request<ActivityFeedResponse>({
        path: `/api/admin/activity${buildActivityQuery(query)}`,
      });
    },
  };
}

export function buildReviewQueueRequest(
  request?: Partial<ReviewQueueRequest>,
): Partial<ReviewQueueQuery> {
  if (!request) {
    return {};
  }

  const query: Partial<ReviewQueueQuery> = {};

  if (request.paging?.cursor !== undefined) {
    query.cursor = request.paging.cursor;
  }
  if (request.paging?.limit !== undefined) {
    query.limit = request.paging.limit;
  }

  const status = request.filters?.status === 'all' ? undefined : request.filters?.status;
  if (status !== undefined) {
    query.status = status;
  }

  return query;
}
