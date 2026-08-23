import {
  type GovernanceAsyncCommandPort,
  type GovernanceReviewAdminPort,
  InvocationError,
  type RouteTestApp,
  buildRouteTestApp,
} from '@trapmap/backend-core';
import type { AdapterName } from '@trapmap/backend-core/testing/route-test-app.js';
import { describe, expect, it, vi } from 'vitest';
import { type GovernanceReviewRouteDeps, createGovernanceReviewRouteDefs } from './routes.ts';

const ADAPTERS: readonly AdapterName[] = ['fastify', 'nest'];

function createModule(
  overrides: Partial<GovernanceReviewRouteDeps> = {},
): GovernanceReviewRouteDeps {
  return {
    approve: vi.fn(async () => ({ entryId: 'entry-1', lifecycleState: 'approved' as const })),
    reject: vi.fn(async () => ({ entryId: 'entry-1', lifecycleState: 'rejected' as const })),
    returnForCorrection: vi.fn(async () => ({
      entryId: 'entry-1',
      lifecycleState: 'submitted' as const,
    })),
    applyMaintenance: vi.fn(async () => ({ entryId: 'entry-1', action: 'refresh' })),
    applyDecay: vi.fn(async () => ({ entryId: 'entry-1', action: 'suppress' })),
    reviewArtifact: vi.fn(async () => undefined),
    submitFeedback: vi.fn(async () => ({ feedbackId: 'feedback-1' })),
    ...overrides,
  };
}

async function buildApp(
  module: GovernanceReviewRouteDeps,
  adapter: AdapterName,
): Promise<RouteTestApp> {
  return buildRouteTestApp(createGovernanceReviewRouteDefs(module), module, adapter);
}

