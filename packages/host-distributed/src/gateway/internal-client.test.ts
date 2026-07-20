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

    const snapshot = getDistributedInternalObservabilitySnapshot();
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
