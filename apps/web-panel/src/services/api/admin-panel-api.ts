import {
  type ReviewDecisionRequest,
  type ReviewQueueResponse,
  type SkillArtifact,
  adminActivityQuerySchema,
  adminArtifactQuerySchema,
  adminGraphQuerySchema,
  adminReviewQueueQuerySchema,
} from '@trapmap/contracts';

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
  const raw: Record<string, unknown> = {};
  const filters = request?.filters;
  const paging = request?.paging;

  if (filters?.status && filters.status !== 'all') {
    raw.status = filters.status;
  }
  if (filters?.search?.trim()) {
    raw.search = filters.search.trim();
  }
  if (filters?.source && filters.source !== 'all') {
    raw.source = filters.source;
  }
  if (filters?.riskLevel && filters.riskLevel !== 'all') {
    raw.riskLevel = filters.riskLevel;
  }
  if (filters?.sort) {
    raw.sort = filters.sort;
  }
  if (paging?.cursor) {
    raw.cursor = paging.cursor;
  }
  if (paging?.limit) {
    raw.limit = paging.limit;
  }

  // Validate through T2 shared schema so that defaults/coercion are applied consistently
  // with the server. Unknown keys are stripped by the strict schema validation on the
  // server; here we just parse to catch malformed cursors early and to reuse the same
  // vocabulary as the backend.
  const parsed = adminReviewQueueQuerySchema.safeParse(raw);
  const source = parsed.success ? (parsed.data as Record<string, unknown>) : raw;

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null) continue;
    const normalized = typeof value === 'string' ? value.trim() : value;
    if (normalized === '' || normalized === 'all') continue;
    // Skip defaults that the server already applies to avoid noisy URLs
    query.set(key, String(normalized));
  }

  const serialized = query.toString();
  return serialized.length > 0 ? `?${serialized}` : '';
}

function buildActivityQuery(query?: ActivityFeedQuery): string {
  const raw: Record<string, unknown> = { ...(query ?? {}) };
  // Trim string fields so that Zod's trimmed constraints match the wire format
  for (const key of ['actor', 'search', 'type'] as const) {
    if (typeof raw[key] === 'string') {
      raw[key] = (raw[key] as string).trim();
      if ((raw[key] as string) === '') delete raw[key];
    }
  }
  const parsed = adminActivityQuerySchema.safeParse(raw);
  const source = parsed.success ? (parsed.data as Record<string, unknown>) : raw;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(source)) {
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
  const raw: Record<string, unknown> = {};
  if (query?.cursor) raw.cursor = query.cursor;
  if (query?.lifecycleState && query.lifecycleState !== 'all') {
    raw.lifecycleState = query.lifecycleState;
  }
  if (query?.limit) raw.limit = query.limit;
  if (query?.scope && query.scope !== 'all') raw.scope = query.scope;
  if (query?.requiredLevel !== undefined) raw.requiredLevel = query.requiredLevel;
  if (query?.search?.trim()) raw.search = query.search.trim();

  const parsed = adminArtifactQuerySchema.safeParse(raw);
  const source = parsed.success ? (parsed.data as Record<string, unknown>) : raw;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null) continue;
    const normalized = typeof value === 'string' ? value.trim() : value;
    if (normalized === '' || normalized === 'all') continue;
    params.set(key, String(normalized));
  }

  const serialized = params.toString();
  return serialized.length > 0 ? `?${serialized}` : '';
}

function buildGraphQuery(query?: Record<string, unknown>): string {
  if (!query || Object.keys(query).length === 0) return '';
  const raw: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    raw[key] = typeof value === 'string' ? value.trim() : value;
  }
  const parsed = adminGraphQuerySchema.safeParse(raw);
  const source = parsed.success ? (parsed.data as Record<string, unknown>) : raw;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null) continue;
    // Skip schema defaults that would bloat the URL when not explicitly requested
    if (key === 'depth' && value === '1' && !('depth' in (query ?? {}))) continue;
    if (key === 'mode' && value === 'derivation' && !('mode' in (query ?? {}))) continue;
    params.set(key, String(value));
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

    async login(input) {
      const response = await client.request<{
        session?: unknown;
        authenticated?: boolean;
        token?: string | null;
        user?: AdminPanelSession['user'];
        accounts?: AdminPanelSession['accounts'];
        activeAccountId?: string | null;
      }>({
        path: '/v1/auth/login',
        method: 'POST',
        body: { accessKey: input.accessKey },
      });
      // Gateway returns { session: ActiveSession }; map to AdminPanelSession shape for panel.
      // For mock compatibility we normalize via loadSession if response lacks panel shape.
      if (
        response &&
        'accounts' in response &&
        Array.isArray((response as AdminPanelSession).accounts)
      ) {
        return response as AdminPanelSession;
      }
      // Fallback: treat as contracted login then fetch session via gateway
      const session = await client.request<AdminPanelSession>({
        path: '/v1/auth/session',
      });
      return session;
    },

    async logout() {
      await client.request<{ ok: boolean }>({
        path: '/v1/auth/logout',
        method: 'POST',
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
        path: `/api/admin/reviews${buildReviewQueueQuery(request)}`,
      });
    },

    loadReviewDetail(reviewId) {
      return client.request<ReviewDetailResponse>({
        path: `/api/admin/reviews/${reviewId}`,
      });
    },

    submitReviewDecision(input: ReviewDecisionRequest) {
      const { entryId, decision, notes, boundary, evidence } = input as unknown as {
        entryId: string;
        decision: ReviewDecisionRequest['decision'];
        notes: string;
        boundary?: unknown;
        evidence?: unknown;
      };
      const body: Record<string, unknown> = { decision, notes };
      if (boundary !== undefined) body.boundary = boundary;
      if (evidence !== undefined) body.evidence = evidence;
      return client.request<{ entry: ReviewDetailResponse['entry'] }>({
        path: `/api/admin/reviews/${entryId}/decision`,
        method: 'POST',
        body,
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

    loadTrapGraph(query?: Record<string, unknown>) {
      return client.request<GraphDataResponse>({
        path: `/api/admin/graph/traps${buildGraphQuery(query as Record<string, unknown>)}`,
      });
    },

    loadSkillGraph(
      artifactId: string,
      query?: { mode?: 'derivation' | 'semantic' } & Record<string, unknown>,
    ) {
      // Canonical host now exposes GET /api/admin/graph/skills?artifactId=...&mode=...
      // Keep the legacy alias GET /api/admin/graphs/skill/:artifactId working via the same
      // gateway by translating to the canonical query form. This lets the mock remain
      // simple (it still matches the legacy path) while real mode uses the new RouteDefs.
      const merged: Record<string, unknown> = { ...(query ?? {}), artifactId };
      const qs = buildGraphQuery(merged);
      // Prefer canonical plural path; alias still registered in both hosts for
      // backwards compat, but canonical is the T7 contract.
      return client.request<GraphDataResponse>({
        path: `/api/admin/graph/skills${qs}`,
      });
    },
  };
}
