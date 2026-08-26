// fallow-ignore-file code-duplication -- gateway internal-client 测试的 fetch/clients 装配模式有意相似；跨用例抽取 helper 会降低可读性（Task C2 变更激活了既有克隆面）
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInternalServiceClients } from './internal-client.js';
import {
  getDistributedInternalObservabilitySnapshot,
  resetDistributedInternalObservability,
} from './internal-observability.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetDistributedInternalObservability();
  vi.restoreAllMocks();
});

describe('createInternalServiceClients', () => {
  it('exposes governance feedback admin calls with query, path, body, and headers', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('http://review.test/internal/feedback/admin?status=new&limit=10');
      expect(init?.headers).toMatchObject({
        'Content-Type': 'application/json',
        'x-request-id': 'feedback-admin-request',
        'x-correlation-id': 'feedback-admin-correlation',
        'x-trapmap-actor-id': 'user-1',
      });
      return new Response(JSON.stringify({ items: [], total: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const clients = createInternalServiceClients({
      gateway: 'http://gateway.test',
      identityAccess: 'http://identity.test',
      knowledgeRead: 'http://read.test',
      knowledgeWrite: 'http://write.test',
      candidateIngestion: 'http://candidate.test',
      review: 'http://review.test',
      governanceReview: 'http://review.test',
      jobRuntime: 'http://job.test',

      cronScheduler: 'http://cron.test',
    });

    await expect(
      (
        clients as typeof clients & {
          feedbackAdmin: {
            list(
              query: Record<string, string>,
              options: { headers: Record<string, string> },
            ): Promise<unknown>;
          };
        }
      ).feedbackAdmin.list(
        { status: 'new', limit: '10' },
        {
          headers: {
            'x-request-id': 'feedback-admin-request',
            'x-correlation-id': 'feedback-admin-correlation',
            'x-trapmap-actor-id': 'user-1',
          },
        },
      ),
    ).resolves.toEqual({
      status: 200,
      body: { items: [], total: 0 },
    });
  });

  it('preserves non-2xx body and forwards custom headers', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        'Content-Type': 'application/json',
        'x-request-id': 'req-1',
        'x-trace-id': 'trace-1',
      });
      return new Response(JSON.stringify({ error: 'duplicate', kind: 'conflict' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const clients = createInternalServiceClients({
      gateway: 'http://gateway.test',
      identityAccess: 'http://identity.test',
      knowledgeRead: 'http://read.test',
      knowledgeWrite: 'http://write.test',
      candidateIngestion: 'http://candidate.test',
      review: 'http://review.test',
      governanceReview: 'http://review.test',
      jobRuntime: 'http://job.test',

      cronScheduler: 'http://cron.test',
    });

    const response = await clients.knowledgeWrite.approveReviewDecision(
      { entryId: 'entry-1', actorId: 'user-1' },
      {
        headers: { 'x-request-id': 'req-1', 'x-trace-id': 'trace-1' },
      },
    );

    expect(response).toEqual({
      status: 409,
      body: { error: 'duplicate', kind: 'conflict' },
    });
  });

  it('reads approved conflict candidates from the knowledge-write owner', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        'http://write.test/internal/knowledge/entry-1/conflict-candidates',
      );
      return new Response(
        JSON.stringify({
          entry: {
            id: 'entry-1',
            shortcut: 'Postgres query timeout',
            detail: 'avoid table scan',
            lifecycleState: 'approved',
          },
          candidates: [],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const clients = createInternalServiceClients({
      gateway: 'http://gateway.test',
      identityAccess: 'http://identity.test',
      knowledgeRead: 'http://read.test',
      knowledgeWrite: 'http://write.test',
      candidateIngestion: 'http://candidate.test',
      review: 'http://review.test',
      governanceReview: 'http://review.test',
      jobRuntime: 'http://job.test',

      cronScheduler: 'http://cron.test',
    });

    await expect(clients.knowledgeWrite.getConflictCandidates('entry-1')).resolves.toEqual({
      status: 200,
      body: {
        entry: {
          id: 'entry-1',
          shortcut: 'Postgres query timeout',
          detail: 'avoid table scan',
          lifecycleState: 'approved',
        },
        candidates: [],
      },
    });
  });

  it('reads artifacts from the knowledge-write owner with the exact owner URL', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('http://write.test/internal/artifacts/artifact-1');
      return new Response(JSON.stringify({ error: 'artifact missing', kind: 'not-found' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const clients = createInternalServiceClients({
      gateway: 'http://gateway.test',
      identityAccess: 'http://identity.test',
      knowledgeRead: 'http://read.test',
      knowledgeWrite: 'http://write.test',
      candidateIngestion: 'http://candidate.test',
      review: 'http://review.test',
      governanceReview: 'http://review.test',
      jobRuntime: 'http://job.test',

      cronScheduler: 'http://cron.test',
    });

    await expect(clients.knowledgeWrite.getArtifactById('artifact-1')).resolves.toEqual({
      status: 404,
      body: { error: 'artifact missing', kind: 'not-found' },
    });
  });

  it('calls the governance-review retrieval projection route with scoped entry ids', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(
        'http://review.test/internal/governance-review/retrieval-projection',
      );
      expect(init?.method).toBe('POST');
      expect(init?.body).toBe(JSON.stringify({ entryIds: ['entry-1', 'entry-2'] }));
      return new Response(JSON.stringify({ feedback: [], conflicts: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const clients = createInternalServiceClients({
      gateway: 'http://gateway.test',
      identityAccess: 'http://identity.test',
      knowledgeRead: 'http://read.test',
      knowledgeWrite: 'http://write.test',
      candidateIngestion: 'http://candidate.test',
      review: 'http://review.test',
      governanceReview: 'http://review.test',
      jobRuntime: 'http://job.test',

      cronScheduler: 'http://cron.test',
    });

    await expect(
      (
        clients as typeof clients & {
          governanceReview: {
            getRetrievalProjection(body: {
              entryIds: string[];
            }): Promise<{ status: number; body: unknown }>;
          };
        }
      ).governanceReview.getRetrievalProjection({ entryIds: ['entry-1', 'entry-2'] }),
    ).resolves.toEqual({
      status: 200,
      body: { feedback: [], conflicts: [] },
    });
  });

  it('posts governance feedback async payloads to the governance-review owner routes', async () => {
    const fetchMock = vi
      .fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          'http://governance.test/internal/feedback/async/remediation-reactivation',
        );
        expect(init?.method).toBe('POST');
        expect(init?.body).toBe(
          JSON.stringify({
            entryId: 'entry-1',
            entryType: 'trap',
            feedbackIds: ['feedback-1'],
            resolvedAt: '2026-07-19T00:00:00.000Z',
            resolvedByUserId: 'admin-1',
            notes: 'reactivate retrieval',
          }),
        );
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      })
      .mockImplementationOnce(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          'http://governance.test/internal/feedback/async/remediation-reactivation',
        );
        expect(init?.method).toBe('POST');
        expect(init?.body).toBe(
          JSON.stringify({
            entryId: 'entry-1',
            entryType: 'trap',
            feedbackIds: ['feedback-1'],
            resolvedAt: '2026-07-19T00:00:00.000Z',
            resolvedByUserId: 'admin-1',
            notes: 'reactivate retrieval',
          }),
        );
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      })
      .mockImplementationOnce(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          'http://governance.test/internal/feedback/async/badcase-export-draft',
        );
        expect(init?.method).toBe('POST');
        expect(init?.body).toBe(
          JSON.stringify({
            feedbackId: 'feedback-1',
            entryId: 'entry-1',
            entryType: 'trap',
            queryId: 'query-1',
            requestId: 'request-1',
            traceId: 'trace-1',
          }),
        );
        return new Response(JSON.stringify({ accepted: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      });
    globalThis.fetch = fetchMock as typeof fetch;

    const clients = createInternalServiceClients({
      gateway: 'http://gateway.test',
      identityAccess: 'http://identity.test',
      knowledgeRead: 'http://read.test',
      knowledgeWrite: 'http://write.test',
      candidateIngestion: 'http://candidate.test',
      review: 'http://review.test',
      governanceReview: 'http://governance.test',
      jobRuntime: 'http://job.test',

      cronScheduler: 'http://cron.test',
    });

    await expect(
      (
        clients as typeof clients & {
          governanceReview: {
            reactivateRemediation(body: {
              entryId: string;
              entryType: 'trap';
              feedbackIds: string[];
              resolvedAt: string;
              resolvedByUserId: string;
              notes: string;
            }): Promise<{ status: number; body: unknown }>;
            exportBadcaseDraft(body: {
              feedbackId: string;
              entryId: string;
              entryType: 'trap';
              queryId: string;
              requestId: string;
              traceId: string;
            }): Promise<{ status: number; body: unknown }>;
          };
        }
      ).governanceReview.reactivateRemediation({
        entryId: 'entry-1',
        entryType: 'trap',
        feedbackIds: ['feedback-1'],
        resolvedAt: '2026-07-19T00:00:00.000Z',
        resolvedByUserId: 'admin-1',
        notes: 'reactivate retrieval',
      }),
    ).resolves.toEqual({
      status: 200,
      body: { ok: true },
    });

    await expect(
      (
        clients as typeof clients & {
          governanceReview: {
            exportBadcaseDraft(body: {
              feedbackId: string;
              entryId: string;
              entryType: 'trap';
              queryId: string;
              requestId: string;
              traceId: string;
            }): Promise<{ status: number; body: unknown }>;
          };
        }
      ).governanceReview.exportBadcaseDraft({
        feedbackId: 'feedback-1',
        entryId: 'entry-1',
        entryType: 'trap',
        queryId: 'query-1',
        requestId: 'request-1',
        traceId: 'trace-1',
      }),
    ).resolves.toEqual({
      status: 200,
      body: { accepted: true },
    });
  });

  it('routes the shared review methods to their per-key base URLs (review vs governanceReview)', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const clients = createInternalServiceClients({
      gateway: 'http://gateway.test',
      identityAccess: 'http://identity.test',
      knowledgeRead: 'http://read.test',
      knowledgeWrite: 'http://write.test',
      candidateIngestion: 'http://candidate.test',
      review: 'http://review.test',
      governanceReview: 'http://governance.test',
      jobRuntime: 'http://job.test',
      cronScheduler: 'http://cron.test',
    });

    await clients.review.approve({ entryId: 'entry-1', actorId: 'user-1' });
    await clients.governanceReview.approve({ entryId: 'entry-1', actorId: 'user-1' });
    await clients.governanceReview.detectConflicts({ entryId: 'entry-1' });
    await clients.review.submitFeedback({
      entryId: 'entry-1',
      problemType: 'unclear',
      description: 'needs context',
      actorId: 'user-1',
    });

    // The merged implementation keeps the URL-key separation intact:
    // review → urls.review, governanceReview → urls.governanceReview.
    expect(calls).toEqual([
      'http://review.test/internal/review/approve',
      'http://governance.test/internal/review/approve',
      'http://governance.test/internal/conflicts/detect',
      'http://review.test/internal/feedback',
    ]);
  });

  it('maps aborted internal calls to timeout responses', async () => {
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal | undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    }) as typeof fetch;

    const clients = createInternalServiceClients({
      gateway: 'http://gateway.test',
      identityAccess: 'http://identity.test',
      knowledgeRead: 'http://read.test',
      knowledgeWrite: 'http://write.test',
      candidateIngestion: 'http://candidate.test',
      review: 'http://review.test',
      governanceReview: 'http://review.test',
      jobRuntime: 'http://job.test',

      cronScheduler: 'http://cron.test',
    });

    const response = await clients.knowledgeWrite.publishCandidateResult(
      {
        candidateId: 'candidate-1',
        actorId: 'user-1',
        result: { decision: 'publish' },
      },
      { timeoutMs: 1 },
    );

    expect(response).toEqual({
      status: 504,
      body: { error: 'Internal service timeout', kind: 'timeout' },
    });
  });

  it('fills in canonical error mapping when the upstream body is empty', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(null, {
        status: 503,
      });
    }) as typeof fetch;

    const clients = createInternalServiceClients({
      gateway: 'http://gateway.test',
      identityAccess: 'http://identity.test',
      knowledgeRead: 'http://read.test',
      knowledgeWrite: 'http://write.test',
      candidateIngestion: 'http://candidate.test',
      review: 'http://review.test',
      governanceReview: 'http://review.test',
      jobRuntime: 'http://job.test',

      cronScheduler: 'http://cron.test',
    });

    const response = await clients.jobRuntime.getQueueStatus();
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      error: 'Internal service unavailable',
      kind: 'unavailable',
    });
  });

  it('forwards distributed correlation headers without inventing aliases', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        'Content-Type': 'application/json',
        'x-request-id': 'req-hop-1',
        'x-trace-id': 'trace-hop-1',
        'x-correlation-id': 'corr-hop-1',
      });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const clients = createInternalServiceClients({
      gateway: 'http://gateway.test',
      identityAccess: 'http://identity.test',
      knowledgeRead: 'http://read.test',
      knowledgeWrite: 'http://write.test',
      candidateIngestion: 'http://candidate.test',
      review: 'http://review.test',
      governanceReview: 'http://review.test',
      jobRuntime: 'http://job.test',

      cronScheduler: 'http://cron.test',
    });

    const response = await clients.knowledgeWrite.updateEntry(
      'entry-1',
      { updates: { title: 'updated' }, actorId: 'user-1' },
      {
        headers: {
          'x-request-id': 'req-hop-1',
          'x-trace-id': 'trace-hop-1',
          'x-correlation-id': 'corr-hop-1',
        },
      },
    );

    expect(response).toEqual({
      status: 200,
      body: { ok: true },
    });
  });

  it('keeps W3C trace propagation and removes custom span headers', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        'Content-Type': 'application/json',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00',
        'x-trace-id': 'trace-hop-2',
      });
      expect(init?.headers).not.toHaveProperty('x-trapmap-span-id');
      expect(init?.headers).not.toHaveProperty('x-trapmap-parent-span-id');
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const clients = createInternalServiceClients({
      gateway: 'http://gateway.test',
      identityAccess: 'http://identity.test',
      knowledgeRead: 'http://read.test',
      knowledgeWrite: 'http://write.test',
      candidateIngestion: 'http://candidate.test',
      review: 'http://review.test',
      governanceReview: 'http://review.test',
      jobRuntime: 'http://job.test',

      cronScheduler: 'http://cron.test',
    });

    const response = await clients.knowledgeWrite.publishCandidateResult(
      {
        candidateId: 'candidate-2',
        actorId: 'user-2',
        result: { decision: 'publish' },
      },
      {
        headers: {
          traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00',
          'x-trace-id': 'trace-hop-2',
        },
      },
    );

    expect(response).toEqual({
      status: 200,
      body: { ok: true },
    });

    const snapshot = await getDistributedInternalObservabilitySnapshot();
    expect(snapshot.counters.trapmap_runtime_internal_hops_total).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: 1,
          labels: expect.objectContaining({
            service_name: 'gateway',
            transport: 'http',
          }),
        }),
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// Task C2: resilient wrapper (breaker + idempotent retry + timeout budgets)
// ---------------------------------------------------------------------------

