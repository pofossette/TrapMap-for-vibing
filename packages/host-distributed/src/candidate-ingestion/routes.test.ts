import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { CandidateIngestionPort } from '@trapmap/backend-core';
import { registerCandidateIngestionRoutes } from '@trapmap/service-candidate-ingestion';

function createModule(overrides: Partial<CandidateIngestionPort> = {}): CandidateIngestionPort {
  return {
    submit: vi.fn(async () => ({ candidateId: 'candidate-1' })),
    getById: vi.fn(async () => null),
    listByStatus: vi.fn(async () => []),
    applyResolution: vi.fn(async () => undefined),
    submitManualResult: vi.fn(async () => undefined),
    publishCandidateResult: vi.fn(async () => ({
      candidateId: 'candidate-1',
      entryId: 'entry-1',
    })),
    ...overrides,
  };
}

describe('distributed candidate-ingestion bridge', () => {
  it('re-exports service-owned candidate routes for host assembly', async () => {
    const module = createModule();
    const app = Fastify();
    registerCandidateIngestionRoutes(app, module);
    await app.ready();

    const response = await app.inject({
      method: 'POST',
      url: '/internal/candidates/candidate-1/publish',
      payload: { result: { decision: 'publish' }, actorId: 'user-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(module.publishCandidateResult).toHaveBeenCalledWith(
      'candidate-1',
      { decision: 'publish' },
      'user-1',
    );

    await app.close();
  });
});
