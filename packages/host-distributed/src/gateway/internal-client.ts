import { client } from "./client.js";
import { breaker } from "./breaker.js";
import { healthAggregator } from "./health-aggregator.js";
const _gateway = { client, breaker, healthAggregator };
 * Internal HTTP client for forwarding requests to backend services.
 *
 * This is a thin HTTP client that the gateway uses to delegate
 * requests to internal services. Each service URL comes from the
 * service configuration.
 */

import { randomBytes, randomUUID } from 'node:crypto';
import {
  SpanKind,
  SpanStatusCode,
  context as otelContext,
  propagation,
  trace,
} from '@opentelemetry/api';

import {
  type BadcaseExportDraftPayload,
  type RemediationReactivationPayload,
  type SkillLookupQuery,
  geneSearchResponseSchema,
  skillLookupResponseSchema,
} from '@trapmap/contracts';
import type { InternalServiceUrls } from '@trapmap/host-distributed/config/index.js';
import {
  resolveInternalTimeoutMs,
  serviceNameForInternalHost,
} from '@trapmap/host-distributed/config/index.js';
import type { DiscoveryResolver } from './discovery-resolver.js';
import { recordDistributedInternalHopMetric } from './internal-observability.js';
import {
  CircuitBreaker,
  CircuitOpenError,
  resolveBreakerCooldownMs,
  resolveBreakerThreshold,
  resolveRetryPolicy,
  withResilience,
} from './resilience.js';

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
  headers?: Record<string, string> | undefined;
  timeoutMs?: number | undefined;
}

const DEFAULT_INTERNAL_TIMEOUT_MS = 10_000;

function classifyInternalServiceKind(status: number): string {
  if (status === 400 || status === 422) return 'validation';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not-found';
  if (status === 409) return 'conflict';
  if (status === 504) return 'timeout';
  if (status === 503) return 'unavailable';
  return 'internal';
}

function normalizeCanonicalErrorBody(status: number, body: unknown): unknown {
  if (body && typeof body === 'object') {
    const payload = body as Record<string, unknown>;
    if (typeof payload.kind === 'string' && typeof payload.error === 'string') {
      return body;
    }
  }

  const kind = classifyInternalServiceKind(status);
  return {
    error: `Internal service ${kind.replace(/-/g, ' ')}`,
    kind,
  };
}

