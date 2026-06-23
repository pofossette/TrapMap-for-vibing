import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { InvocationError, type ReviewPort } from '@trapmap/backend-core';
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
});
