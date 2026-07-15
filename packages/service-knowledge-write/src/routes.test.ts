import { InvocationError, type KnowledgeWritePort } from '@trapmap/backend-core';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerKnowledgeWriteRoutes } from './routes.ts';

function createModule(overrides: Partial<KnowledgeWritePort> = {}): KnowledgeWritePort {
  return {
    submit: vi.fn(),
    updateEntry: vi.fn(),
    resubmit: vi.fn(),
    supersede: vi.fn(),
    createTrap: vi.fn(),
    approveReviewDecision: vi.fn(async () => ({
      entryId: 'entry-1',
      lifecycleState: 'approved' as const,
    })),
    rejectReviewDecision: vi.fn(async () => ({
      entryId: 'entry-1',
      lifecycleState: 'rejected' as const,
    })),
    applyMaintenanceDecision: vi.fn(async () => ({
      entryId: 'entry-1',
      action: 'refresh',
    })),
    applyDecayDecision: vi.fn(async () => ({
      entryId: 'entry-1',
      action: 'suppress',
    })),
    publishCandidateResult: vi.fn(async () => ({
      candidateId: 'candidate-1',
      entryId: 'entry-1',
    })),
    listTraps: vi.fn(async () => []),
    getTrap: vi.fn(async () => null),
    ...overrides,
  };
}

async function buildApp(module: KnowledgeWritePort) {
  const app = Fastify();
  registerKnowledgeWriteRoutes(app, module);
  await app.ready();
  return app;
}

describe('service-knowledge-write routes', () => {
  it('uses the trusted actor header for candidate publish and review lifecycle commands', async () => {
    const module = createModule();
    const app = await buildApp(module);

    const publish = await app.inject({
      method: 'POST',
      url: '/internal/candidates/publish',
      headers: { 'x-trapmap-actor-id': 'trusted-user' },
      payload: {
        candidateId: 'candidate-1',
        actorId: 'trusted-user',
        result: { decision: 'publish' },
      },
    });
    expect(publish.statusCode).toBe(200);
    expect(module.publishCandidateResult).toHaveBeenCalledWith({
      candidateId: 'candidate-1',
      actorId: 'trusted-user',
      result: { decision: 'publish' },
    });

    const maintenance = await app.inject({
      method: 'POST',
      url: '/internal/knowledge/maintenance',
      headers: { 'x-trapmap-actor-id': 'trusted-user' },
      payload: { entryId: 'entry-1', actorId: 'trusted-user', action: 'refresh' },
    });
    expect(maintenance.statusCode).toBe(200);
    expect(module.applyMaintenanceDecision).toHaveBeenCalledWith({
      entryId: 'entry-1',
      actorId: 'trusted-user',
      action: 'refresh',
    });

    const decay = await app.inject({
      method: 'POST',
      url: '/internal/knowledge/decay',
      headers: { 'x-trapmap-actor-id': 'trusted-user' },
      payload: { entryId: 'entry-1', actorId: 'trusted-user', action: 'suppress' },
    });
    expect(decay.statusCode).toBe(200);
    expect(module.applyDecayDecision).toHaveBeenCalledWith({
      entryId: 'entry-1',
      actorId: 'trusted-user',
      action: 'suppress',
    });

    await app.close();
  });

  it('rejects missing or spoofed body actors on command routes', async () => {
    const module = createModule();
    const app = await buildApp(module);

    const missing = await app.inject({
      method: 'POST',
      url: '/internal/knowledge/maintenance',
      payload: { entryId: 'entry-1', action: 'refresh' },
    });
    const spoofed = await app.inject({
      method: 'POST',
      url: '/internal/knowledge/maintenance',
      headers: { 'x-trapmap-actor-id': 'trusted-user' },
      payload: { entryId: 'entry-1', actorId: 'spoofed-user', action: 'refresh' },
    });

    expect(missing.statusCode).toBe(401);
    expect(spoofed.statusCode).toBe(403);
    expect(module.applyMaintenanceDecision).not.toHaveBeenCalled();
    await app.close();
  });

  it('preserves invocation failure semantics for remote callers', async () => {
    const module = createModule({
      publishCandidateResult: vi.fn(async () => {
        throw InvocationError.unavailable('knowledge-write unavailable');
      }),
    });
    const app = await buildApp(module);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/candidates/publish',
      headers: { 'x-trapmap-actor-id': 'user-1' },
      payload: {
        candidateId: 'candidate-1',
        actorId: 'user-1',
        result: { decision: 'publish' },
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: 'knowledge-write unavailable',
      kind: 'unavailable',
    });
    await app.close();
  });

  it('accepts rpc invoke envelope for the frozen remote command surface', async () => {
    const module = createModule();
    const app = await buildApp(module);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/rpc/knowledge-write',
      headers: { 'x-trapmap-actor-id': 'user-1' },
      payload: {
        method: 'publishCandidateResult',
        input: {
          candidateId: 'candidate-1',
          actorId: 'user-1',
          result: { decision: 'publish' },
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      result: { candidateId: 'candidate-1', entryId: 'entry-1' },
    });
    expect(module.publishCandidateResult).toHaveBeenCalledWith({
      candidateId: 'candidate-1',
      actorId: 'user-1',
      result: { decision: 'publish' },
    });

    await app.close();
  });

  it('exposes independent liveness, readiness, ownership, and operator diagnostics', async () => {
    const app = Fastify();
    registerKnowledgeWriteRoutes(app, createModule(), {
      checkDependency: vi.fn(async () => ({ reachable: true })),
      getOperatorStatus: vi.fn(async () => ({
        persistence: { status: 'healthy' },
        asyncFollowUp: { owner: 'job-runtime', outbox: { pending: 2, failed: 0 } },
        idempotency: { mechanism: 'task_queue.dedupe_key' },
      })),
    });
    await app.ready();

    const [live, ready, ownership, operator] = await Promise.all([
      app.inject({ method: 'GET', url: '/internal/live' }),
      app.inject({ method: 'GET', url: '/internal/ready' }),
      app.inject({ method: 'GET', url: '/internal/ownership' }),
      app.inject({ method: 'GET', url: '/internal/operator-status' }),
    ]);

    expect(live.statusCode).toBe(200);
    expect(ready.statusCode).toBe(200);
    expect(ownership.json()).toMatchObject({ service: 'knowledge-write' });
    expect(operator.json()).toMatchObject({
      service: 'knowledge-write',
      asyncFollowUp: { owner: 'job-runtime' },
      idempotency: { mechanism: 'task_queue.dedupe_key' },
    });
    await app.close();
  });

  it('reports a healthy dependency without an optional detail value', async () => {
    const app = Fastify();
    registerKnowledgeWriteRoutes(app, createModule(), {
      checkDependency: vi.fn(async () => ({ reachable: true })),
    });
    await app.ready();

    const response = await app.inject({ method: 'GET', url: '/internal/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      checks: { persistence: { status: 'ok', detail: null } },
    });
    await app.close();
  });
});
