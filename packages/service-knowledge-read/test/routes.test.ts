// fallow-ignore-file complexity -- admin graph tests co-locate search/mode/pagination/governance assertions
// fallow-ignore-file code-duplication -- graph fixtures mirror panel applyArtifactQuery
import { InvocationError, type KnowledgeReadPort, type RouteTestApp } from '@trapmap/backend-core';
import {
  type AdapterName,
  buildRouteTestApp,
} from '@trapmap/backend-core/testing/route-test-app.js';
import { describe, expect, it, vi } from 'vitest';

import { createKnowledgeAdminGraphRouteDefs, createKnowledgeReadRouteDefs } from '../src/routes.js';

const ADAPTERS: readonly AdapterName[] = ['fastify', 'nest'];

function createProjectionStatus() {
  return {
    phase: 'phase-2-boundary-closed' as const,
    source: 'temporary-direct-backed-projection',
    consistency: 'eventual' as const,
    freshness: 'current' as const,
    fallback: 'none' as const,
    notes:
      'Phase 2 closes the read-side boundary by making each surface declare its owner, backing source, consistency, freshness, and direct-read allowance explicitly.',
    surfaces: [
      {
        surface: 'knowledge-entry:getById',
        owner: 'knowledge-read' as const,
        providedBy: 'knowledge-read' as const,
        source: 'temporary-direct-backed-projection' as const,
        authoritativeSource: 'knowledge-write authoritative PostgreSQL tables',
        consistency: 'eventual' as const,
        freshness: 'current' as const,
        fallback: 'direct-authoritative-read' as const,
        notes:
          'Entry lookup is served from the knowledge-read owned temporary direct-backed snapshot.',
      },
      {
        surface: 'knowledge-entry:listMine',
        owner: 'knowledge-read' as const,
        providedBy: 'knowledge-read' as const,
        source: 'temporary-direct-backed-projection' as const,
        authoritativeSource: 'knowledge-write authoritative PostgreSQL tables',
        consistency: 'eventual' as const,
        freshness: 'current' as const,
        fallback: 'direct-authoritative-read' as const,
        notes:
          'List queries are served from the knowledge-read owned temporary direct-backed snapshot.',
      },
      {
        surface: 'retrieval-search',
        owner: 'knowledge-read' as const,
        providedBy: 'knowledge-read' as const,
        source: 'derived-search-index' as const,
        authoritativeSource: 'knowledge-write lifecycle events and retrieval indexing artifacts',
        consistency: 'eventual' as const,
        freshness: 'current' as const,
        fallback: 'none' as const,
        notes:
          'Retrieval queries are served from derived index/search state, not route-local direct SQL assembly.',
      },
      {
        surface: 'retrieval-query-trace',
        owner: 'knowledge-read' as const,
        providedBy: 'knowledge-read' as const,
        source: 'derived-query-trace' as const,
        authoritativeSource: 'knowledge-read query trace and badcase capture records',
        consistency: 'eventual' as const,
        freshness: 'current' as const,
        fallback: 'none' as const,
        notes: 'Trace and analytics remain read-side derived state owned by knowledge-read.',
      },
      {
        surface: 'retrieval-cache-metadata',
        owner: 'knowledge-read' as const,
        providedBy: 'knowledge-read' as const,
        source: 'derived-projection' as const,
        authoritativeSource: 'knowledge-read cache metadata and projection cache state',
        consistency: 'eventual' as const,
        freshness: 'current' as const,
        fallback: 'none' as const,
        notes:
          'Cache metadata stays on derived read-side state and must not fall back to direct authoritative reads.',
      },
      {
        surface: 'review-queue',
        owner: 'governance-review' as const,
        providedBy: 'governance-review' as const,
        source: 'governance-read-model' as const,
        authoritativeSource: 'governance-review queue and workbench tables',
        consistency: 'strong' as const,
        freshness: 'current' as const,
        fallback: 'none' as const,
        notes: 'Review queue stays outside knowledge-read and is served by governance-review.',
      },
      {
        surface: 'maintenance-entries',
        owner: 'governance-review' as const,
        providedBy: 'governance-review' as const,
        source: 'derived-projection' as const,
        authoritativeSource: 'governance-review derived maintenance read model',
        consistency: 'strong' as const,
        freshness: 'current' as const,
        fallback: 'none' as const,
        notes:
          'Operator-facing maintenance entry views are served from a governance-owned derived projection.',
      },
      {
        surface: 'decay-entries-search',
        owner: 'governance-review' as const,
        providedBy: 'governance-review' as const,
        source: 'governance-read-model' as const,
        authoritativeSource: 'governance-review decay workbench and operator queues',
        consistency: 'eventual' as const,
        freshness: 'current' as const,
        fallback: 'none' as const,
        notes:
          'Decay workbench search remains a governance-review concern unless promoted into retrieval-facing search.',
      },
    ],
  };
}

