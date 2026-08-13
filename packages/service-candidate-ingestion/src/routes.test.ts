import {
  type CandidateIngestionPort,
  InvocationError,
  type RouteTestApp,
} from '@trapmap/backend-core';
import {
  type AdapterName,
  buildRouteTestApp,
} from '@trapmap/backend-core/testing/route-test-app.js';
import { describe, expect, it, vi } from 'vitest';
import { createCandidateIngestionRouteDefs } from './routes.ts';

const ADAPTERS: readonly AdapterName[] = ['fastify', 'nest'];

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

async function buildApp(
  module: CandidateIngestionPort,
  adapter: AdapterName,
): Promise<RouteTestApp> {
  return buildRouteTestApp(createCandidateIngestionRouteDefs(module), module, adapter);
}

describe.each(ADAPTERS)('service-candidate-ingestion routes (%s adapter)', (adapter) => {
  it('routes candidate resolution and publish commands through the trusted actor header', async () => {
    const module = createModule();
    const app = await buildApp(module, adapter);

    const resolution = await app.inject({
      method: 'POST',
      url: '/internal/candidates/candidate-1/resolution',
      headers: { 'x-trapmap-actor-id': 'user-1' },
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
      headers: { 'x-trapmap-actor-id': 'user-1' },
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

  it('rejects missing or spoofed actors for candidate mutations', async () => {
    const module = createModule();
    const app = await buildApp(module, adapter);

    const missingActor = await app.inject({
      method: 'POST',
      url: '/internal/candidates/candidate-1/manual-result',
      payload: { result: { decision: 'independent' } },
    });
    expect(missingActor.statusCode).toBe(401);
    expect(missingActor.json()).toEqual({ error: 'Trusted actor is required', kind: 'forbidden' });

    const spoofedActor = await app.inject({
      method: 'POST',
      url: '/internal/candidates/candidate-1/manual-result',
      headers: { 'x-trapmap-actor-id': 'user-1' },
      payload: { result: { decision: 'independent' }, actorId: 'user-2' },
    });
    expect(spoofedActor.statusCode).toBe(403);
    expect(spoofedActor.json()).toEqual({
      error: 'Actor does not match trusted identity',
      kind: 'forbidden',
    });
    expect(module.submitManualResult).not.toHaveBeenCalled();

    await app.close();
  });

  it('preserves the canonical internal error response for a null mutation body', async () => {
    const app = await buildApp(createModule(), adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/candidates/candidate-1/manual-result',
      headers: { 'x-trapmap-actor-id': 'user-1' },
      payload: null,
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toMatchObject({ error: 'Internal server error', kind: 'internal' });
    await app.close();
  });

  it('exposes candidate-ingestion as the owner of resolution command receipt', async () => {
    const module = createModule();
    const app = await buildApp(module, adapter);

    const health = await app.inject({
      method: 'GET',
      url: '/internal/health',
    });

    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({
      status: 'ok',
      service: 'candidate-ingestion',
    });

    await app.close();
  });

  it('preserves invocation failure semantics for remote knowledge-write delegation', async () => {
    const module = createModule({
      publishCandidateResult: vi.fn(async () => {
        throw InvocationError.timeout('knowledge-write timed out');
      }),
    });
    const app = await buildApp(module, adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/candidates/candidate-1/publish',
      headers: { 'x-trapmap-actor-id': 'user-1' },
      payload: { result: { decision: 'publish' }, actorId: 'user-1' },
    });

    expect(response.statusCode).toBe(504);
    expect(response.json()).toMatchObject({
      error: 'knowledge-write timed out',
      kind: 'timeout',
    });
    await app.close();
  });

  it('preserves the legacy unauthorized invocation status', async () => {
    const module = createModule({
      submit: vi.fn(async () => {
        throw new InvocationError('unauthorized', 'upstream identity is unavailable');
      }),
    });
    const app = await buildApp(module, adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/candidates',
      payload: { source: 'test' },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: 'upstream identity is unavailable',
      kind: 'unauthorized',
    });
    await app.close();
  });
});
