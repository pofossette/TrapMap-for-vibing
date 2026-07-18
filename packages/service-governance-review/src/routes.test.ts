import {
  InvocationError,
  type GovernanceReviewAdminPort,
  type ReviewPort,
} from '@trapmap/backend-core';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerGovernanceReviewRoutes } from './routes.ts';

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
      headers: { 'x-trapmap-actor-id': 'user-1' },
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

  it('executes conflict detection through the governance owner workflow', async () => {
    const detectConflicts = vi.fn(async () => ({ detectedCount: 1 }));
    const module = {
      ...createModule(),
      conflictWorkflow: { detectConflicts },
    };
    const app = await buildApp(module as never);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/conflicts/detect',
      payload: { entryId: 'entry-1', sourceEventId: 'event-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ detectedCount: 1 });
    expect(detectConflicts).toHaveBeenCalledWith({ entryId: 'entry-1' });

    await app.close();
  });

  it('rejects an untrusted feedback actor before invoking the governance module', async () => {
    const module = createModule();
    const app = await buildApp(module);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/feedback',
      payload: {
        entryId: 'entry-1',
        entryType: 'trap',
        problemType: 'incorrect',
        description: 'This result contains an incorrect remediation.',
        actorId: 'spoofed-user',
      },
    });

    expect(response.statusCode).toBe(401);
    expect(module.submitFeedback).not.toHaveBeenCalled();
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

  it('keeps operator diagnostics available when the delegated owner is unhealthy', async () => {
    const app = Fastify();
    registerGovernanceReviewRoutes(app, createModule(), {
      checkDependency: vi.fn(async () => ({ reachable: false, detail: 'knowledge-write timeout' })),
      getOperatorStatus: vi.fn(async () => ({
        persistence: { status: 'healthy' },
        delegatedOwner: { service: 'knowledge-write', status: 'unhealthy' },
        asyncFollowUp: { owner: 'job-runtime', queue: { pending: 1, dead: 0 } },
      })),
    });
    await app.ready();

    const [live, ready, operator] = await Promise.all([
      app.inject({ method: 'GET', url: '/internal/live' }),
      app.inject({ method: 'GET', url: '/internal/ready' }),
      app.inject({ method: 'GET', url: '/internal/operator-status' }),
    ]);

    expect(live.statusCode).toBe(200);
    expect(ready.statusCode).toBe(503);
    expect(operator.statusCode).toBe(200);
    expect(operator.json()).toMatchObject({
      service: 'governance-review',
      delegatedOwner: { status: 'unhealthy' },
    });
    await app.close();
  });

  it('forwards the feedback admin list query with the trusted actor', async () => {
    const admin: GovernanceReviewAdminPort = {
      list: vi.fn(async () => ({ items: [], total: 0 })),
      stats: vi.fn(),
      batch: vi.fn(),
      listRemediation: vi.fn(),
      getRemediation: vi.fn(),
      completeRemediation: vi.fn(),
    };
    const app = await buildApp({ ...createModule(), admin } as never);

    const response = await app.inject({
      method: 'GET',
      url: '/internal/feedback/admin?status=new&limit=10',
      headers: { 'x-trapmap-actor-id': 'admin-1' },
    });

    expect(response.statusCode).toBe(200);
    expect(admin.list).toHaveBeenCalledWith({
      actorId: 'admin-1',
      query: { status: ['new'], limit: 10 },
    });
    await app.close();
  });
});