function createModule(): KnowledgeReadPort {
  return {
    getById: vi.fn(async () => ({
      id: 'entry-1',
      content: 'hello',
      lifecycleState: 'approved',
      ownerUserId: 'user-1',
      teamId: 'team-1',
    })),
    listMine: vi.fn(async () => []),
    search: vi.fn(async () => ({
      globalConstraints: [],
      projectKnowledge: [],
      refinementSummary: null,
      summary: null,
    })),
    skillLookup: vi.fn(async () => ({ matches: [] })),
    getProjectionStatus: vi.fn(async () => createProjectionStatus()),
    rebuildProjection: vi.fn(async () => createProjectionStatus()),
  };
}

async function buildApp(module: KnowledgeReadPort, adapter: AdapterName): Promise<RouteTestApp> {
  return buildRouteTestApp(createKnowledgeReadRouteDefs(module), module, adapter);
}

describe.each(ADAPTERS)('knowledge-read routes (%s adapter)', (adapter) => {
  it('serves derived entry lookup through getById with 404 semantics', async () => {
    const module = createModule();
    const app = await buildApp(module, adapter);

    const success = await app.inject({
      method: 'GET',
      url: '/internal/knowledge/entry-1',
    });

    expect(success.statusCode).toBe(200);
    expect(success.json()).toMatchObject({ id: 'entry-1', ownerUserId: 'user-1' });
    expect(module.getById).toHaveBeenCalledWith('entry-1');

    vi.mocked(module.getById).mockResolvedValueOnce(null);
    const notFound = await app.inject({
      method: 'GET',
      url: '/internal/knowledge/missing-entry',
    });

    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toMatchObject({
      error: 'Knowledge entry not found',
      kind: 'not-found',
    });
    expect(module.getById).toHaveBeenCalledWith('missing-entry');

    await app.close();
  });

  it('serves listMine from the derived entry projection with query passthrough', async () => {
    const module = createModule();
    vi.mocked(module.listMine).mockResolvedValueOnce([
      {
        id: 'entry-2',
        content: 'mine',
        lifecycleState: 'approved',
        ownerUserId: 'user-1',
        teamId: 'team-2',
      },
    ]);
    const app = await buildApp(module, adapter);

    const response = await app.inject({
      method: 'GET',
      url: '/internal/knowledge/mine?userId=user-1&teamId=team-2',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        id: 'entry-2',
        content: 'mine',
        lifecycleState: 'approved',
        ownerUserId: 'user-1',
        teamId: 'team-2',
      },
    ]);
    expect(module.listMine).toHaveBeenCalledWith('user-1', 'team-2');

    const missingUserId = await app.inject({
      method: 'GET',
      url: '/internal/knowledge/mine',
    });

    expect(missingUserId.statusCode).toBe(400);
    expect(missingUserId.json()).toMatchObject({
      error: 'Request validation failed',
      kind: 'validation',
    });

    await app.close();
  });

  it('serves retrieval search from derived read-side state with body passthrough', async () => {
    const module = createModule();
    vi.mocked(module.search).mockResolvedValueOnce({
      globalConstraints: [],
      projectKnowledge: [
        {
          entryId: 'entry-1',
          scope: 'project',
          requiredLevel: 0,
          shortcut: 'entry-1',
          detail: 'hello',
          labels: [],
          score: 0.98,
          reason: 'test match',
        },
      ],
      refinementSummary: null,
      summary: null,
    });
    const app = await buildApp(module, adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/retrieval/search',
      payload: { query: 'hello', teamId: 'team-1', limit: 5 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      globalConstraints: [],
      projectKnowledge: [
        {
          entryId: 'entry-1',
          scope: 'project',
          requiredLevel: 0,
          shortcut: 'entry-1',
          detail: 'hello',
          labels: [],
          score: 0.98,
          reason: 'test match',
        },
      ],
      refinementSummary: null,
      summary: null,
    });
    expect(module.search).toHaveBeenCalledWith({
      query: 'hello',
      teamId: 'team-1',
      limit: 5,
    });

    const missingQuery = await app.inject({
      method: 'POST',
      url: '/internal/retrieval/search',
      payload: {},
    });

    expect(missingQuery.statusCode).toBe(400);
    expect(missingQuery.json()).toMatchObject({
      error: 'Request validation failed',
      kind: 'validation',
    });

    await app.close();
  });

  it('exposes projection status for freshness and fallback evidence', async () => {
    const module = createModule();
    const app = await buildApp(module, adapter);

    const response = await app.inject({
      method: 'GET',
      url: '/internal/knowledge-read/projection-status',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(createProjectionStatus());

    await app.close();
  });

  it('serves artifact-first skill lookup through the internal route', async () => {
    const module = createModule();
    vi.mocked(module.skillLookup).mockResolvedValueOnce({
      matches: [
        {
          artifactId: 'artifact-1',
          title: 'Docker cleanup',
          slug: 'docker-cleanup',
          labels: ['docker'],
          scope: 'global',
          requiredLevel: 0,
          sourceKind: 'skill-directory',
          score: 0.94,
          reason: 'semantic similarity',
        },
      ],
    });
    const app = await buildApp(module, adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/retrieval/skills/search-by-content',
      payload: { text: 'docker cleanup', maxResults: 5 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      matches: [{ artifactId: 'artifact-1', slug: 'docker-cleanup' }],
    });
    expect(module.skillLookup).toHaveBeenCalledWith({
      text: 'docker cleanup',
      maxResults: 5,
    });

    const invalid = await app.inject({
      method: 'POST',
      url: '/internal/retrieval/skills/search-by-content',
      payload: {},
    });
    expect(invalid.statusCode).toBe(400);

    await app.close();
  });

  it('rebuilds the projection only through the knowledge-read operator surface', async () => {
    const module = createModule();
    const app = await buildApp(module, adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/knowledge-read/projection-rebuild',
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual(createProjectionStatus());
    expect(module.rebuildProjection).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('keeps derived entry reads distinct from retrieval and governance surfaces', async () => {
    const module = createModule();
    const status = await module.getProjectionStatus();

    const entryGetById = status.surfaces.find(
      (surface) => surface.surface === 'knowledge-entry:getById',
    );
    const entryListMine = status.surfaces.find(
      (surface) => surface.surface === 'knowledge-entry:listMine',
    );
    const retrievalSurface = status.surfaces.find(
      (surface) => surface.surface === 'retrieval-search',
    );
    const queryTraceSurface = status.surfaces.find(
      (surface) => surface.surface === 'retrieval-query-trace',
    );
    const cacheMetadataSurface = status.surfaces.find(
      (surface) => surface.surface === 'retrieval-cache-metadata',
    );
    const reviewSurface = status.surfaces.find((surface) => surface.surface === 'review-queue');
    const maintenanceSurface = status.surfaces.find(
      (surface) => surface.surface === 'maintenance-entries',
    );

    expect(entryGetById).toMatchObject({
      source: 'temporary-direct-backed-projection',
      consistency: 'eventual',
      fallback: 'direct-authoritative-read',
      owner: 'knowledge-read',
    });
    expect(entryListMine).toMatchObject({
      source: 'temporary-direct-backed-projection',
      consistency: 'eventual',
      fallback: 'direct-authoritative-read',
      owner: 'knowledge-read',
    });
    expect(retrievalSurface).toMatchObject({
      source: 'derived-search-index',
      fallback: 'none',
      owner: 'knowledge-read',
      consistency: 'eventual',
    });
    expect(queryTraceSurface).toMatchObject({
      source: 'derived-query-trace',
      fallback: 'none',
      owner: 'knowledge-read',
    });
    expect(cacheMetadataSurface).toMatchObject({
      source: 'derived-projection',
      fallback: 'none',
      owner: 'knowledge-read',
    });
    expect(reviewSurface).toMatchObject({
      owner: 'governance-review',
      providedBy: 'governance-review',
      source: 'governance-read-model',
    });
    expect(maintenanceSurface).toMatchObject({
      owner: 'governance-review',
      source: 'derived-projection',
    });
  });

  it.each([
    ['validation', 400],
    ['forbidden', 403],
    ['not-found', 404],
    ['conflict', 409],
    ['unavailable', 503],
    ['timeout', 504],
    ['internal', 500],
  ] as const)(
    'maps InvocationError kind %s to HTTP %i across knowledge-read surfaces',
    async (kind, statusCode) => {
      const error = new InvocationError(kind, `boom:${kind}`);
      const module: KnowledgeReadPort = {
        getById: vi.fn(async () => {
          throw error;
        }),
        listMine: vi.fn(async () => {
          throw error;
        }),
        search: vi.fn(async () => {
          throw error;
        }),
        getProjectionStatus: vi.fn(async () => {
          throw error;
        }),
      };
      const app = await buildApp(module, adapter);

      const byId = await app.inject({ method: 'GET', url: '/internal/knowledge/entry-1' });
      const mine = await app.inject({
        method: 'GET',
        url: '/internal/knowledge/mine?userId=user-1',
      });
      const search = await app.inject({
        method: 'POST',
        url: '/internal/retrieval/search',
        payload: { query: 'hello' },
      });
      const projectionStatus = await app.inject({
        method: 'GET',
        url: '/internal/knowledge-read/projection-status',
      });

      for (const response of [byId, mine, search, projectionStatus]) {
        expect(response.statusCode).toBe(statusCode);
        expect(response.json()).toMatchObject({ error: `boom:${kind}`, kind });
      }

      await app.close();
    },
  );
});

const mockTrapGraph = {
  nodes: [
    {
      id: 'trap-1',
      label: 'Docker socket exposure',
      kind: 'trap',
      severity: 'critical',
      scope: 'global',
      requiredLevel: 4,
    },
    { id: 'cue-1', label: 'Mounting /var/run/docker.sock', kind: 'cue' },
    { id: 'tool-1', label: 'Docker CLI', kind: 'tool' },
    { id: 'env-1', label: 'Host environment', kind: 'environment' },
    { id: 'mit-1', label: 'Rootless container runtimes', kind: 'mitigation' },
    {
      id: 'trap-2',
      label: 'Writable root filesystem',
      kind: 'trap',
      scope: 'project',
      requiredLevel: 2,
    },
  ],
  edges: [
    { id: 'e-1', source: 'cue-1', target: 'trap-1', kind: 'evidence' },
    { id: 'e-2', source: 'tool-1', target: 'trap-1', kind: 'requires' },
    { id: 'e-4', source: 'mit-1', target: 'trap-1', kind: 'mitigates' },
  ],
};

const mockSkillGraphs: Record<
  string,
  { derivation: typeof mockTrapGraph; semantic: typeof mockTrapGraph }
> = {
  'art-101': {
    derivation: {
      nodes: [
        { id: 'art-101', label: 'Docker Governance', kind: 'artifact' },
        { id: 'prof-101', label: 'Docker Governance Profile', kind: 'profile' },
        { id: 'cap-101-1', label: 'cap-101-1: Read-only root FS', kind: 'capsule' },
      ],
      edges: [{ id: 'ed-1', source: 'art-101', target: 'prof-101', kind: 'derives' }],
    },
    semantic: {
      nodes: [
        { id: 'skill-101', label: 'Docker Governance Skill', kind: 'skill' },
        { id: 'cap-101-1', label: 'cap-101-1: Read-only root FS', kind: 'capsule' },
        { id: 'mit-readonly', label: 'Read-only root filesystem flag', kind: 'mitigation' },
      ],
      edges: [{ id: 'es-1', source: 'skill-101', target: 'cap-101-1', kind: 'has-capsule' }],
    },
  },
};

function createGraphModule(overrides: Record<string, unknown> = {}) {
  return {
    ...createModule(),
    getTrapGraph: vi.fn(async (query: Record<string, unknown>) => {
      if (
        query.search &&
        typeof query.search === 'string' &&
        query.search.toLowerCase().includes('writable')
      ) {
        return {
          nodes: mockTrapGraph.nodes.filter((n) => n.label.toLowerCase().includes('writable')),
          edges: [],
        };
      }
      return mockTrapGraph;
    }),
    getSkillGraph: vi.fn(async (query: Record<string, unknown>) => {
      const artifactId = query.artifactId as string | undefined;
      const mode = (query.mode as string) ?? 'derivation';
      if (artifactId && mockSkillGraphs[artifactId]) {
        return (
          mockSkillGraphs[artifactId][mode as 'derivation' | 'semantic'] ??
          mockSkillGraphs[artifactId].derivation
        );
      }
      if (
        query.search &&
        typeof query.search === 'string' &&
        query.search.toLowerCase().includes('docker')
      ) {
        return mockSkillGraphs['art-101']!.derivation;
      }
      return { nodes: [], edges: [] };
    }),
    ...overrides,
  };
}

describe.each(ADAPTERS)('knowledge-read admin graphs (%s adapter)', (adapter) => {
  it('serves trap graph 200 with search, governance, depth and pagination', async () => {
    const module = createGraphModule();
    const app = await buildRouteTestApp(
      createKnowledgeAdminGraphRouteDefs(module as never), // lib type gap: test deps union injection
      module as never, // lib type gap: test deps union injection
      adapter,
    );

    const all = await app.inject({
      method: 'GET',
      url: '/api/admin/graph/traps?depth=1&mode=derivation',
      headers: { 'x-trapmap-actor-id': 'user-1', 'x-trapmap-security-level': '9' },
    });
    expect(all.statusCode).toBe(200);
    expect(all.json().nodes.length).toBeGreaterThan(0);
    expect(all.json().edges.length).toBeGreaterThan(0);

    const bySearch = await app.inject({
      method: 'GET',
      url: '/api/admin/graph/traps?search=writable',
      headers: { 'x-trapmap-actor-id': 'user-1', 'x-trapmap-security-level': '9' },
    });
    expect(bySearch.json().nodes).toHaveLength(1);
    expect(bySearch.json().nodes[0].id).toBe('trap-2');

    // Governance: low security cannot see high requiredLevel trap-1 (requires 4)
    const lowAuth = await app.inject({
      method: 'GET',
      url: '/api/admin/graph/traps',
      headers: {
        'x-trapmap-actor-id': 'user-1',
        'x-trapmap-security-level': '1',
        'x-trapmap-team-id': 'team-1',
      },
    });
    // trap-1 should be filtered out, only trap-2 visible (or none)
    expect(lowAuth.json().nodes.some((n: { id: string }) => n.id === 'trap-1')).toBe(false);

    // Pagination
    const p1 = await app.inject({
      method: 'GET',
      url: '/api/admin/graph/traps?limit=2',
      headers: { 'x-trapmap-actor-id': 'user-1', 'x-trapmap-security-level': '9' },
    });
    expect(p1.json().nodes).toHaveLength(2);
    const p2 = await app.inject({
      method: 'GET',
      url: '/api/admin/graph/traps?limit=2&cursor=2',
      headers: { 'x-trapmap-actor-id': 'user-1', 'x-trapmap-security-level': '9' },
    });
    expect(p2.json().nodes.length).toBeGreaterThan(0);

    await app.close();
  });

  it('serves skill graph 200 with mode, artifactId, search and validation', async () => {
    const module = createGraphModule();
    const app = await buildRouteTestApp(
      createKnowledgeAdminGraphRouteDefs(module as never), // lib type gap: test deps union injection
      module as never, // lib type gap: test deps union injection
      adapter,
    );

    const derivation = await app.inject({
      method: 'GET',
      url: '/api/admin/graph/skills?artifactId=art-101&mode=derivation',
      headers: { 'x-trapmap-actor-id': 'user-1', 'x-trapmap-security-level': '9' },
    });
    expect(derivation.statusCode).toBe(200);
    expect(derivation.json().nodes.some((n: { kind: string }) => n.kind === 'profile')).toBe(true);

    const semantic = await app.inject({
      method: 'GET',
      url: '/api/admin/graph/skills?artifactId=art-101&mode=semantic',
      headers: { 'x-trapmap-actor-id': 'user-1', 'x-trapmap-security-level': '9' },
    });
    expect(semantic.json().nodes.some((n: { kind: string }) => n.kind === 'mitigation')).toBe(true);

    // Alias path: /api/admin/graphs/skill/:artifactId
    const alias = await app.inject({
      method: 'GET',
      url: '/api/admin/graphs/skill/art-101?mode=derivation',
      headers: { 'x-trapmap-actor-id': 'user-1', 'x-trapmap-security-level': '9' },
    });
    expect(alias.statusCode).toBe(200);
    expect(alias.json().nodes).toHaveLength(3);

    // Search filtering within skill graph
    const bySearch = await app.inject({
      method: 'GET',
      url: '/api/admin/graph/skills?search=docker',
      headers: { 'x-trapmap-actor-id': 'user-1', 'x-trapmap-security-level': '9' },
    });
    expect(bySearch.json().nodes.length).toBeGreaterThan(0);

    await app.close();
  });

  it('enforces 401 and 400 for graph routes', async () => {
    const module = createGraphModule();
    const app = await buildRouteTestApp(
      createKnowledgeAdminGraphRouteDefs(module as never), // lib type gap: test deps union injection
      module as never, // lib type gap: test deps union injection
      adapter,
    );

    const noAuth = await app.inject({ method: 'GET', url: '/api/admin/graph/traps' });
    expect(noAuth.statusCode).toBe(401);

    const badDepth = await app.inject({
      method: 'GET',
      url: '/api/admin/graph/traps?depth=3',
      headers: { 'x-trapmap-actor-id': 'user-1' },
    });
    expect(badDepth.statusCode).toBe(400);

    const badMode = await app.inject({
      method: 'GET',
      url: '/api/admin/graph/skills?mode=invalid',
      headers: { 'x-trapmap-actor-id': 'user-1' },
    });
    expect(badMode.statusCode).toBe(400);

    const badExtra = await app.inject({
      method: 'GET',
      url: '/api/admin/graph/traps?unknown=x',
      headers: { 'x-trapmap-actor-id': 'user-1' },
    });
    expect(badExtra.statusCode).toBe(400);

    await app.close();
  });

  it('routes admin graphs via the main RouteDefs aggregator', async () => {
    const module = createGraphModule();
    const app = await buildRouteTestApp(
      createKnowledgeReadRouteDefs(module as never), // lib type gap: test deps union injection
      module as never, // lib type gap: test deps union injection
      adapter,
    );
    const res = await app.inject({
      method: 'GET',
      url: '/api/admin/graph/traps',
      headers: { 'x-trapmap-actor-id': 'user-1', 'x-trapmap-security-level': '9' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
