// fallow-ignore-file complexity -- admin route tests keep 200/401/400/pagination/filtering/governance assertions co-located
// fallow-ignore-file code-duplication -- admin fixtures mirror web-panel helpers (applyReviewQueueQuery, applyActivityFeedQuery)
import {
  buildRouteTestApp,
  type GovernanceAsyncCommandPort,
  type GovernanceReviewAdminPort,
  InvocationError,
  type RouteTestApp,
} from '@trapmap/backend-core';
import type { AdapterName } from '@trapmap/backend-core/testing/route-test-app.js';
import type { KnowledgeEntry } from '@trapmap/contracts';
import { describe, expect, it, vi } from 'vitest';
import {
  createGovernanceAdminRouteDefs,
  createGovernanceReviewRouteDefs,
  type GovernanceReviewRouteDeps,
} from '../src/routes.ts';

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

// ---------------------------------------------------------------------------
// Admin RouteDefs — real admin surface via T2 shared Zod
// ---------------------------------------------------------------------------

const adminActor = { id: 'admin-1', handle: 'admin', securityLevel: 9 };

function createAdminEntry(overrides: Partial<KnowledgeEntry> = {}): KnowledgeEntry {
  const actor = { id: 'user-1', handle: 'alice', securityLevel: 5 };
  const submittedAt = '2026-06-01T10:00:00.000Z';
  const revision = {
    revision: 1,
    submittedAt,
    submittedBy: actor,
    shortcut: 'Runtime candidate',
    detail: 'Needs governance review',
    labels: ['runtime'],
    reviewNotes: [],
  };
  return {
    id: 'entry-1',
    teamId: null,
    scope: 'project',
    labels: ['runtime'],
    shortcut: 'Runtime candidate',
    detail: 'Needs governance review',
    requiredLevel: 3,
    lifecycleState: 'submitted',
    owner: actor,
    latestRevision: revision,
    history: [revision],
    metadata: {
      scopeLabel: 'project-knowledge',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: 'source-1',
      latestSubmittedAt: submittedAt,
      latestReviewedAt: null,
      latestDecision: null,
    },
    latestSubmission: {
      id: 'source-1',
      revision: 1,
      submittedAt,
      submittedBy: actor,
      lifecycleState: 'submitted',
      resubmissionOf: null,
      agentReview: null,
      reviewerDecision: null,
      reviewNotes: [],
    },
    submissionHistory: [],
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    boundary: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    remediation: null,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:01:00.000Z',
    ...overrides,
  };
}

function createAdminActivityEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt-1',
    actor: 'reviewer@trapmap.local',
    title: 'Review approved',
    description: 'Review queue handoff completed for candidate c-204.',
    timestamp: '2026-06-19T09:58:00.000Z',
    typeLabel: 'Decision',
    relatedReviewId: 'rev-201',
    tone: 'success' as const,
    ...overrides,
  };
}

