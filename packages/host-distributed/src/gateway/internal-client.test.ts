import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInternalServiceClients } from './internal-client.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
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
});
