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

  it('propagates traceparent and internal hop span headers for distributed tracing', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        'Content-Type': 'application/json',
        traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-00',
        'x-trace-id': 'trace-hop-2',
      });
      expect(init?.headers).toHaveProperty('x-trapmap-span-id');
      expect(init?.headers).toHaveProperty('x-trapmap-parent-span-id');
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
