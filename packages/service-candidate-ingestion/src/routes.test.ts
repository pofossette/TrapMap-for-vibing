import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { InvocationError, type CandidateIngestionPort } from '@trapmap/backend-core';
import { registerCandidateIngestionRoutes } from './routes.js';

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

async function buildApp(module: CandidateIngestionPort) {
  const app = Fastify();
  registerCandidateIngestionRoutes(app, module);
  await app.ready();
  return app;
}

describe('service-candidate-ingestion routes', () => {
  it('routes candidate resolution and publish commands through the module', async () => {
    const module = createModule();
    const app = await buildApp(module);

    const resolution = await app.inject({
      method: 'POST',
      url: '/internal/candidates/candidate-1/resolution',
      payload: { resolution: { decision: 'merge' }, actorId: 'user-1' },
    });
    expect(resolution.statusCode).toBe(200);
    expect(module.applyResolution).toHaveBeenCalledWith(
      'candidate-1',
      { decision: 'merge' },
      'user-1',
    );

    const publish = await app.inject({
      method: 'POST',
      url: '/internal/candidates/candidate-1/publish',
      payload: { result: { decision: 'publish' }, actorId: 'user-1' },
    });
    expect(publish.statusCode).toBe(200);
    expect(module.publishCandidateResult).toHaveBeenCalledWith(
      'candidate-1',
      { decision: 'publish' },
      'user-1',
    );

    await app.close();
  });

  it('preserves invocation failure semantics for remote knowledge-write delegation', async () => {
    const module = createModule({
      publishCandidateResult: vi.fn(async () => {
        throw InvocationError.timeout('knowledge-write timed out');
      }),
    });
    const app = await buildApp(module);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/candidates/candidate-1/publish',
      payload: { result: { decision: 'publish' }, actorId: 'user-1' },
    });

    expect(response.statusCode).toBe(504);
    expect(response.json()).toEqual({
      error: 'knowledge-write timed out',
      kind: 'timeout',
    });
    await app.close();
  });
});
