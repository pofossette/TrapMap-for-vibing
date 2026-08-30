// fallow-ignore-file complexity -- admin artifact tests co-locate pagination/filtering/governance assertions
// fallow-ignore-file code-duplication -- artifact fixtures mirror panel applyArtifactQuery
import { InvocationError, type KnowledgeWritePort } from '@trapmap/backend-core';
import {
  type AdapterName,
  type RouteTestApp,
  buildRouteTestApp,
} from '@trapmap/backend-core/testing/route-test-app.js';
import { experienceGeneDerivationTaskPayloadSchema } from '@trapmap/contracts';
import type { SkillArtifact } from '@trapmap/contracts';
import { describe, expect, it, vi } from 'vitest';

import { createKnowledgeAdminRouteDefs, createKnowledgeWriteRouteDefs } from './routes.ts';

const ADAPTERS: readonly AdapterName[] = ['fastify', 'nest'];

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
    returnReviewDecision: vi.fn(async () => ({
      entryId: 'entry-1',
      lifecycleState: 'submitted' as const,
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

async function buildApp(module: KnowledgeWritePort, adapter: AdapterName): Promise<RouteTestApp> {
  return buildRouteTestApp(createKnowledgeWriteRouteDefs(module), module, adapter);
}

describe.each(ADAPTERS)('service-knowledge-write routes (%s adapter)', (adapter) => {
  it('uses the trusted actor header for candidate publish and review lifecycle commands', async () => {
    const module = createModule();
    const app = await buildApp(module, adapter);

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

  it('invokes the injected experience gene derivation owner operation', async () => {
    const source = {
      kind: 'skill-artifact',
      sourceId: 'artifact-1:unit',
      sourceRevision: 4,
      sourceHash: 'a'.repeat(64),
      artifactId: 'artifact-1',
      capsuleId: null,
      artifactRevision: 4,
    };
    const request = experienceGeneDerivationTaskPayloadSchema.parse({
      requestId: 'request-1',
      source,
      derivationUnitId: 'unit',
      generatorKind: 'rule',
      promptVersion: 'experience-gene-rule-v1',
      snapshotHash: 'b'.repeat(64),
    });
    const deriveExperienceGene = vi.fn(async () => ({ status: 'idempotent' }));
    const deps = {
      ...createModule(),
      experienceGeneDerive: deriveExperienceGene,
    } satisfies Parameters<typeof createKnowledgeWriteRouteDefs>[0];
    const app = await buildRouteTestApp(createKnowledgeWriteRouteDefs(deps), deps, adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/experience-genes/derive',
      payload: request,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'idempotent' });
    expect(deriveExperienceGene).toHaveBeenCalledWith(request);
    await app.close();
  });

  it('returns unavailable when experience gene derivation is not assembled', async () => {
    const app = await buildApp(
      createKnowledgeWriteRouteDefs(createModule()),
      createModule(),
      adapter,
    );

    const response = await app.inject({
      method: 'POST',
      url: '/internal/experience-genes/derive',
      payload: {
        requestId: 'request-1',
        source: {
          kind: 'trap',
          sourceId: 'trap-1',
          sourceRevision: 1,
          sourceHash: 'a'.repeat(64),
          artifactId: null,
          capsuleId: null,
          artifactRevision: null,
        },
        derivationUnitId: 'trap:trap-1:v1',
        generatorKind: 'rule',
        promptVersion: 'experience-gene-rule-v1',
        snapshotHash: 'b'.repeat(64),
      },
    });

    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it('plans derivation tasks through the knowledge owner source loaders', async () => {
    const request = {
      name: 'knowledge.approved',
      entryId: 'trap-1',
      previousState: 'agent-pass',
      nextState: 'approved',
      actorId: 'system',
      reason: 'approved',
      timestamp: '2026-08-26T00:00:00.000Z',
    };
    const tasks = [
      {
        requestId: 'request-1',
        source: {
          kind: 'trap',
          sourceId: 'trap-1',
          sourceRevision: 1,
          sourceHash: 'a'.repeat(64),
          artifactId: null,
          capsuleId: null,
          artifactRevision: null,
        },
        derivationUnitId: 'trap:trap-1:v1',
        generatorKind: 'rule',
        promptVersion: 'experience-gene-rule-v1',
        snapshotHash: 'b'.repeat(64),
      },
    ];
    const planExperienceGeneDerivations = vi.fn(async () => tasks);
    const deps = {
      ...createModule(),
      planExperienceGeneDerivations,
    };
    const app = await buildRouteTestApp(createKnowledgeWriteRouteDefs(deps), deps, adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/experience-genes/derivation-plan',
      payload: request,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ tasks });
    expect(planExperienceGeneDerivations).toHaveBeenCalledWith(request);
    await app.close();
  });

  it('delegates explicit Gene staleness signals to the owner handler', async () => {
    const markExperienceGenesStale = vi.fn(async () => 2);
    const deps = {
      ...createModule(),
      markExperienceGenesStale,
    };
    const app = await buildRouteTestApp(createKnowledgeWriteRouteDefs(deps), deps, adapter);
    const request = {
      name: 'knowledge.remediation',
      entryId: 'trap-1',
      suppressedFromRetrieval: true,
      timestamp: '2026-08-26T00:00:00.000Z',
    };

    const response = await app.inject({
      method: 'POST',
      url: '/internal/experience-genes/stale',
      payload: request,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ marked: 2 });
    expect(markExperienceGenesStale).toHaveBeenCalledWith(request);
    await app.close();
  });

  it('returns unavailable when Gene staleness handling is not assembled', async () => {
    const app = await buildApp(createModule(), adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/experience-genes/stale',
      payload: { name: 'unknown' },
    });

    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it('rejects missing or spoofed body actors on command routes', async () => {
    const module = createModule();
    const app = await buildApp(module, adapter);

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

  it('routes return-for-correction to the owner without mapping it to rejection', async () => {
    const module = createModule();
    const app = await buildApp(module, adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/knowledge/review/return-for-correction',
      headers: { 'x-trapmap-actor-id': 'trusted-user' },
      payload: {
        entryId: 'entry-1',
        actorId: 'trusted-user',
        note: 'revise the boundary fields',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(module.returnReviewDecision).toHaveBeenCalledWith({
      entryId: 'entry-1',
      actorId: 'trusted-user',
      note: 'revise the boundary fields',
    });
    expect(module.rejectReviewDecision).not.toHaveBeenCalled();
    await app.close();
  });

  it('preserves invocation failure semantics for remote callers', async () => {
    const module = createModule({
      publishCandidateResult: vi.fn(async () => {
        throw InvocationError.unavailable('knowledge-write unavailable');
      }),
    });
    const app = await buildApp(module, adapter);

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
    expect(response.json()).toMatchObject({
      error: 'knowledge-write unavailable',
      kind: 'unavailable',
    });
    await app.close();
  });

  it('accepts rpc invoke envelope for the frozen remote command surface', async () => {
    const module = createModule();
    const app = await buildApp(module, adapter);

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

  it('exposes approved conflict candidates through the knowledge owner read projection', async () => {
    const conflictCandidateRead = {
      getById: vi.fn(async () => ({
        id: 'entry-new',
        shortcut: 'Postgres query timeout',
        detail: 'avoid table scan',
        lifecycleState: 'approved' as const,
      })),
      listByFilter: vi.fn(async () => ({
        items: [
          {
            id: 'entry-old',
            shortcut: 'Postgres query timeout',
            detail: 'use index planner',
            lifecycleState: 'approved' as const,
          },
        ],
        total: 1,
      })),
    };
    const module = createModule();
    const app = await buildRouteTestApp(
      createKnowledgeWriteRouteDefs({ ...module, conflictCandidateRead }),
      { ...module, conflictCandidateRead },
      adapter,
    );

    const response = await app.inject({
      method: 'GET',
      url: '/internal/knowledge/entry-new/conflict-candidates',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      entry: {
        id: 'entry-new',
        shortcut: 'Postgres query timeout',
        detail: 'avoid table scan',
        lifecycleState: 'approved',
      },
      candidates: [
        {
          id: 'entry-old',
          shortcut: 'Postgres query timeout',
          detail: 'use index planner',
          lifecycleState: 'approved',
        },
      ],
    });
    expect(conflictCandidateRead.getById).toHaveBeenCalledWith('entry-new');
    expect(conflictCandidateRead.listByFilter).toHaveBeenCalledWith({ lifecycleState: 'approved' });

    await app.close();
  });

  it('exposes independent liveness, readiness, ownership, and operator diagnostics', async () => {
    const module = createModule();
    const deps = {
      ...module,
      checkDependency: vi.fn(async () => ({ reachable: true })),
      getOperatorStatus: vi.fn(async () => ({
        persistence: { status: 'healthy' },
        asyncFollowUp: { owner: 'job-runtime', outbox: { pending: 2, failed: 0 } },
        idempotency: { mechanism: 'task_queue.dedupe_key' },
      })),
    };
    const app = await buildRouteTestApp(createKnowledgeWriteRouteDefs(deps), deps, adapter);

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
    const module = createModule();
    const deps = { ...module, checkDependency: vi.fn(async () => ({ reachable: true })) };
    const app = await buildRouteTestApp(createKnowledgeWriteRouteDefs(deps), deps, adapter);

    const response = await app.inject({ method: 'GET', url: '/internal/ready' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      checks: { persistence: { status: 'ok', detail: null } },
    });
    await app.close();
  });
});

function createArtifact(overrides: Partial<SkillArtifact> = {}): SkillArtifact {
  const base: SkillArtifact = {
    id: 'art-101',
    teamId: null,
    scope: 'project',
    labels: ['docker', 'security'],
    title: 'Docker Runtime Governance Skill',
    slug: 'docker-runtime-gov-skill',
    requiredLevel: 3,
    lifecycleState: 'approved',
    owner: { id: 'actor-ops', handle: 'ops-lead', securityLevel: 4 },
    latestRevision: 1,
    createdAt: '2026-06-19T10:00:00.000Z',
    updatedAt: '2026-06-19T10:05:00.000Z',
    metadata: {
      sourceKind: 'skill-directory',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: 'sub-301',
      latestSubmittedAt: '2026-06-19T10:00:00.000Z',
      latestReviewedAt: '2026-06-19T10:05:00.000Z',
      latestDecision: 'approve',
    },
    history: [
      {
        revision: 1,
        sourceHash: 'a'.repeat(64),
        submittedAt: '2026-06-19T10:00:00.000Z',
        submittedBy: { id: 'actor-ops', handle: 'ops-lead', securityLevel: 4 },
        files: [
          {
            path: 'SKILL.md',
            kind: 'skill-markdown',
            sha256: 'b'.repeat(64),
            sizeBytes: 1200,
            mediaType: 'text/markdown',
            source: 'SKILL.md',
            includeInDerivation: true,
            activationOnly: false,
          },
        ],
        scriptDescriptors: [],
        derived: null,
      },
    ],
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    evidenceMeta: null,
    maintenanceMeta: null,
    remediation: null,
  };
  return { ...base, ...overrides };
}

describe.each(ADAPTERS)('service-knowledge-write admin artifacts (%s adapter)', (adapter) => {
  it('serves admin artifact list 200 with search, scope, level, lifecycle, pagination and governance', async () => {
    const a1 = createArtifact({
      id: 'art-101',
      scope: 'project',
      requiredLevel: 3,
      lifecycleState: 'approved',
      title: 'Docker Governance',
      slug: 'docker-gov',
      teamId: null,
      updatedAt: '2026-06-19T12:00:00.000Z',
      labels: ['docker'],
    });
    const a2 = createArtifact({
      id: 'art-102',
      scope: 'global',
      requiredLevel: 4,
      lifecycleState: 'submitted',
      title: 'K8s Network',
      slug: 'k8s-net',
      teamId: null,
      updatedAt: '2026-06-19T11:00:00.000Z',
      labels: ['kubernetes'],
    });
    const a3 = createArtifact({
      id: 'art-103',
      scope: 'project',
      requiredLevel: 1,
      lifecycleState: 'approved',
      title: 'Observability',
      slug: 'obs',
      teamId: 'team-999',
      updatedAt: '2026-06-19T10:00:00.000Z',
    });
    const deps = { ...createModule(), listArtifacts: vi.fn(async () => [a1, a2, a3]) };
    const app = await buildRouteTestApp(createKnowledgeAdminRouteDefs(deps), deps, adapter);

    const all = await app.inject({
      method: 'GET',
      url: '/api/admin/artifacts?limit=10',
      headers: { 'x-trapmap-actor-id': 'user-1', 'x-trapmap-security-level': '9' },
    });
    expect(all.statusCode).toBe(200);
    // Governance: team-999 artifact hidden unless same team or system-admin
    expect(all.json().items).toHaveLength(2);
    expect(all.json().total).toBe(3);
    expect(all.json().filteredTotal).toBe(2);

    const byScope = await app.inject({
      method: 'GET',
      url: '/api/admin/artifacts?scope=global&limit=10',
      headers: { 'x-trapmap-actor-id': 'user-1', 'x-trapmap-security-level': '9' },
    });
    expect(byScope.json().items).toHaveLength(1);
    expect(byScope.json().items[0].id).toBe('art-102');

    const byLevel = await app.inject({
      method: 'GET',
      url: '/api/admin/artifacts?requiredLevel=3&limit=10',
      headers: { 'x-trapmap-actor-id': 'user-1', 'x-trapmap-security-level': '9' },
    });
    expect(byLevel.json().items).toHaveLength(1);
    expect(byLevel.json().items[0].id).toBe('art-101');

    // Alias level param
    const byLevelAlias = await app.inject({
      method: 'GET',
      url: '/api/admin/artifacts?level=3&limit=10',
      headers: { 'x-trapmap-actor-id': 'user-1', 'x-trapmap-security-level': '9' },
    });
    expect(byLevelAlias.json().items).toHaveLength(1);

    // lifecycle alias
    const byLifecycle = await app.inject({
      method: 'GET',
      url: '/api/admin/artifacts?lifecycle=submitted&limit=10',
      headers: { 'x-trapmap-actor-id': 'user-1', 'x-trapmap-security-level': '9' },
    });
    expect(byLifecycle.json().items).toHaveLength(1);

    const bySearch = await app.inject({
      method: 'GET',
      url: '/api/admin/artifacts?search=docker&limit=10',
      headers: { 'x-trapmap-actor-id': 'user-1', 'x-trapmap-security-level': '9' },
    });
    expect(bySearch.json().items).toHaveLength(1);
    expect(bySearch.json().items[0].id).toBe('art-101');

    // Pagination
    const p1 = await app.inject({
      method: 'GET',
      url: '/api/admin/artifacts?limit=1',
      headers: { 'x-trapmap-actor-id': 'user-1', 'x-trapmap-security-level': '9' },
    });
    expect(p1.json().items).toHaveLength(1);
    expect(p1.json().nextCursor).toBe('1');
    const p2 = await app.inject({
      method: 'GET',
      url: `/api/admin/artifacts?limit=1&cursor=${p1.json().nextCursor}`,
      headers: { 'x-trapmap-actor-id': 'user-1', 'x-trapmap-security-level': '9' },
    });
    expect(p2.json().items).toHaveLength(1);
    expect(p2.json().nextCursor).toBeNull();

    // Security level governance: low level user cannot see high requiredLevel
    const lowAuth = await app.inject({
      method: 'GET',
      url: '/api/admin/artifacts?limit=10',
      headers: { 'x-trapmap-actor-id': 'user-1', 'x-trapmap-security-level': '1' },
    });
    expect(lowAuth.json().items).toHaveLength(0);

    // System-admin bypass
    const sys = await app.inject({
      method: 'GET',
      url: '/api/admin/artifacts?limit=10',
      headers: {
        'x-trapmap-actor-id': 'admin',
        'x-trapmap-subject-type': 'system-admin',
        'x-trapmap-security-level': '10',
      },
    });
    expect(sys.json().items).toHaveLength(3);

    await app.close();
  });

  it('enforces 401 and 400 for admin artifact list', async () => {
    const deps = { ...createModule(), listArtifacts: vi.fn(async () => []) };
    const app = await buildRouteTestApp(createKnowledgeAdminRouteDefs(deps), deps, adapter);

    const noAuth = await app.inject({ method: 'GET', url: '/api/admin/artifacts?limit=10' });
    expect(noAuth.statusCode).toBe(401);

    const bad = await app.inject({
      method: 'GET',
      url: '/api/admin/artifacts?lifecycle=invalid&limit=10',
      headers: { 'x-trapmap-actor-id': 'user-1' },
    });
    expect(bad.statusCode).toBe(400);

    const badAliasMismatch = await app.inject({
      method: 'GET',
      url: '/api/admin/artifacts?lifecycle=approved&lifecycleState=submitted&limit=10',
      headers: { 'x-trapmap-actor-id': 'user-1' },
    });
    expect(badAliasMismatch.statusCode).toBe(400);

    const extra = await app.inject({
      method: 'GET',
      url: '/api/admin/artifacts?unknown=x&limit=10',
      headers: { 'x-trapmap-actor-id': 'user-1' },
    });
    expect(extra.statusCode).toBe(400);

    await app.close();
  });

  it('serves admin artifact detail 200, 404, 401 and governance', async () => {
    const art = createArtifact({ id: 'art-101', teamId: null, requiredLevel: 3 });
    const teamArt = createArtifact({ id: 'art-999', teamId: 'team-999', requiredLevel: 1 });
    const deps = {
      ...createModule(),
      getArtifact: vi.fn(async (id: string) =>
        id === 'art-101' ? art : id === 'art-999' ? teamArt : null,
      ),
      listArtifacts: vi.fn(async () => [art, teamArt]),
    };
    const app = await buildRouteTestApp(createKnowledgeAdminRouteDefs(deps), deps, adapter);

    const ok = await app.inject({
      method: 'GET',
      url: '/api/admin/artifacts/art-101',
      headers: { 'x-trapmap-actor-id': 'user-1', 'x-trapmap-security-level': '9' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().id).toBe('art-101');

    const notFound = await app.inject({
      method: 'GET',
      url: '/api/admin/artifacts/missing',
      headers: { 'x-trapmap-actor-id': 'user-1', 'x-trapmap-security-level': '9' },
    });
    expect(notFound.statusCode).toBe(404);

    const teamFiltered = await app.inject({
      method: 'GET',
      url: '/api/admin/artifacts/art-999',
      headers: {
        'x-trapmap-actor-id': 'user-1',
        'x-trapmap-security-level': '9',
        'x-trapmap-team-id': 'team-1',
      },
    });
    expect(teamFiltered.statusCode).toBe(404);

    const noAuth = await app.inject({ method: 'GET', url: '/api/admin/artifacts/art-101' });
    expect(noAuth.statusCode).toBe(401);

    await app.close();
  });

  it('routes admin artifacts via the main RouteDefs aggregator (200)', async () => {
    const art = createArtifact();
    const deps = { ...createModule(), listArtifacts: vi.fn(async () => [art]) };
    const app = await buildRouteTestApp(createKnowledgeWriteRouteDefs(deps), deps, adapter);
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/artifacts?limit=10',
      headers: { 'x-trapmap-actor-id': 'user-1', 'x-trapmap-security-level': '9' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(1);
    await app.close();
  });
});