describe.each(ADAPTERS)('service-governance-review routes (%s adapter)', (adapter) => {
  it('routes governance decisions and feedback through the module', async () => {
    const module = createModule();
    const app = await buildApp(module, adapter);

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
    const app = await buildApp(module, adapter);

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

  it('routes return-for-correction as its own command', async () => {
    const module = createModule();
    const app = await buildApp(module, adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/review/return-for-correction',
      payload: {
        entryId: 'entry-1',
        actorId: 'user-1',
        note: 'revise the boundary fields',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ entryId: 'entry-1', lifecycleState: 'submitted' });
    expect(module.returnForCorrection).toHaveBeenCalledWith({
      entryId: 'entry-1',
      actorId: 'user-1',
      note: 'revise the boundary fields',
    });
    expect(module.reject).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an untrusted feedback actor before invoking the governance module', async () => {
    const module = createModule();
    const app = await buildApp(module, adapter);

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
    const app = await buildApp(module, adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/review/maintenance',
      payload: { entryId: 'entry-1', actorId: 'user-1', action: 'refresh' },
    });

    expect(response.statusCode).toBe(504);
    expect(response.json()).toMatchObject({
      error: 'knowledge-write timed out',
      kind: 'timeout',
    });
    await app.close();
  });

  it('delegates trusted remediation reactivation jobs to the async command owner', async () => {
    const asyncCommands: GovernanceAsyncCommandPort = {
      reactivateRemediation: vi.fn(async () => undefined),
      exportBadcaseDraft: vi.fn(async () => undefined),
    };
    const app = await buildApp(createModule({ asyncCommands }), adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/feedback/async/remediation-reactivation',
      payload: {
        entryId: 'entry-1',
        entryType: 'trap',
        feedbackIds: ['feedback-1'],
        resolvedAt: '2026-07-19T00:00:00.000Z',
        resolvedByUserId: 'admin-1',
        notes: 'reactivate retrieval',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(asyncCommands.reactivateRemediation).toHaveBeenCalledWith({
      entryId: 'entry-1',
      entryType: 'trap',
      feedbackIds: ['feedback-1'],
      resolvedAt: '2026-07-19T00:00:00.000Z',
      resolvedByUserId: 'admin-1',
      notes: 'reactivate retrieval',
    });
    await app.close();
  });

  it('rejects async feedback routes when command wiring is unavailable', async () => {
    const app = await buildApp(createModule(), adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/feedback/async/badcase-export-draft',
      payload: {
        feedbackId: 'feedback-1',
        entryId: 'entry-1',
        entryType: 'trap',
        queryId: 'query-1',
        requestId: 'request-1',
        traceId: 'trace-1',
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: 'Governance async commands unavailable',
      kind: 'unavailable',
    });
    await app.close();
  });

  it('preserves invocation failure semantics for badcase export async routes', async () => {
    const asyncCommands: GovernanceAsyncCommandPort = {
      reactivateRemediation: vi.fn(async () => undefined),
      exportBadcaseDraft: vi.fn(async () => {
        throw InvocationError.conflict('Feedback does not match badcase export request');
      }),
    };
    const app = await buildApp(createModule({ asyncCommands }), adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/feedback/async/badcase-export-draft',
      payload: {
        feedbackId: 'feedback-1',
        entryId: 'entry-1',
        entryType: 'trap',
        queryId: 'query-1',
        requestId: null,
        traceId: null,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'Feedback does not match badcase export request',
      kind: 'conflict',
    });
    await app.close();
  });

  it('reports readiness and ownership for the governance-review owner-port path', async () => {
    const module = createModule({
      checkDependency: vi.fn(async () => ({ reachable: true })),
    });
    const app = await buildApp(module, adapter);

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
    const module = createModule({
      checkDependency: vi.fn(async () => ({ reachable: false, detail: 'knowledge-write timeout' })),
      getOperatorStatus: vi.fn(async () => ({
        persistence: { status: 'healthy' },
        delegatedOwner: { service: 'knowledge-write', status: 'unhealthy' },
        asyncFollowUp: { owner: 'job-runtime', queue: { pending: 1, dead: 0 } },
      })),
    });
    const app = await buildApp(module, adapter);

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
    const app = await buildApp(createModule({ admin }), adapter);

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

  it('enforces the strict remediation-complete contract and strips nothing', async () => {
    const completeRemediation = vi.fn(async () => ({ entryId: 'entry-1' }));
    const admin: GovernanceReviewAdminPort = {
      list: vi.fn(),
      stats: vi.fn(),
      batch: vi.fn(),
      listRemediation: vi.fn(),
      getRemediation: vi.fn(),
      completeRemediation,
    };
    const app = await buildApp(createModule({ admin }), adapter);

    const cleanBody = await app.inject({
      method: 'POST',
      url: '/internal/feedback/admin/remediation/entry-1/complete',
      headers: { 'x-trapmap-actor-id': 'admin-1' },
      payload: { notes: 'reindexed' },
    });
    expect(cleanBody.statusCode).toBe(200);
    expect(completeRemediation).toHaveBeenCalledWith({
      actorId: 'admin-1',
      entryId: 'entry-1',
      command: { notes: 'reindexed' },
    });

    const unknownKey = await app.inject({
      method: 'POST',
      url: '/internal/feedback/admin/remediation/entry-1/complete',
      headers: { 'x-trapmap-actor-id': 'admin-1' },
      payload: { notes: 'reindexed', unexpectedKey: 'rejected' },
    });
    expect(unknownKey.statusCode).toBe(400);
    expect(completeRemediation).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('serves the retrieval projection through an internal governance-review route', async () => {
    const governanceRetrievalProjection = {
      listFeedback: vi.fn(async () => [
        {
          id: 'feedback-1',
          entryId: 'entry-1',
          entryType: 'trap',
          problemType: 'incorrect',
          description: 'wrong answer',
          context: null,
          querySeed: null,
          queryId: null,
          routeFamily: null,
          failureClassification: null,
          expectedCorrection: null,
          selectedResultSnapshot: null,
          submittedAt: '2026-07-18T00:00:00.000Z',
          submittedByUserId: 'user-1',
          submittedByHandle: 'alice',
          status: 'new',
          adminNotes: null,
          resolvedAt: null,
          resolvedByUserId: null,
          triggeredTransition: null,
          remediationStatus: null,
          remediationOpenedAt: null,
          remediationOpenedByUserId: null,
          remediationResolvedAt: null,
          remediationResolvedByUserId: null,
          customAnswers: null,
          createdAt: '2026-07-18T00:00:00.000Z',
          updatedAt: '2026-07-18T00:00:00.000Z',
        },
      ]),
      listConflicts: vi.fn(async () => [
        {
          id: 'conflict-1',
          entryIdA: 'entry-1',
          entryIdB: 'entry-2',
          conflictType: 'contradictory' as const,
          context: 'Opposite instructions',
          problemOverlapScore: 0.9,
          solutionDiffScore: 0.9,
          detectedAt: '2026-07-18T00:00:00.000Z',
        },
      ]),
    };
    const app = await buildApp(createModule({ governanceRetrievalProjection }), adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/governance-review/retrieval-projection',
      payload: { entryIds: ['entry-1'] },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      feedback: [{ id: 'feedback-1' }],
      conflicts: [{ id: 'conflict-1' }],
    });
    expect(governanceRetrievalProjection.listFeedback).toHaveBeenCalledWith();
    expect(governanceRetrievalProjection.listConflicts).toHaveBeenCalledWith(['entry-1']);
    await app.close();
  });
});