// fallow-ignore-next-line complexity -- Task C2 仅重命名既有实现体（原 callInternalService），行为不变硬约束下不重构函数体
async function callInternalServiceOnce(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
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
  // Task C3: every internal hop carries a correlation id — forward the
  // caller's x-request-id when present, otherwise generate one.
  if (!headers['x-request-id']) {
    headers['x-request-id'] = randomUUID();
  }
  // W3C traceparent fallback: without a registered OTel SDK the injector
  // emits nothing (invalid span context), so synthesize a valid header to
  // keep trace context unbroken across internal hops.
  if (!headers.traceparent) {
    headers.traceparent = `00-${randomBytes(16).toString('hex')}-${randomBytes(8).toString('hex')}-01`;
  }
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
// Resilient wrapper (Task C2): breaker + idempotent retry + timeout budgets.
// Default env → maxAttempts=1 and breakers closed ⇒ behavior identical to the
// single-attempt client above.
// ---------------------------------------------------------------------------

// Per-origin breakers are created lazily so env overrides
// (TRAPMAP_INTERNAL_BREAKER_THRESHOLD / _COOLDOWN_MS) apply whenever the first
// request to that origin happens, not at module-load time.
const internalBreakersByOrigin = new Map<string, CircuitBreaker>();

function breakerForOrigin(origin: string): CircuitBreaker {
  const existing = internalBreakersByOrigin.get(origin);
  if (existing) return existing;
  const breaker = new CircuitBreaker({
    threshold: resolveBreakerThreshold(process.env),
    cooldownMs: resolveBreakerCooldownMs(process.env),
  });
  internalBreakersByOrigin.set(origin, breaker);
  return breaker;
}

/** Task C5: snapshot of per-origin circuit breaker states for readiness reporting. */
export function breakerStatesSnapshot(): Record<string, 'closed' | 'open' | 'half-open'> {
  const states: Record<string, 'closed' | 'open' | 'half-open'> = {};
  for (const [origin, breaker] of internalBreakersByOrigin) {
    states[origin] = breaker.state;
  }
  return states;
}

class TransientInternalResponseError extends Error {
  constructor(public readonly response: ServiceResponse) {
    super(`transient internal response ${response.status}`);
    this.name = 'TransientInternalResponseError';
  }
}

function isTransientStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

const INTERNAL_UNAVAILABLE_RESPONSE: ServiceResponse = {
  status: 503,
  body: { error: 'Internal service unavailable', kind: 'unavailable' },
};

/**
 * Explicit per-call timeout wins; otherwise apply the per-service env budget
 * (`TRAPMAP_<SVC>_TIMEOUT_MS`) when the hostname maps to a known service.
 */
function withEnvTimeout(
  hostname: string,
  options: InternalRequestOptions | undefined,
): InternalRequestOptions {
  if (options?.timeoutMs !== undefined) return options;
  const serviceName = serviceNameForInternalHost(hostname);
  if (serviceName === undefined) return options ?? {};
  const envTimeoutMs = resolveInternalTimeoutMs(process.env, serviceName);
  if (envTimeoutMs === undefined) return options ?? {};
  return { ...options, timeoutMs: envTimeoutMs };
}

async function callInternalService(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
  query?: Record<string, string>,
  options?: InternalRequestOptions,
): Promise<ServiceResponse> {
  const breaker = breakerForOrigin(new URL(url).origin);
  if (!breaker.canAttempt()) {
    return INTERNAL_UNAVAILABLE_RESPONSE;
  }

  const retry = resolveRetryPolicy(process.env);
  const effectiveOptions = withEnvTimeout(new URL(url).hostname, options);

  try {
    return await withResilience(
      {
        retry,
        breaker,
        retryable: (err) => err instanceof TransientInternalResponseError && method === 'GET',
      },
      async () => {
        const response = await callInternalServiceOnce(url, method, body, query, effectiveOptions);
        if (isTransientStatus(response.status)) {
          throw new TransientInternalResponseError(response);
        }
        return response;
      },
    );
  } catch (err) {
    if (err instanceof TransientInternalResponseError) return err.response;
    if (err instanceof CircuitOpenError) return INTERNAL_UNAVAILABLE_RESPONSE;
    throw err;
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
    searchByContent(params: SkillLookupQuery): Promise<ServiceResponse>;
    searchGenes(body: unknown, options?: InternalRequestOptions): Promise<ServiceResponse>;
    getProjectionStatus(): Promise<ServiceResponse>;
  };
  knowledgeWrite: {
    deriveExperienceGene(
      body: Record<string, unknown>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    planExperienceGeneDerivations(
      body: unknown,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    markExperienceGenesStale(
      body: unknown,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    importArtifact(
      body: Record<string, unknown>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    editArtifact(
      artifactId: string,
      body: Record<string, unknown>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    artifactHistory(artifactId: string, options?: InternalRequestOptions): Promise<ServiceResponse>;
    exportArtifacts(
      body: Record<string, unknown>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    artifactReviewQueue(options?: InternalRequestOptions): Promise<ServiceResponse>;
    reviewArtifact(
      artifactId: string,
      body: Record<string, unknown>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    activateArtifact(
      body: Record<string, unknown>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    deactivateArtifact(
      artifactId: string,
      body: Record<string, unknown>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
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
    getConflictCandidates(entryId: string): Promise<ServiceResponse>;
    getArtifactById(artifactId: string, options?: InternalRequestOptions): Promise<ServiceResponse>;
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
    returnReviewDecision(
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
    detectConflicts(body: { entryId: string }): Promise<ServiceResponse>;
    approve(body: { entryId: string; actorId: string; note?: string }): Promise<ServiceResponse>;
    reject(body: { entryId: string; actorId: string; note?: string }): Promise<ServiceResponse>;
    returnForCorrection(body: {
      entryId: string;
      actorId: string;
      note?: string;
    }): Promise<ServiceResponse>;
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
    submitFeedback(
      body: {
        entryId: string;
        problemType: string;
        description: string;
        actorId: string;
        [key: string]: unknown;
      },
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
  };
  governanceReview: InternalServiceClients['review'] & {
    getRetrievalProjection(body: { entryIds: string[] }): Promise<ServiceResponse>;
    reactivateRemediation(payload: RemediationReactivationPayload): Promise<ServiceResponse>;
    exportBadcaseDraft(payload: BadcaseExportDraftPayload): Promise<ServiceResponse>;
  };
  feedbackAdmin: {
    list(query: Record<string, string>, options?: InternalRequestOptions): Promise<ServiceResponse>;
    batch(
      body: Record<string, unknown>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    stats(entryId: string, options?: InternalRequestOptions): Promise<ServiceResponse>;
    listRemediation(options?: InternalRequestOptions): Promise<ServiceResponse>;
    getRemediation(entryId: string, options?: InternalRequestOptions): Promise<ServiceResponse>;
    completeRemediation(
      entryId: string,
      body: Record<string, unknown>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
  };
  adminReview: {
    listReviews(
      query: Record<string, string>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    getReview(reviewId: string, options?: InternalRequestOptions): Promise<ServiceResponse>;
    listActivity(
      query: Record<string, string>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    decideReview(
      reviewId: string,
      body: Record<string, unknown>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
  };
  adminArtifacts: {
    list(query: Record<string, string>, options?: InternalRequestOptions): Promise<ServiceResponse>;
    getById(artifactId: string, options?: InternalRequestOptions): Promise<ServiceResponse>;
  };
  adminGraph: {
    getTrapGraph(
      query: Record<string, string>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    getSkillGraph(
      query: Record<string, string>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    getSkillGraphById(
      artifactId: string,
      query: Record<string, string>,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
  };
  reviewQueue: {
    list(query: Record<string, string>, options?: InternalRequestOptions): Promise<ServiceResponse>;
  };
  jobRuntime: {
    schedule(body: {
      type: string;
      payload: unknown;
      delayMs?: number;
      priority?: number;
      maxAttempts?: number;
      dedupeKey?: string;
    }): Promise<ServiceResponse>;
    getStatus(jobId: string): Promise<ServiceResponse>;
    getQueueStatus(): Promise<ServiceResponse>;
  };
  cronScheduler: {
    listJobs(options?: InternalRequestOptions): Promise<ServiceResponse>;
    createJob(body: unknown, options?: InternalRequestOptions): Promise<ServiceResponse>;
    getJob(jobId: string, options?: InternalRequestOptions): Promise<ServiceResponse>;
    updateJob(
      jobId: string,
      body: unknown,
      options?: InternalRequestOptions,
    ): Promise<ServiceResponse>;
    deleteJob(jobId: string, options?: InternalRequestOptions): Promise<ServiceResponse>;
    triggerJob(jobId: string, options?: InternalRequestOptions): Promise<ServiceResponse>;
    getStatus(options?: InternalRequestOptions): Promise<ServiceResponse>;
  };
}

/**
 * Shared governance-review client (2026-08-16 merge).
 *
 * `review` and `governanceReview` expose the same seven review methods
 * with identical routes; they differ only in which static URL key the
 * base URL comes from (`urls.review` vs `urls.governanceReview`). One
 * implementation parameterized by the base-URL source keeps the two
 * groups from drifting.
 */
function createGovernanceReviewClient(
  baseUrlFor: () => Promise<string>,
): InternalServiceClients['review'] {
  return {
    detectConflicts: async (body) =>
      callInternalService(`${await baseUrlFor()}/internal/conflicts/detect`, 'POST', body),
    approve: async (body) =>
      callInternalService(`${await baseUrlFor()}/internal/review/approve`, 'POST', body),
    reject: async (body) =>
      callInternalService(`${await baseUrlFor()}/internal/review/reject`, 'POST', body),
    returnForCorrection: async (body) =>
      callInternalService(
        `${await baseUrlFor()}/internal/review/return-for-correction`,
        'POST',
        body,
      ),
    applyMaintenance: async (body) =>
      callInternalService(`${await baseUrlFor()}/internal/review/maintenance`, 'POST', body),
    applyDecay: async (body) =>
      callInternalService(`${await baseUrlFor()}/internal/review/decay`, 'POST', body),
    reviewArtifact: async (body) =>
      callInternalService(`${await baseUrlFor()}/internal/review/artifact`, 'POST', body),
    submitFeedback: async (body, options) =>
      callInternalService(
        `${await baseUrlFor()}/internal/feedback`,
        'POST',
        body,
        undefined,
        options,
      ),
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

  // review / governanceReview share the same seven review methods; the only
  // difference is the static URL key the base URL is taken from.
  const reviewClient = createGovernanceReviewClient(() =>
    baseUrl('governance-review', urls.review),
  );
  const governanceReviewClient: InternalServiceClients['governanceReview'] = {
    ...createGovernanceReviewClient(() => baseUrl('governance-review', urls.governanceReview)),
    getRetrievalProjection: async (body) =>
      callInternalService(
        `${await baseUrl('governance-review', urls.governanceReview)}/internal/governance-review/retrieval-projection`,
        'POST',
        body,
      ),
    reactivateRemediation: async (body) =>
      callInternalService(
        `${await baseUrl('governance-review', urls.governanceReview)}/internal/feedback/async/remediation-reactivation`,
        'POST',
        body,
      ),
    exportBadcaseDraft: async (body) =>
      callInternalService(
        `${await baseUrl('governance-review', urls.governanceReview)}/internal/feedback/async/badcase-export-draft`,
        'POST',
        body,
      ),
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
      searchByContent: async (params) => {
        const response = await callInternalService(
          `${await baseUrl('knowledge-read', urls.knowledgeRead)}/internal/retrieval/skills/search-by-content`,
          'POST',
          params,
        );
        return {
          status: response.status,
          body:
            response.status >= 200 && response.status < 300
              ? skillLookupResponseSchema.parse(response.body)
              : response.body,
        };
      },
      getProjectionStatus: async () =>
        callInternalService(
          `${await baseUrl('knowledge-read', urls.knowledgeRead)}/internal/knowledge-read/projection-status`,
          'GET',
        ),
      searchGenes: async (body, options) => {
        const response = await callInternalService(
          `${await baseUrl('knowledge-read', urls.knowledgeRead)}/internal/retrieval/genes/search`,
          'POST',
          body,
          undefined,
          options,
        );
        return {
          status: response.status,
          body:
            response.status >= 200 && response.status < 300
              ? geneSearchResponseSchema.parse(response.body)
              : response.body,
        };
      },
    },
    knowledgeWrite: {
      deriveExperienceGene: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/experience-genes/derive`,
          'POST',
          body,
          undefined,
          options,
        ),
      planExperienceGeneDerivations: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/experience-genes/derivation-plan`,
          'POST',
          body,
          undefined,
          options,
        ),
      markExperienceGenesStale: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/experience-genes/stale`,
          'POST',
          body,
          undefined,
          options,
        ),
      importArtifact: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/artifacts/import`,
          'POST',
          body,
          undefined,
          options,
        ),
      editArtifact: async (artifactId, body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/artifacts/${artifactId}/edit`,
          'POST',
          body,
          undefined,
          options,
        ),
      artifactHistory: async (artifactId, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/artifacts/${artifactId}/history`,
          'GET',
          undefined,
          undefined,
          options,
        ),
      exportArtifacts: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/artifacts/export`,
          'POST',
          body,
          undefined,
          options,
        ),
      artifactReviewQueue: async (options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/artifacts/review-queue`,
          'GET',
          undefined,
          undefined,
          options,
        ),
      reviewArtifact: async (artifactId, body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/artifacts/${artifactId}/review`,
          'POST',
          body,
          undefined,
          options,
        ),
      activateArtifact: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/artifacts/activate`,
          'POST',
          body,
          undefined,
          options,
        ),
      deactivateArtifact: async (artifactId, body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/artifacts/${artifactId}/deactivate`,
          'POST',
          body,
          undefined,
          options,
        ),
      submit: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/knowledge`,
          'POST',
          body,
          undefined,
          options,
        ),
      getConflictCandidates: async (entryId) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/knowledge/${entryId}/conflict-candidates`,
          'GET',
        ),
      getArtifactById: async (artifactId, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/artifacts/${artifactId}`,
          'GET',
          undefined,
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
      returnReviewDecision: async (body, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/internal/knowledge/review/return-for-correction`,
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
    review: reviewClient,
    governanceReview: governanceReviewClient,
    feedbackAdmin: {
      list: async (query, options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/feedback/admin`,
          'GET',
          undefined,
          query,
          options,
        ),
      batch: async (body, options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/feedback/admin/batch`,
          'POST',
          body,
          undefined,
          options,
        ),
      stats: async (entryId, options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/feedback/admin/stats/${entryId}`,
          'GET',
          undefined,
          undefined,
          options,
        ),
      listRemediation: async (options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/feedback/admin/remediation`,
          'GET',
          undefined,
          undefined,
          options,
        ),
      getRemediation: async (entryId, options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/feedback/admin/remediation/${entryId}`,
          'GET',
          undefined,
          undefined,
          options,
        ),
      completeRemediation: async (entryId, body, options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.review)}/internal/feedback/admin/remediation/${entryId}/complete`,
          'POST',
          body,
          undefined,
          options,
        ),
    },
    adminReview: {
      listReviews: async (query, options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.governanceReview)}/api/admin/reviews`,
          'GET',
          undefined,
          query,
          options,
        ),
      getReview: async (reviewId, options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.governanceReview)}/api/admin/reviews/${reviewId}`,
          'GET',
          undefined,
          undefined,
          options,
        ),
      listActivity: async (query, options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.governanceReview)}/api/admin/activity`,
          'GET',
          undefined,
          query,
          options,
        ),
      decideReview: async (reviewId, body, options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.governanceReview)}/api/admin/reviews/${reviewId}/decision`,
          'POST',
          body,
          undefined,
          options,
        ),
    },
    adminArtifacts: {
      list: async (query, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/api/admin/artifacts`,
          'GET',
          undefined,
          query,
          options,
        ),
      getById: async (artifactId, options) =>
        callInternalService(
          `${await baseUrl('knowledge-write', urls.knowledgeWrite)}/api/admin/artifacts/${artifactId}`,
          'GET',
          undefined,
          undefined,
          options,
        ),
    },
    adminGraph: {
      getTrapGraph: async (query, options) =>
        callInternalService(
          `${await baseUrl('knowledge-read', urls.knowledgeRead)}/api/admin/graph/traps`,
          'GET',
          undefined,
          query,
          options,
        ),
      getSkillGraph: async (query, options) =>
        callInternalService(
          `${await baseUrl('knowledge-read', urls.knowledgeRead)}/api/admin/graph/skills`,
          'GET',
          undefined,
          query,
          options,
        ),
      getSkillGraphById: async (artifactId, query, options) =>
        callInternalService(
          `${await baseUrl('knowledge-read', urls.knowledgeRead)}/api/admin/graphs/skill/${artifactId}`,
          'GET',
          undefined,
          query,
          options,
        ),
    },
    reviewQueue: {
      list: async (query, options) =>
        callInternalService(
          `${await baseUrl('governance-review', urls.governanceReview)}/api/admin/reviews`,
          'GET',
          undefined,
          query,
          options,
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
    cronScheduler: {
      listJobs: async (options) =>
        callInternalService(
          `${await baseUrl('cron-scheduler', urls.cronScheduler)}/cron/jobs`,
          'GET',
          undefined,
          undefined,
          options,
        ),
      createJob: async (body, options) =>
        callInternalService(
          `${await baseUrl('cron-scheduler', urls.cronScheduler)}/cron/jobs`,
          'POST',
          body,
          undefined,
          options,
        ),
      getJob: async (jobId, options) =>
        callInternalService(
          `${await baseUrl('cron-scheduler', urls.cronScheduler)}/cron/jobs/${jobId}`,
          'GET',
          undefined,
          undefined,
          options,
        ),
      updateJob: async (jobId, body, options) =>
        callInternalService(
          `${await baseUrl('cron-scheduler', urls.cronScheduler)}/cron/jobs/${jobId}`,
          'PATCH',
          body,
          undefined,
          options,
        ),
      deleteJob: async (jobId, options) =>
        callInternalService(
          `${await baseUrl('cron-scheduler', urls.cronScheduler)}/cron/jobs/${jobId}`,
          'DELETE',
          undefined,
          undefined,
          options,
        ),
      triggerJob: async (jobId, options) =>
        callInternalService(
          `${await baseUrl('cron-scheduler', urls.cronScheduler)}/cron/jobs/${jobId}/trigger`,
          'POST',
          undefined,
          undefined,
          options,
        ),
      getStatus: async (options) =>
        callInternalService(
          `${await baseUrl('cron-scheduler', urls.cronScheduler)}/cron/status`,
          'GET',
          undefined,
          undefined,
          options,
        ),
    },
  };
}
