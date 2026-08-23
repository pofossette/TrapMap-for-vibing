import type { ReviewDecisionRequest, ReviewQueueResponse, SkillArtifact } from '@trapmap/contracts';

import type {
  ActivityFeedQuery,
  ActivityFeedResponse,
  AdminPanelApiContract,
  AdminPanelSession,
  ArtifactListResponse,
  ArtifactQuery,
  GraphDataResponse,
  ManualJsonEditInput,
  ReviewDetailResponse,
  ReviewQueueRequest,
  RuntimeOverviewResponse,
} from '@trapmap/web-panel/shared/enum-types';
import type { HttpClient } from './http-client';

function buildReviewQueueQuery(request?: Partial<ReviewQueueRequest>): string {
  const query = new URLSearchParams();
  const filters = request?.filters;
  const paging = request?.paging;

  if (filters?.status && filters.status !== 'all') {
    query.set('status', filters.status);
  }
  if (filters?.search.trim()) {
    query.set('search', filters.search.trim());
  }
  if (filters?.source && filters.source !== 'all') {
    query.set('source', filters.source);
  }
  if (filters?.riskLevel && filters.riskLevel !== 'all') {
    query.set('riskLevel', filters.riskLevel);
  }
  if (filters?.sort) {
    query.set('sort', filters.sort);
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

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null) continue;
    const normalizedValue = typeof value === 'string' ? value.trim() : value;
    if (normalizedValue !== '') {
      params.set(key, String(normalizedValue));
    }
  }

  const serialized = params.toString();
  return serialized.length > 0 ? `?${serialized}` : '';
}

function buildArtifactQuery(query?: ArtifactQuery): string {
  const params = new URLSearchParams();

  if (query?.cursor) params.set('cursor', query.cursor);
  if (query?.lifecycleState && query.lifecycleState !== 'all') {
    params.set('lifecycleState', query.lifecycleState);
  }
  if (query?.limit) params.set('limit', String(query.limit));
  if (query?.scope && query.scope !== 'all') params.set('scope', query.scope);
  if (query?.requiredLevel !== undefined) {
    params.set('requiredLevel', String(query.requiredLevel));
  }
  if (query?.search?.trim()) params.set('search', query.search.trim());

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

    loadArtifacts(query) {
      return client.request<ArtifactListResponse>({
        path: `/api/admin/artifacts${buildArtifactQuery(query)}`,
      });
    },

    loadArtifactDetail(id) {
      return client.request<SkillArtifact>({
        path: `/api/admin/artifacts/${id}`,
      });
    },

    loadTrapGraph() {
      return client.request<GraphDataResponse>({
        path: '/api/admin/graphs/trap',
      });
    },

    loadSkillGraph(artifactId, query) {
      const q = query?.mode ? `?mode=${query.mode}` : '';
      return client.request<GraphDataResponse>({
        path: `/api/admin/graphs/skill/${artifactId}${q}`,
      });
    },
  };
}
