import { InvocationError, type ReviewPort } from '@trapmap/backend-core';
import { registerGovernanceReviewRoutes } from '@trapmap/service-governance-review';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

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

describe('governance-review internal routes', () => {
  it('routes maintenance and decay commands through the module', async () => {
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

    const decay = await app.inject({
      method: 'POST',
      url: '/internal/review/decay',
      payload: { entryId: 'entry-1', actorId: 'user-1', action: 'suppress' },
    });
    expect(decay.statusCode).toBe(200);
    expect(module.applyDecay).toHaveBeenCalledWith({
      entryId: 'entry-1',
      actorId: 'user-1',
      action: 'suppress',
    });

    await app.close();
  });

  it('returns mapped upstream timeout errors unchanged', async () => {
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
