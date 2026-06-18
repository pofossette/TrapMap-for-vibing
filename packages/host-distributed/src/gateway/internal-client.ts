/**
 * Internal HTTP client for forwarding requests to backend services.
 *
 * This is a thin HTTP client that the gateway uses to delegate
 * requests to internal services. Each service URL comes from the
 * service configuration.
 */

import type { InternalServiceUrls } from '../config/index.js';

// ---------------------------------------------------------------------------
// HTTP client helper
// ---------------------------------------------------------------------------

interface ServiceResponse {
  status: number;
  body: unknown;
}

const DEFAULT_INTERNAL_TIMEOUT_MS = 10_000;

async function callInternalService(
  url: string,
  method: 'GET' | 'POST' | 'PUT',
  body?: unknown,
  query?: Record<string, string>,
  timeoutMs: number = DEFAULT_INTERNAL_TIMEOUT_MS,
): Promise<ServiceResponse> {
  const urlObj = new URL(url);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      urlObj.searchParams.set(key, value);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

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

    return {
      status: response.status,
      body: responseBody,
    };
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return { status: 504, body: { error: 'Internal service timeout', kind: 'timeout' } };
    }
    return { status: 502, body: { error: 'Internal service unreachable', kind: 'upstream' } };
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
    logout(body: { sessionToken: string }): Promise<ServiceResponse>;
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
  };
  knowledgeWrite: {
    submit(body: {
      content: string;
      actorId: string;
      title?: string;
      labels?: string[];
      teamId?: string;
    }): Promise<ServiceResponse>;
    updateEntry(
      entryId: string,
      body: { updates: Record<string, unknown>; actorId: string },
    ): Promise<ServiceResponse>;
    resubmit(entryId: string, body: { actorId: string; note?: string }): Promise<ServiceResponse>;
    supersede(
      entryId: string,
      body: { replacementId: string; actorId: string },
    ): Promise<ServiceResponse>;
    createTrap(body: {
      content: string;
      teamId: string;
      actorId: string;
      title?: string;
    }): Promise<ServiceResponse>;
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
    ): Promise<ServiceResponse>;
    submitManualResult(
      candidateId: string,
      body: { result: Record<string, unknown>; actorId: string },
    ): Promise<ServiceResponse>;
  };
  governanceReview: {
    approve(body: { entryId: string; actorId: string; note?: string }): Promise<ServiceResponse>;
    reject(body: { entryId: string; actorId: string; note?: string }): Promise<ServiceResponse>;
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
 */
export function createInternalServiceClients(urls: InternalServiceUrls): InternalServiceClients {
  return {
    identityAccess: {
      login: (body) =>
        callInternalService(`${urls.identityAccess}/internal/auth/login`, 'POST', body),
      logout: (body) =>
        callInternalService(`${urls.identityAccess}/internal/auth/logout`, 'POST', body),
      selectTeam: (body) =>
        callInternalService(`${urls.identityAccess}/internal/auth/select-team`, 'POST', body),
      createTeam: (body) =>
        callInternalService(`${urls.identityAccess}/internal/teams`, 'POST', body),
      listTeams: (userId) =>
        callInternalService(`${urls.identityAccess}/internal/teams`, 'GET', undefined, { userId }),
      addMember: (body) =>
        callInternalService(`${urls.identityAccess}/internal/members`, 'POST', body),
      updateMember: (memberId, body) =>
        callInternalService(`${urls.identityAccess}/internal/members/${memberId}`, 'PUT', body),
      provisionAccessKey: (body) =>
        callInternalService(`${urls.identityAccess}/internal/access-keys`, 'POST', body),
    },
    knowledgeRead: {
      getById: (entryId) =>
        callInternalService(`${urls.knowledgeRead}/internal/knowledge/${entryId}`, 'GET'),
      listMine: (userId, teamId) =>
        callInternalService(`${urls.knowledgeRead}/internal/knowledge/mine`, 'GET', undefined, {
          userId,
          ...(teamId ? { teamId } : {}),
        }),
      search: (body) =>
        callInternalService(`${urls.knowledgeRead}/internal/retrieval/search`, 'POST', body),
    },
    knowledgeWrite: {
      submit: (body) =>
        callInternalService(`${urls.knowledgeWrite}/internal/knowledge`, 'POST', body),
      updateEntry: (entryId, body) =>
        callInternalService(`${urls.knowledgeWrite}/internal/knowledge/${entryId}`, 'PUT', body),
      resubmit: (entryId, body) =>
        callInternalService(
          `${urls.knowledgeWrite}/internal/knowledge/${entryId}/resubmit`,
          'POST',
          body,
        ),
      supersede: (entryId, body) =>
        callInternalService(
          `${urls.knowledgeWrite}/internal/knowledge/${entryId}/supersede`,
          'POST',
          body,
        ),
      createTrap: (body) =>
        callInternalService(`${urls.knowledgeWrite}/internal/traps`, 'POST', body),
      listTraps: (teamId) =>
        callInternalService(`${urls.knowledgeWrite}/internal/traps`, 'GET', undefined, { teamId }),
      getTrap: (trapId) =>
        callInternalService(`${urls.knowledgeWrite}/internal/traps/${trapId}`, 'GET'),
    },
    candidateIngestion: {
      submit: (body) =>
        callInternalService(`${urls.candidateIngestion}/internal/candidates`, 'POST', body),
      getById: (candidateId) =>
        callInternalService(`${urls.candidateIngestion}/internal/candidates/${candidateId}`, 'GET'),
      listByStatus: (status) =>
        callInternalService(`${urls.candidateIngestion}/internal/candidates`, 'GET', undefined, {
          status,
        }),
      applyResolution: (candidateId, body) =>
        callInternalService(
          `${urls.candidateIngestion}/internal/candidates/${candidateId}/resolution`,
          'POST',
          body,
        ),
      submitManualResult: (candidateId, body) =>
        callInternalService(
          `${urls.candidateIngestion}/internal/candidates/${candidateId}/manual-result`,
          'POST',
          body,
        ),
    },
    governanceReview: {
      approve: (body) =>
        callInternalService(`${urls.governanceReview}/internal/review/approve`, 'POST', body),
      reject: (body) =>
        callInternalService(`${urls.governanceReview}/internal/review/reject`, 'POST', body),
      reviewArtifact: (body) =>
        callInternalService(`${urls.governanceReview}/internal/review/artifact`, 'POST', body),
      submitFeedback: (body) =>
        callInternalService(`${urls.governanceReview}/internal/feedback`, 'POST', body),
    },
    jobRuntime: {
      schedule: (body) => callInternalService(`${urls.jobRuntime}/internal/jobs`, 'POST', body),
      getStatus: (jobId) => callInternalService(`${urls.jobRuntime}/internal/jobs/${jobId}`, 'GET'),
      getQueueStatus: () => callInternalService(`${urls.jobRuntime}/internal/jobs/queue`, 'GET'),
    },
  };
}