describe.each(ADAPTERS)('service-governance-review admin routes (%s adapter)', (adapter) => {
  it('serves admin review queue 200 with pagination, filtering, risk scoring and governance', async () => {
    const high = createAdminEntry({
      id: 'entry-high',
      teamId: null,
      requiredLevel: 1,
      shortcut: 'Schema drift candidate',
      agentReview: {
        status: 'agent-rejected',
        duplicateRisk: 'high',
        correctnessRisk: 'high',
        completenessRisk: 'high',
        checkedAt: '2026-06-03T10:00:00.000Z',
        notes: [],
      },
      latestSubmission: {
        id: 'candidate-ingestion',
        revision: 1,
        submittedAt: '2026-06-03T10:00:00.000Z',
        submittedBy: adminActor,
        lifecycleState: 'submitted',
        resubmissionOf: null,
        agentReview: null,
        reviewerDecision: null,
        reviewNotes: [],
      },
      createdAt: '2026-06-03T10:00:00.000Z',
    });
    const medium = createAdminEntry({
      id: 'entry-medium',
      teamId: null,
      requiredLevel: 1,
      shortcut: 'Network policy candidate',
      createdAt: '2026-06-02T10:00:00.000Z',
      agentReview: {
        status: 'agent-pass',
        duplicateRisk: 'medium',
        correctnessRisk: 'medium',
        completenessRisk: 'low',
        checkedAt: '2026-06-02T10:00:00.000Z',
        notes: [],
      },
    });
    const low = createAdminEntry({
      id: 'entry-low',
      teamId: null,
      requiredLevel: 1,
      shortcut: 'Unrelated low',
      createdAt: '2026-06-04T10:00:00.000Z',
    });
    const teamScoped = createAdminEntry({
      id: 'entry-team',
      teamId: 'team-999',
      requiredLevel: 1,
      shortcut: 'Team 999 candidate',
    });
    const highSecurity = createAdminEntry({
      id: 'entry-secure',
      teamId: null,
      requiredLevel: 9,
      shortcut: 'Secure candidate',
    });

    const module = createModule({
      listReviewEntries: vi.fn(async () => [high, medium, low, teamScoped, highSecurity]),
    });
    const app = await buildRouteTestApp(createGovernanceAdminRouteDefs(module), module, adapter);

    // 200 — highest-risk sort, governance filters team and securityLevel
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/reviews?sort=highest-risk&limit=10',
      headers: { 'x-trapmap-actor-id': 'admin-1', 'x-trapmap-security-level': '9' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.filteredTotal).toBe(3);
    expect(body.total).toBe(3);
    // Governance: teamScoped and highSecurity should be filtered out (team mismatch, securityLevel insufficient)
    expect(body.items.map((item: { entry: KnowledgeEntry }) => item.entry.id)).toEqual([
      'entry-high',
      'entry-medium',
      'entry-low',
    ]);
    // Highest-risk first
    expect(body.items[0].entry.id).toBe('entry-high');

    // Search filtering
    const search = await app.inject({
      method: 'GET',
      url: '/api/admin/reviews?search=Network&limit=10',
      headers: { 'x-trapmap-actor-id': 'admin-1', 'x-trapmap-security-level': '9' },
    });
    expect(search.json().items).toHaveLength(1);
    expect(search.json().items[0].entry.id).toBe('entry-medium');

    // RiskLevel filtering — high
    const riskHigh = await app.inject({
      method: 'GET',
      url: '/api/admin/reviews?riskLevel=high&limit=10',
      headers: { 'x-trapmap-actor-id': 'admin-1', 'x-trapmap-security-level': '9' },
    });
    expect(riskHigh.json().items).toHaveLength(1);
    expect(riskHigh.json().items[0].entry.id).toBe('entry-high');

    // Pagination via cursor
    const page1 = await app.inject({
      method: 'GET',
      url: '/api/admin/reviews?limit=2&sort=oldest',
      headers: { 'x-trapmap-actor-id': 'admin-1', 'x-trapmap-security-level': '9' },
    });
    expect(page1.json().items).toHaveLength(2);
    expect(page1.json().nextCursor).toBe('2');
    const page2 = await app.inject({
      method: 'GET',
      url: `/api/admin/reviews?limit=2&sort=oldest&cursor=${page1.json().nextCursor}`,
      headers: { 'x-trapmap-actor-id': 'admin-1', 'x-trapmap-security-level': '9' },
    });
    expect(page2.json().items).toHaveLength(1);
    expect(page2.json().nextCursor).toBeNull();

    // System-admin bypasses team filter
    const sysAdmin = await app.inject({
      method: 'GET',
      url: '/api/admin/reviews?limit=10',
      headers: {
        'x-trapmap-actor-id': 'admin-1',
        'x-trapmap-subject-type': 'system-admin',
        'x-trapmap-security-level': '10',
      },
    });
    expect(sysAdmin.json().total).toBe(5);

    await app.close();
  });

  it('enforces 401 for admin review queue when actor missing', async () => {
    const module = createModule({ listReviewEntries: vi.fn(async () => []) });
    const app = await buildRouteTestApp(createGovernanceAdminRouteDefs(module), module, adapter);
    const res = await app.inject({ method: 'GET', url: '/api/admin/reviews?limit=10' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('validates admin review queue query — 400 on unknown sort / riskLevel / extra fields', async () => {
    const module = createModule({ listReviewEntries: vi.fn(async () => []) });
    const app = await buildRouteTestApp(createGovernanceAdminRouteDefs(module), module, adapter);
    const headers = { 'x-trapmap-actor-id': 'admin-1' };
    expect(
      (await app.inject({ method: 'GET', url: '/api/admin/reviews?sort=invalid', headers }))
        .statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: '/api/admin/reviews?riskLevel=critical', headers }))
        .statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: '/api/admin/reviews?unknownField=x', headers }))
        .statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: '/api/admin/reviews?limit=101', headers }))
        .statusCode,
    ).toBe(400);
    await app.close();
  });

  it('serves admin review detail 200, 404 governance and 401', async () => {
    const entry = createAdminEntry({ id: 'entry-1', teamId: null, requiredLevel: 1 });
    const teamEntry = createAdminEntry({ id: 'entry-team', teamId: 'team-999', requiredLevel: 1 });
    const module = createModule({
      getReviewEntry: vi.fn(async (id: string) =>
        id === 'entry-1' ? entry : id === 'entry-team' ? teamEntry : null,
      ),
      listReviewEntries: vi.fn(async () => [entry, teamEntry]),
    });
    const app = await buildRouteTestApp(createGovernanceReviewRouteDefs(module), module, adapter);

    const ok = await app.inject({
      method: 'GET',
      url: '/api/admin/reviews/entry-1',
      headers: { 'x-trapmap-actor-id': 'admin-1', 'x-trapmap-security-level': '9' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().entry.id).toBe('entry-1');

    const notFound = await app.inject({
      method: 'GET',
      url: '/api/admin/reviews/missing',
      headers: { 'x-trapmap-actor-id': 'admin-1', 'x-trapmap-security-level': '9' },
    });
    expect(notFound.statusCode).toBe(404);

    const teamFiltered = await app.inject({
      method: 'GET',
      url: '/api/admin/reviews/entry-team',
      headers: {
        'x-trapmap-actor-id': 'admin-1',
        'x-trapmap-security-level': '9',
        'x-trapmap-team-id': 'team-1',
      },
    });
    expect(teamFiltered.statusCode).toBe(404);

    const noAuth = await app.inject({ method: 'GET', url: '/api/admin/reviews/entry-1' });
    expect(noAuth.statusCode).toBe(401);

    await app.close();
  });

  it('serves admin activity feed 200 with actor/type/search/time filtering and pagination, plus 401/400', async () => {
    const events = [
      createAdminActivityEvent({
        id: 'evt-1',
        actor: 'reviewer@trapmap.local',
        title: 'Review approved',
        typeLabel: 'Decision',
        timestamp: '2026-06-19T09:58:00.000Z',
      }),
      createAdminActivityEvent({
        id: 'evt-2',
        actor: 'operator@trapmap.local',
        title: 'Payload edited',
        typeLabel: 'Intervention',
        timestamp: '2026-06-19T09:42:00.000Z',
      }),
      createAdminActivityEvent({
        id: 'evt-3',
        actor: 'candidate-bot',
        title: 'Candidate ingested',
        typeLabel: 'System Ingestion',
        timestamp: '2026-06-19T09:20:00.000Z',
      }),
    ];
    const module = createModule({ listActivityEvents: vi.fn(async () => events) });
    const app = await buildRouteTestApp(createGovernanceAdminRouteDefs(module), module, adapter);

    const all = await app.inject({
      method: 'GET',
      url: '/api/admin/activity?limit=10',
      headers: { 'x-trapmap-actor-id': 'admin-1' },
    });
    expect(all.statusCode).toBe(200);
    expect(all.json().events).toHaveLength(3);
    expect(all.json().filteredTotal).toBe(3);

    const byActor = await app.inject({
      method: 'GET',
      url: '/api/admin/activity?actor=reviewer&limit=10',
      headers: { 'x-trapmap-actor-id': 'admin-1' },
    });
    expect(byActor.json().events).toHaveLength(1);

    const byType = await app.inject({
      method: 'GET',
      url: '/api/admin/activity?type=decision&limit=10',
      headers: { 'x-trapmap-actor-id': 'admin-1' },
    });
    expect(byType.json().events).toHaveLength(1);

    const bySearch = await app.inject({
      method: 'GET',
      url: '/api/admin/activity?search=payload&limit=10',
      headers: { 'x-trapmap-actor-id': 'admin-1' },
    });
    expect(bySearch.json().events).toHaveLength(1);

    const byTime = await app.inject({
      method: 'GET',
      url: '/api/admin/activity?from=2026-06-19T09:30:00.000Z&to=2026-06-19T10:00:00.000Z&limit=10',
      headers: { 'x-trapmap-actor-id': 'admin-1' },
    });
    expect(byTime.json().events).toHaveLength(2);

    const paged1 = await app.inject({
      method: 'GET',
      url: '/api/admin/activity?limit=2',
      headers: { 'x-trapmap-actor-id': 'admin-1' },
    });
    expect(paged1.json().events).toHaveLength(2);
    expect(paged1.json().nextCursor).toBe('2');
    const paged2 = await app.inject({
      method: 'GET',
      url: `/api/admin/activity?limit=2&cursor=${paged1.json().nextCursor}`,
      headers: { 'x-trapmap-actor-id': 'admin-1' },
    });
    expect(paged2.json().events).toHaveLength(1);

    const noAuth = await app.inject({ method: 'GET', url: '/api/admin/activity?limit=10' });
    expect(noAuth.statusCode).toBe(401);

    const bad = await app.inject({
      method: 'GET',
      url: '/api/admin/activity?type=invalid&limit=10',
      headers: { 'x-trapmap-actor-id': 'admin-1' },
    });
    expect(bad.statusCode).toBe(400);
    const badRange = await app.inject({
      method: 'GET',
      url: '/api/admin/activity?from=2026-06-30T00:00:00.000Z&to=2026-06-01T00:00:00.000Z&limit=10',
      headers: { 'x-trapmap-actor-id': 'admin-1' },
    });
    expect(badRange.statusCode).toBe(400);

    await app.close();
  });

  it('routes admin review decision POST with 200, 401, 400', async () => {
    const module = createModule();
    const app = await buildRouteTestApp(createGovernanceReviewRouteDefs(module), module, adapter);

    const approve = await app.inject({
      method: 'POST',
      url: '/api/admin/reviews/entry-1/decision',
      headers: { 'x-trapmap-actor-id': 'admin-1' },
      payload: { decision: 'approve', notes: 'looks good' },
    });
    expect(approve.statusCode).toBe(200);
    expect(module.approve).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: 'entry-1', actorId: 'admin-1' }),
    );

    const ret = await app.inject({
      method: 'POST',
      url: '/api/admin/reviews/entry-1/decision',
      headers: { 'x-trapmap-actor-id': 'admin-1' },
      payload: { decision: 'return-for-correction', note: 'fix boundary' },
    });
    expect(ret.statusCode).toBe(200);
    expect(module.returnForCorrection).toHaveBeenCalled();

    const noAuth = await app.inject({
      method: 'POST',
      url: '/api/admin/reviews/entry-1/decision',
      payload: { decision: 'approve' },
    });
    expect(noAuth.statusCode).toBe(401);

    const bad = await app.inject({
      method: 'POST',
      url: '/api/admin/reviews/entry-1/decision',
      headers: { 'x-trapmap-actor-id': 'admin-1' },
      payload: { decision: 'invalid' },
    });
    expect(bad.statusCode).toBe(400);

    await app.close();
  });
});