import {
  resolveInternalTimeoutMs,
  serviceNameForInternalHost,
} from '@trapmap/host-distributed/config/index.js';

describe('C2 resilient internal client', () => {
  function stubFetchSequence(responses: Array<{ status: number; body?: unknown }>) {
    const fetchMock = vi.fn(async () => {
      const next = responses.shift() ?? { status: 503 };
      return new Response(JSON.stringify(next.body ?? { error: 't', kind: 'unavailable' }), {
        status: next.status,
        headers: { 'content-type': 'application/json' },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;
    return fetchMock;
  }

  function clientsFor(host: string) {
    return createInternalServiceClients({
      gateway: `http://${host}`,
      identityAccess: `http://${host}`,
      knowledgeRead: `http://${host}`,
      knowledgeWrite: `http://${host}`,
      candidateIngestion: `http://${host}`,
      review: `http://${host}`,
      governanceReview: `http://${host}`,
      jobRuntime: `http://${host}`,
      cronScheduler: `http://${host}`,
    });
  }

  it('retries GET on transient 503 when TRAPMAP_INTERNAL_RETRY_MAX_ATTEMPTS allows', async () => {
    vi.stubEnv('TRAPMAP_INTERNAL_RETRY_MAX_ATTEMPTS', '3');
    const fetchMock = stubFetchSequence([{ status: 503 }, { status: 200, body: { ok: true } }]);
    const clients = clientsFor('retry-get.test');

    await expect(clients.knowledgeRead.getById('entry-1')).resolves.toEqual({
      status: 200,
      body: { ok: true },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-idempotent POST even when retries are enabled', async () => {
    vi.stubEnv('TRAPMAP_INTERNAL_RETRY_MAX_ATTEMPTS', '3');
    const fetchMock = stubFetchSequence([{ status: 503 }]);
    const clients = clientsFor('post-noretry.test');

    await expect(
      clients.identityAccess.login({ handle: 'a', password: 'b' }),
    ).resolves.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns transient responses unchanged when retry is disabled by default', async () => {
    process.env.TRAPMAP_INTERNAL_RETRY_MAX_ATTEMPTS = undefined;
    const fetchMock = stubFetchSequence([{ status: 503 }]);
    const clients = clientsFor('default-single.test');

    await expect(clients.knowledgeRead.getById('entry-1')).resolves.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('opens the breaker after consecutive failures and short-circuits with zero network calls', async () => {
    vi.stubEnv('TRAPMAP_INTERNAL_BREAKER_THRESHOLD', '1');
    vi.stubEnv('TRAPMAP_INTERNAL_BREAKER_COOLDOWN_MS', '60000');
    const fetchMock = stubFetchSequence([{ status: 503 }]);
    const clients = clientsFor('breaker.test');

    // First call fails transiently and trips the breaker (threshold=1).
    await expect(clients.knowledgeRead.getById('entry-1')).resolves.toMatchObject({ status: 503 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Second call is short-circuited: no fetch, canonical unavailable envelope.
    await expect(clients.knowledgeRead.getById('entry-2')).resolves.toEqual({
      status: 503,
      body: { error: 'Internal service unavailable', kind: 'unavailable' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps internal hosts to service names and parses timeout overrides', () => {
    expect(serviceNameForInternalHost('knowledge-read')).toBe('knowledge-read');
    expect(serviceNameForInternalHost('candidate-worker')).toBe('candidate-ingestion');
    expect(serviceNameForInternalHost('unknown-host.example')).toBeUndefined();

    expect(
      resolveInternalTimeoutMs({ TRAPMAP_KNOWLEDGE_READ_TIMEOUT_MS: '2500' }, 'knowledge-read'),
    ).toBe(2500);
    expect(
      resolveInternalTimeoutMs({ TRAPMAP_KNOWLEDGE_READ_TIMEOUT_MS: 'bad' }, 'knowledge-read'),
    ).toBeUndefined();
    expect(resolveInternalTimeoutMs({}, 'gateway')).toBeUndefined();
  });
});

describe('C3 trace context propagation', () => {
  function captureHeaders() {
    let captured: Record<string, unknown> = {};
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      captured = { ...(init?.headers as Record<string, unknown>) };
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;
    return () => captured;
  }

  async function readClient() {
    const { createInternalServiceClients } = await import('./internal-client.js');
    return createInternalServiceClients({
      gateway: 'http://trace.test',
      identityAccess: 'http://trace.test',
      knowledgeRead: 'http://trace.test',
      knowledgeWrite: 'http://trace.test',
      candidateIngestion: 'http://trace.test',
      review: 'http://trace.test',
      governanceReview: 'http://trace.test',
      jobRuntime: 'http://trace.test',
      cronScheduler: 'http://trace.test',
    });
  }

  it('generates x-request-id and a valid traceparent when the caller provides none', async () => {
    const getHeaders = captureHeaders();
    const clients = await readClient();
    await clients.knowledgeRead.getById('entry-9');
    const headers = getHeaders();
    expect(typeof headers['x-request-id']).toBe('string');
    expect(String(headers['x-request-id'])).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(String(headers.traceparent)).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
  });

  it('forwards caller traceparent/tracestate/x-request-id verbatim on the hop', async () => {
    const getHeaders = captureHeaders();
    const clients = await readClient();
    await clients.knowledgeWrite.publishCandidateResult(
      { candidateId: 'c-1', actorId: 'user-1', result: { decision: 'publish' } },
      {
        headers: {
          traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
          tracestate: 'acme=1',
          'x-request-id': 'req-c3-forward',
        },
      },
    );
    const headers = getHeaders();
    expect(headers['x-request-id']).toBe('req-c3-forward');
    expect(headers.tracestate).toBe('acme=1');
    expect(String(headers.traceparent)).toContain('4bf92f3577b34da6a3ce929d0e0e4736');
  });
});

describe('knowledgeRead.searchByContent skill lookup client', () => {
  function skillClients() {
    return createInternalServiceClients({
      gateway: 'http://gateway.test',
      identityAccess: 'http://identity.test',
      knowledgeRead: 'http://read.test',
      knowledgeWrite: 'http://write.test',
      candidateIngestion: 'http://candidate.test',
      review: 'http://review.test',
      governanceReview: 'http://review.test',
      jobRuntime: 'http://job.test',
      cronScheduler: 'http://cron.test',
    });
  }

  it('posts { text, maxResults } to the skill search internal path and parses the schema', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('http://read.test/internal/retrieval/skills/search-by-content');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ text: 'postgres timeout', maxResults: 3 });
      return new Response(
        JSON.stringify({
          matches: [
            {
              artifactId: 'artifact-1',
              title: 'Postgres query timeout',
              slug: 'postgres-query-timeout',
              labels: ['postgres'],
              scope: 'global',
              requiredLevel: 1,
              sourceKind: 'skill-directory',
              score: 0.9,
              reason: 'matched text',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(
      skillClients().knowledgeRead.searchByContent({ text: 'postgres timeout', maxResults: 3 }),
    ).resolves.toEqual({
      status: 200,
      body: {
        matches: [
          {
            artifactId: 'artifact-1',
            title: 'Postgres query timeout',
            slug: 'postgres-query-timeout',
            labels: ['postgres'],
            scope: 'global',
            requiredLevel: 1,
            sourceKind: 'skill-directory',
            score: 0.9,
            reason: 'matched text',
          },
        ],
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('parses a body without matches into a defaulted empty matches array', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    ) as typeof fetch;

    await expect(
      skillClients().knowledgeRead.searchByContent({ text: 'nothing', maxResults: 5 }),
    ).resolves.toEqual({
      status: 200,
      body: { matches: [] },
    });
  });

  it('forwards non-2xx skill lookup responses as-is without schema parsing', async () => {
    globalThis.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'boom', kind: 'internal' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }),
    ) as typeof fetch;

    await expect(
      skillClients().knowledgeRead.searchByContent({ text: 'failing', maxResults: 5 }),
    ).resolves.toEqual({
      status: 500,
      body: { error: 'boom', kind: 'internal' },
    });
  });
});
