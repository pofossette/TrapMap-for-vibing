/**
 * Internal HTTP client for forwarding requests to backend services.
 *
 * This is a thin HTTP client that the gateway uses to delegate
 * requests to internal services. Each service URL comes from the
 * service configuration.
 */

import {
  SpanKind,
  SpanStatusCode,
  context as otelContext,
  propagation,
  trace,
} from '@opentelemetry/api';

import type { InternalServiceUrls } from '@trapmap/host-distributed/config/index.js';
import type { DiscoveryResolver } from './discovery-resolver.js';
import { recordDistributedInternalHopMetric } from './internal-observability.js';

// ---------------------------------------------------------------------------
// HTTP client helper
// ---------------------------------------------------------------------------

interface ServiceResponse {
  status: number;
  body: unknown;
}

export interface InternalRpcEnvelope {
  method: string;
  input: unknown;
}

export interface InternalRequestOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
}

const DEFAULT_INTERNAL_TIMEOUT_MS = 10_000;

function normalizeCanonicalErrorBody(status: number, body: unknown): unknown {
  if (body && typeof body === 'object') {
    const payload = body as Record<string, unknown>;
    if (typeof payload.kind === 'string' && typeof payload.error === 'string') {
      return body;
    }
  }

  const kind =
    status === 400 || status === 422
      ? 'validation'
      : status === 401
        ? 'unauthorized'
        : status === 403
          ? 'forbidden'
          : status === 404
            ? 'not-found'
            : status === 409
              ? 'conflict'
              : status === 504
                ? 'timeout'
                : status === 503
                  ? 'unavailable'
                  : 'internal';

  return {
    error: `Internal service ${kind.replace(/-/g, ' ')}`,
    kind,
  };
}

