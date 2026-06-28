import { InvocationError, type ReviewPort } from '@trapmap/backend-core';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerGovernanceReviewRoutes } from './routes.js';

function createModule(overrides: Partial<ReviewPort> = {}): ReviewPort {
  return {
    approve: vi.fn(async () => ({ entryId: 'entry-1', lifecycleState: 'approved' as const })),
    reject: vi.fn(async () => ({ entryId: 'entry-1', lifecycleState: 'rejected' as const })),
    applyMaintenance: vi.fn(async () => ({ entryId: 'entry-1', action: 'refresh' })),
    applyDecay: vi.fn(async () => ({ entryId: 'entry-1', action: 'suppress' })),
    reviewArtifact: vi.fn(async () => undefined),
    submitFeedback: vi.fn(async () => ({ feedbackId: 'feedback-1' })),
    ...overrides,
  };
}

async function buildApp(module: ReviewPort) {
  const app = Fastify();
  registerGovernanceReviewRoutes(app, module);
  await app.ready();
  return app;
}

describe('service-governance-review routes', () => {
  it('routes governance decisions and feedback through the module', async () => {
    const module = createModule();
    const app = await buildApp(module);

    const maintenance = await app.inject({
      method: 'POST',
      url: '/internal/review/maintenance',
      payload: { entryId: 'entry-1', actorId: 'user-1', action: 'refresh' },
    });
    expect(maintenance.statusCode).toBe(200);
    expect(module.applyMaintenance).toHaveBeenCalledWith({
      entryId: 'entry-1',
      actorId: 'user-1',
      action: 'refresh',
    });

    const feedback = await app.inject({
      method: 'POST',
      url: '/internal/feedback',
      payload: {
        entryId: 'entry-1',
        problemType: 'accuracy',
        description: 'incorrect remediation',
        actorId: 'user-1',
      },
    });
    expect(feedback.statusCode).toBe(201);
    expect(module.submitFeedback).toHaveBeenCalledWith({
      entryId: 'entry-1',
      problemType: 'accuracy',
      description: 'incorrect remediation',
      actorId: 'user-1',
    });

    await app.close();
  });

  it('preserves invocation failure semantics for remote knowledge-write delegation', async () => {
    const module = createModule({
      applyMaintenance: vi.fn(async () => {
        throw InvocationError.timeout('knowledge-write timed out');
      }),
    });
    const app = await buildApp(module);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/review/maintenance',
      payload: { entryId: 'entry-1', actorId: 'user-1', action: 'refresh' },
    });

    expect(response.statusCode).toBe(504);
    expect(response.json()).toEqual({
      error: 'knowledge-write timed out',
      kind: 'timeout',
    });
    await app.close();
  });

  it('reports readiness and ownership for the governance-review owner-port path', async () => {
    const module = createModule();
    const app = Fastify();
    registerGovernanceReviewRoutes(app, module, {
      checkDependency: vi.fn(async () => ({ reachable: true })),
    });
    await app.ready();

    const readiness = await app.inject({
      method: 'GET',
      url: '/internal/readiness',
    });
    expect(readiness.statusCode).toBe(200);
    expect(readiness.json()).toMatchObject({
      ready: true,
      service: 'governance-review',
      finalAggregateMutation: 'delegated-to-knowledge-write',
      followUpDisposition: 'outbox-queue-workflow-async',
    });

    const ownership = await app.inject({
      method: 'GET',
      url: '/internal/ownership',
    });
    expect(ownership.statusCode).toBe(200);
    expect(ownership.json()).toMatchObject({
      service: 'governance-review',
      delegateTo: 'knowledge-write',
    });

    await app.close();
  });
});
