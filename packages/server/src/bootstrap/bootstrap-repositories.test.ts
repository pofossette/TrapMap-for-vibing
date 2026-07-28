import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { GraphQueryBackend } from '@trapmap/contracts';

const graphQueryMocks = vi.hoisted(() => ({
  createFailOpenGraphQueryBackend: vi.fn(),
  createGraphQueryRuntimeState: vi.fn(),
  createNeo4jGraphQueryBackend: vi.fn(),
}));
const channelMocks = vi.hoisted(() => ({ createGraphChannel: vi.fn() }));
const runtimeMocks = vi.hoisted(() => ({ executeWithResilience: vi.fn() }));

vi.mock('@trapmap/server/lib/analytics/index.js', () => ({
  createUsageAnalyticsRepository: vi.fn(),
}));
vi.mock('@trapmap/server/lib/graph-query/index.js', () => graphQueryMocks);
vi.mock('@trapmap/server/lib/indexing/adapters/artifact-graph.js', () => ({
  artifactGraphIndexAdapter: {},
}));
vi.mock('@trapmap/server/lib/indexing/adapters/capsule-index.js', () => ({
  createCapsuleIndexAdapter: vi.fn(),
}));
vi.mock('@trapmap/server/lib/indexing/artifact-pipeline.js', () => ({
  registerArtifactAdapters: vi.fn(),
}));
vi.mock('@trapmap/server/lib/repos/index.js', () => ({
  createAllRepos: vi.fn().mockResolvedValue({ graphIndex: {} }),
}));
vi.mock('@trapmap/server/lib/retrieval/capsules/repositories/pg-capsule-vector.js', () => ({
  ensureCapsuleVectorIndex: vi.fn(),
}));
vi.mock('@trapmap/server/lib/retrieval/recall/db-search.js', () => ({
  ensureVectorIndex: vi.fn(),
}));
vi.mock('@trapmap/server/lib/retrieval/recall/graph-assisted.js', () => channelMocks);
vi.mock('@trapmap/server/lib/runtime/index.js', () => ({
  executeWithResilience: runtimeMocks.executeWithResilience,
}));
vi.mock('@trapmap/server/lib/store.js', () => ({
  getStorePool: vi.fn().mockReturnValue(null),
}));

import { bootstrapRepositories } from './bootstrap-repositories.js';

function createBackend(): GraphQueryBackend {
  return {
    kind: 'memory',
    isEnabled: () => false,
    getRuntimeState: () => ({ mode: 'disabled', backendKind: 'memory', failOpen: true }),
    healthcheck: async () => ({ ok: true, mode: 'disabled' }),
    upsertDocument: async () => {},
    removeSource: async () => {},
    rebuildProjection: async () => {},
    expandSourcesOneHop: async () => new Set(),
    calculateSourceRelationStrength: async () => 0,
    getSourceNodeIds: async () => new Map(),
    buildLocalExpansionView: async () => ({
      graph: {} as never,
      nodeViewsById: new Map(),
      nodeIdsBySourceId: new Map(),
    }),
    findMitigatingSkills: async () => [],
  };
}

function createApp(graphQueryBackend?: GraphQueryBackend) {
  const register = vi.fn();
  return {
    log: { info: vi.fn() },
    skillShareer: {
      store: {},
      graphIndex: {},
      artifactReadProjection: {},
      knowledgeOwner: {},
      governanceRetrievalProjection: undefined,
      repos: {},
      graphQueryBackend,
      graphQuery: { mode: 'disabled', backendKind: 'memory', failOpen: true },
      config: {
        graphDb: {
          enabled: false,
          failOpen: true,
          syncOnWrite: true,
        },
      },
      channelRegistry: { register },
    },
  } as any;
}

describe('bootstrapRepositories graph-query composition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    graphQueryMocks.createNeo4jGraphQueryBackend.mockImplementation(async () =>
      createBackendWithKind('neo4j'),
    );
    graphQueryMocks.createFailOpenGraphQueryBackend.mockImplementation(({ primary }) => primary);
    graphQueryMocks.createGraphQueryRuntimeState.mockReturnValue({
      mode: 'enabled-primary',
      backendKind: 'neo4j',
      failOpen: true,
    });
    runtimeMocks.executeWithResilience.mockImplementation(async ({ operation }) => ({
      ok: true,
      degraded: false,
      value: await operation(),
    }));
  });

  it('retains an injected graph-query backend and registers its graph channel', async () => {
    const backend = createBackend();
    const app = createApp(backend);
    channelMocks.createGraphChannel.mockReturnValue({ name: 'graph' });

    await bootstrapRepositories(app);

    expect(app.skillShareer.graphQueryBackend).toBe(backend);
    expect(app.skillShareer.channelRegistry.register).toHaveBeenCalledWith({ name: 'graph' });
  });

  it('keeps graph query disabled and leaves the graph channel unregistered without an injected backend', async () => {
    const app = createApp();

    await bootstrapRepositories(app);

    expect(app.skillShareer.graphQueryBackend).toBeUndefined();
    expect(app.skillShareer.graphQuery).toEqual({
      mode: 'disabled',
      backendKind: 'memory',
      failOpen: true,
    });
    expect(app.skillShareer.channelRegistry.register).not.toHaveBeenCalled();
  });

  it('does not construct a Neo4j primary when graph DB is enabled without an injected fallback', async () => {
    const app = createApp();
    app.skillShareer.config.graphDb.enabled = true;
    app.skillShareer.config.graphDb.database = 'neo4j';
    app.skillShareer.config.graphDb.password = 'password';
    app.skillShareer.config.graphDb.uri = 'bolt://localhost:7687';
    app.skillShareer.config.graphDb.username = 'neo4j';

    await bootstrapRepositories(app);

    expect(graphQueryMocks.createNeo4jGraphQueryBackend).not.toHaveBeenCalled();
    expect(app.skillShareer.channelRegistry.register).not.toHaveBeenCalled();
  });
});

function createBackendWithKind(kind: GraphQueryBackend['kind']): GraphQueryBackend {
  return { ...createBackend(), kind };
}