async function callInternalService(
  url: string,
  method: 'GET' | 'POST' | 'PUT',
  body?: unknown,
  query?: Record<string, string>,
  options?: InternalRequestOptions,
): Promise<ServiceResponse> {
  const startedAt = Date.now();
  const urlObj = new URL(url);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      urlObj.searchParams.set(key, value);
    }
  }

  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? DEFAULT_INTERNAL_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers ?? {}),
  };
  const serviceName = 'gateway';
  const targetService = urlObj.hostname;
  const parentContext = propagation.extract(otelContext.active(), headers);
  const span = trace.getTracer('trapmap-distributed-http').startSpan(
    `${method} ${urlObj.pathname}`,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        'http.request.method': method,
        'url.path': urlObj.pathname,
        'trapmap.service_name': serviceName,
        'trapmap.target_service': targetService,
      },
    },
    parentContext,
  );
  const spanContext = trace.setSpan(parentContext, span);
  propagation.inject(spanContext, headers);

  const init: RequestInit = {
    method,
    headers,
    signal: controller.signal,
  };

  if (body && method !== 'GET') {
    init.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(urlObj.toString(), init);
    const responseBody = await response.json().catch(() => null);
    recordDistributedInternalHopMetric({
      serviceName,
      targetService,
      transport: urlObj.pathname.includes('/rpc/') ? 'rpc' : 'http',
      latencyMs: Date.now() - startedAt,
      statusCode: response.status,
    });
    span.setAttribute('http.response.status_code', response.status);
    if (response.status >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR });
    }
    span.end();

    return {
      status: response.status,
      body:
        response.status >= 200 && response.status < 300
          ? responseBody
          : normalizeCanonicalErrorBody(response.status, responseBody),
    };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      recordDistributedInternalHopMetric({
        serviceName,
        targetService,
        transport: urlObj.pathname.includes('/rpc/') ? 'rpc' : 'http',
        latencyMs: Date.now() - startedAt,
        statusCode: 504,
      });
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'Internal service timeout' });
      span.end();
      return { status: 504, body: { error: 'Internal service timeout', kind: 'timeout' } };
    }
    recordDistributedInternalHopMetric({
      serviceName,
      targetService,
      transport: urlObj.pathname.includes('/rpc/') ? 'rpc' : 'http',
      latencyMs: Date.now() - startedAt,
      statusCode: 503,
    });
    span.setStatus({ code: SpanStatusCode.ERROR, message: 'Internal service unavailable' });
    span.end();
    return {
      status: 503,
      body: { error: 'Internal service unavailable', kind: 'unavailable' },
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Service clients
// ---------------------------------------------------------------------------

export interface InternalServiceClients {
  identityAccess: {
    login(body: { handle: string; password: string }): Promise<ServiceResponse>;
    loginSystemAdmin(body: { systemAdminKey: string }): Promise<ServiceResponse>;
    logout(body: { sessionToken: string }): Promise<ServiceResponse>;
    validateSession(body: { sessionToken: string }): Promise<ServiceResponse>;
    selectTeam(body: { sessionToken: string; teamId: string }): Promise<ServiceResponse>;
    createTeam(body: { name: string; slug: string; actorId: string }): Promise<ServiceResponse>;
    listTeams(userId: string): Promise<ServiceResponse>;
    addMember(body: {
      teamId: string;
      userId: string;
      role: string;
      actorId: string;
    }): Promise<ServiceResponse>;
    updateMember(
      memberId: string,
      body: { updates: Record<string, unknown>; actorId: string },
    ): Promise<ServiceResponse>;
    provisionAccessKey(body: { memberId: string; actorId: string }): Promise<ServiceResponse>;
  };
  knowledgeRead: {
    getById(entryId: string): Promise<ServiceResponse>;
    listMine(userId: string, teamId?: string): Promise<ServiceResponse>;
    search(body: { query: string; teamId?: string; limit?: number }): Promise<ServiceResponse>;
    getProjectionStatus(): Promise<ServiceResponse>;
  };
  knowledgeWrite: {
    submit(
      body: {
        content: string;
        actorId: string;
        title?: string;
        labels?: string[];
        teamId?: string;
      },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    updateEntry(
      entryId: string,
      body: { updates: Record<string, unknown>; actorId: string },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    resubmit(
      entryId: string,
      body: { actorId: string; note?: string },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    supersede(
      entryId: string,
      body: { replacementId: string; actorId: string },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    createTrap(
      body: {
        content: string;
        teamId: string;
        actorId: string;
        title?: string;
      },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    approveReviewDecision(
      body: {
        entryId: string;
        actorId: string;
        note?: string;
        evidence?: Record<string, unknown>;
      },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    rejectReviewDecision(
      body: {
        entryId: string;
        actorId: string;
        note?: string;
        evidence?: Record<string, unknown>;
      },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    applyMaintenanceDecision(
      body: {
        entryId: string;
        actorId: string;
        action: string;
        note?: string;
        evidence?: Record<string, unknown>;
      },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    applyDecayDecision(
      body: {
        entryId: string;
        actorId: string;
        action: string;
        note?: string;
        evidence?: Record<string, unknown>;
      },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    publishCandidateResult(
      body: {
        candidateId: string;
        actorId: string;
        result: Record<string, unknown>;
      },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    invoke(body: InternalRpcEnvelope, options?: InternalRequestOptions): Promise<ServiceResponse>;
    listTraps(teamId: string): Promise<ServiceResponse>;
    getTrap(trapId: string): Promise<ServiceResponse>;
  };
  candidateIngestion: {
    submit(body: { id: string; content: string; submittedBy: string }): Promise<ServiceResponse>;
    getById(candidateId: string): Promise<ServiceResponse>;
    listByStatus(status: string): Promise<ServiceResponse>;
    applyResolution(
      candidateId: string,
      body: { resolution: Record<string, unknown>; actorId: string },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    submitManualResult(
      candidateId: string,
      body: { result: Record<string, unknown>; actorId: string },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    publishCandidateResult(
      candidateId: string,
      body: { result: Record<string, unknown>; actorId: string },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
  };
  review: {
    approve(body: { entryId: string; actorId: string; note?: string }): Promise<ServiceResponse>;
    reject(body: { entryId: string; actorId: string; note?: string }): Promise<ServiceResponse>;
    applyMaintenance(body: {
      entryId: string;
      actorId: string;
      action: string;
      note?: string;
      evidence?: Record<string, unknown>;
    }): Promise<ServiceResponse>;
    applyDecay(body: {
      entryId: string;
      actorId: string;
      action: string;
      note?: string;
      evidence?: Record<string, unknown>;
    }): Promise<ServiceResponse>;
    reviewArtifact(body: {
      artifactId: string;
      decision: 'approve' | 'reject';
      actorId: string;
      note?: string;
    }): Promise<ServiceResponse>;
    submitFeedback(body: {
      entryId: string;
      problemType: string;
      description: string;
      actorId: string;
    }): Promise<ServiceResponse>;
  };
  governanceReview: InternalServiceClients['review'];
  jobRuntime: {
    schedule(body: {
      type: string;
      payload: unknown;
      delayMs?: number;
      priority?: number;
      maxAttempts?: number;
    }): Promise<ServiceResponse>;
    getStatus(jobId: string): Promise<ServiceResponse>;
    getQueueStatus(): Promise<ServiceResponse>;
  };
}

/**
 * Create HTTP clients for all internal services.
 *
 * When a `resolver` is provided, each call dynamically resolves the
 * target service URL via the resolver (discovery -> static fallback).
 * When omitted, static URLs are used directly (backward compatible).
 */
export function createInternalServiceClients(
  urls: InternalServiceUrls,
  resolver?: DiscoveryResolver,
): InternalServiceClients {
  /**
   * Resolve the base URL for a given service key.  If a dynamic
   * resolver is configured, it takes precedence; otherwise we use
   * the static URL from `urls`.
   */
  const baseUrl = async (serviceName: string, staticUrl: string): Promise<string> => {
    if (!resolver) return staticUrl;
    return resolver.resolveServiceUrl(serviceName);
  };

  return {
    identityAccess: {
      login: async (body) =>
        callInternalService(
          `${await baseUrl('identity-access', urls.identityAccess)}/internal/auth/login`,
          'POST',
          body,
        ),
      loginSystemAdmin: async (body) =>
        callInternalService(
          `${await baseUrl('identity-access', urls.identityAccess)}/internal/auth/system-admin-login`,
          'POST',
          body,
        ),
      logout: async (body) =>
        callInternalService(
          `${await baseUrl('identity-access', urls.identityAccess)}/internal/auth/logout`,
          'POST',
          body,
        ),
      validateSession: async (body) =>
        callInternalService(
          `${await baseUrl('identity-access', urls.identityAccess)}/internal/auth/validate`,
          'POST',
          body,
        ),
      selectTeam: async (body) =>
        callInternalService(
          `${await baseUrl('identity-access', urls.identityAccess)}/internal/auth/select-team`,
          'POST',
          body,
        ),
      createTeam: async (body) =>
        callInternalService(
          `${await baseUrl('identity-access', urls.identityAccess)}/internal/teams`,
          'POST',
          body,
        ),
      listTeams: async (userId) =>
        callInternalService(
          `${await baseUrl('identity-access', urls.identityAccess)}/internal/teams`,
          'GET',
          undefined,
          { userId },
        ),
      addMember: async (body) =>
        callInternalService(
          `${await baseUrl('identity-access', urls.identityAccess)}/internal/members`,
          'POST',
          body,
        ),
      updateMember: async (memberId, body) =>
        callInternalService(
          `${await baseUrl('identity-access', urls.identityAccess)}/internal/members/${memberId}`,
          'PUT',
          body,
        ),
      provisionAccessKey: async (body) =>
        callInternalService(
          `${await baseUrl('identity-access', urls.identityAccess)}/internal/access-keys`,
          'POST',
          body,
        ),
    },
    knowledgeRead: {
      getById: async (entryId) =>
        callInternalService(
          `${await baseUrl('knowledge-read', urls.knowledgeRead)}/internal/knowledge/${entryId}`,
          'GET',
        ),
      listMine: async (userId, teamId) =>
        callInternalService(
          `${await baseUrl('knowledge-read', urls.knowledgeRead)}/internal/knowledge/mine`,
          'GET',
          undefined,
          {
            userId,
            ...(teamId ? { teamId } : {}),
          },
        ),
      search: async (body) =>
        callInternalService(
          `${await baseUrl('knowledge-read', urls.knowledgeRead)}/internal/retrieval/search`,
          'POST',
          body,
        ),
      getProjectionStatus: async () =>
        callInternalService(
          `${await baseUrl('knowledge-read', urls.knowledgeRead)}/internal/knowledge-read/projection-status`,
          'GET',
        ),
    },
    knowledgeWrite: {
      submit: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/knowledge`,
          'POST',
          body,
          undefined,
          options,
        ),
      updateEntry: async (entryId, body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/knowledge/${entryId}`,
          'PUT',
          body,
          undefined,
          options,
        ),
      resubmit: async (entryId, body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/knowledge/${entryId}/resubmit`,
          'POST',
          body,
          undefined,
          options,
        ),
      supersede: async (entryId, body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/knowledge/${entryId}/supersede`,
          'POST',
          body,
          undefined,
          options,
        ),
      createTrap: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/traps`,
          'POST',
          body,
          undefined,
          options,
        ),
      approveReviewDecision: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/knowledge/review/approve`,
          'POST',
          body,
          undefined,
          options,
        ),
      rejectReviewDecision: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/knowledge/review/reject`,
          'POST',
          body,
          undefined,
          options,
        ),
      applyMaintenanceDecision: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/knowledge/maintenance`,
          'POST',
          body,
          undefined,
          options,
        ),
      applyDecayDecision: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/knowledge/decay`,
          'POST',
          body,
          undefined,
          options,
        ),
      publishCandidateResult: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/candidates/publish`,
          'POST',
          body,
          undefined,
          options,
        ),
      invoke: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/rpc/knowledge-write`,
          'POST',
          body,
          undefined,
          options,
        ),
      listTraps: async (teamId) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/traps`,
          'GET',
          undefined,
          { teamId },
        ),
      getTrap: async (trapId) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/traps/${trapId}`,
          'GET',
        ),
    },
    candidateIngestion: {
      submit: async (body) =>
        callInternalService(
          `${await baseUrl('candidate-ingestion', urls.candidateIngestion)}/internal/candidates`,
          'POST',
          body,
        ),
      getById: async (candidateId) =>
        callInternalService(
          `${await baseUrl('candidate-ingestion', urls.candidateIngestion)}/internal/candidates/${candidateId}`,
          'GET',
        ),
      listByStatus: async (status) =>
        callInternalService(
          `${await baseUrl('candidate-ingestion', urls.candidateIngestion)}/internal/candidates`,
          'GET',
          undefined,
          {
            status,
          },
        ),
      applyResolution: async (candidateId, body, options) =>
        callInternalService(
          `${await baseUrl('candidate-ingestion', urls.candidateIngestion)}/internal/candidates/${candidateId}/resolution`,
          'POST',
          body,
          undefined,
          options,
        ),
      submitManualResult: async (candidateId, body, options) =>
        callInternalService(
          `${await baseUrl('candidate-ingestion', urls.candidateIngestion)}/internal/candidates/${candidateId}/manual-result`,
          'POST',
          body,
          undefined,
          options,
        ),
      publishCandidateResult: async (candidateId, body, options) =>
        callInternalService(
          `${await baseUrl('candidate-ingestion', urls.candidateIngestion)}/internal/candidates/${candidateId}/publish`,
          'POST',
          body,
          undefined,
          options,
        ),
    },
    review: {
      approve: async (body) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/review/approve`,
          'POST',
          body,
        ),
      reject: async (body) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/review/reject`,
          'POST',
          body,
        ),
      applyMaintenance: async (body) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/review/maintenance`,
          'POST',
          body,
        ),
      applyDecay: async (body) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/review/decay`,
          'POST',
          body,
        ),
      reviewArtifact: async (body) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/review/artifact`,
          'POST',
          body,
        ),
      submitFeedback: async (body) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/feedback`,
          'POST',
          body,
        ),
    },
    governanceReview: {
      approve: async (body) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/review/approve`,
          'POST',
          body,
        ),
      reject: async (body) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/review/reject`,
          'POST',
          body,
        ),
      applyMaintenance: async (body) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/review/maintenance`,
          'POST',
          body,
        ),
      applyDecay: async (body) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/review/decay`,
          'POST',
          body,
        ),
      reviewArtifact: async (body) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/review/artifact`,
          'POST',
          body,
        ),
      submitFeedback: async (body) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/feedback`,
          'POST',
          body,
        ),
    },
    jobRuntime: {
      schedule: async (body) =>
        callInternalService(
          `${await baseUrl('job-runtime', urls.jobRuntime)}/internal/jobs`,
          'POST',
          body,
        ),
      getStatus: async (jobId) =>
        callInternalService(
          `${await baseUrl('job-runtime', urls.jobRuntime)}/internal/jobs/${jobId}`,
          'GET',
        ),
      getQueueStatus: async () =>
        callInternalService(
          `${await baseUrl('job-runtime', urls.jobRuntime)}/internal/jobs/queue`,
          'GET',
        ),
    },
  };
}
