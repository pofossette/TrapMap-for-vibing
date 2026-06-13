/**
 * Phase 70 Nyquist Gap Validation - Gap 3: Retrieval orchestrator.
 *
 * Tests that the orchestrator correctly combines multiple recall paths
 * (semantic, keyword, graph-assisted) and produces proper routing decisions.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetRetrievalReadModelCacheForTests } from '@trapmap/server/lib/cache/retrieval-read-model-cache.js';
import type { ResolvedAuthContext, SkillShareerServices } from '@trapmap/server/lib/context.js';
import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';

vi.mock('../retrieval/recall/semantic.js', () => ({
  getQueryEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  getEntryEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  cosineSimilarity: vi.fn().mockReturnValue(0.8),
  computeScore: vi.fn().mockReturnValue(0.8),
  buildEmbeddingText: vi.fn().mockReturnValue('shortcut detail labels'),
  optimizedSemanticRecall: vi.fn().mockResolvedValue({
    scoredEntries: [],
    cacheStats: { totalEntries: 0, cacheHits: 0, cacheMisses: 0, hitRate: 0 },
  }),
}));

vi.mock('../retrieval/recall/keyword.js', () => ({
  keywordRecall: vi.fn().mockResolvedValue([]),
  normalizeQuery: vi.fn().mockReturnValue(['test']),
}));

vi.mock('../retrieval/recall/graph-assisted.js', () => ({
  graphAssistedRecall: vi.fn().mockResolvedValue([]),
}));

vi.mock('../rag-log.js', () => ({
  generateQueryId: vi.fn().mockReturnValue('test-query-id'),
  logRagRetrieval: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../retrieval/response/assembly.js', () => ({
  assembleResponseBuckets: vi.fn().mockReturnValue({
    globalConstraints: [],
    projectKnowledge: [],
  }),
  buildAllActivationHints: vi.fn().mockReturnValue([]),
  buildCapsuleMatch: vi.fn(),
  buildEmptyResponse: vi.fn().mockReturnValue({
    globalConstraints: [],
    projectKnowledge: [],
    refinementSummary: null,
    summary: null,
  }),
  buildEmptyV2Response: vi.fn().mockReturnValue({
    capsules: [],
    profileHints: [],
    summary: null,
    activationHints: [],
  }),
  buildProfileHint: vi.fn(),
  buildRetrievalResponse: vi.fn().mockReturnValue({
    globalConstraints: [],
    projectKnowledge: [],
    refinementSummary: null,
    summary: null,
  }),
  buildV2RetrievalResponse: vi.fn(),
}));

vi.mock('../retrieval/orchestration/filters.js', () => ({
  filterEligibleEntries: vi.fn().mockReturnValue([]),
  filterByBoundaryContext: vi.fn().mockReturnValue([]),
}));

vi.mock('../retrieval/scoring/merge.js', () => ({
  createSemanticCandidate: vi.fn(),
  mergeCandidates: vi.fn().mockReturnValue([]),
  toScoredEntries: vi.fn().mockReturnValue([]),
}));

vi.mock('../retrieval/scoring/rerank.js', () => ({
  rerankCandidates: vi.fn().mockReturnValue([]),
  toScoredEntriesFromReranked: vi.fn().mockReturnValue([]),
}));

vi.mock('../retrieval/response/citations.js', () => ({
  buildCitations: vi.fn().mockReturnValue([]),
}));

vi.mock('../retrieval/scoring/boundary-match.js', () => ({
  buildBoundaryExplanation: vi.fn(),
  computeBoundaryScoreDelta: vi.fn().mockReturnValue(0),
}));

vi.mock('../retrieval/response/summary.js', () => ({
  buildCapsuleCitations: vi.fn().mockReturnValue([]),
  buildCapsuleSummary: vi.fn(),
  buildSummary: vi.fn(),
}));

vi.mock('../conflict/enrich.js', () => ({
  enrichMatchesWithConflicts: vi.fn().mockReturnValue([]),
}));

vi.mock('../decay/freshness.js', () => ({
  DEFAULT_FRESHNESS_CONFIG: { enabled: false },
}));

vi.mock('../embeddings.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  hashEmbeddingText: vi.fn().mockReturnValue('mock-hash-abc'),
}));

vi.mock('../retrieval/capsules/capsule-recall.js', () => ({
  buildProfileShortlist: vi.fn().mockReturnValue([]),
  getCapsuleRecords: vi.fn().mockReturnValue([]),
  rankCapsules: vi.fn().mockReturnValue([]),
}));

vi.mock('../retrieval/capsules/intent.js', () => ({
  parseSeedIntent: vi.fn().mockReturnValue({
    seed: 'test query',
    normalized: 'test query',
    situation: null,
    problem: null,
    goal: null,
    errorText: null,
    tokens: [],
    stackPathHints: [],
    category: null,
    semanticQuery: null,
    parseMethod: 'regex',
  }),
}));

vi.mock('../retrieval/recall/db-search.js', () => ({
  vectorSimilaritySearch: vi.fn().mockResolvedValue([]),
}));

vi.mock('../retrieval/recall/pg-keyword.js', () => ({
  createPgKeywordRecall: vi.fn().mockReturnValue(() => Promise.resolve([])),
}));

vi.mock('../persistence/postgres-store.js', () => ({
  PostgresStore: class MockPostgresStore {},
}));

import { logRagRetrieval } from '@trapmap/server/lib/rag-log.js';
import {
  filterByBoundaryContext,
  filterEligibleEntries,
} from '@trapmap/server/lib/retrieval/orchestration/filters.js';
import { searchKnowledge } from '@trapmap/server/lib/retrieval/orchestration/orchestrator.js';
import {
  selectRetrievalStrategy,
  selectRetrievalStrategyV2,
} from '@trapmap/server/lib/retrieval/orchestration/routing.js';
import { graphAssistedRecall } from '@trapmap/server/lib/retrieval/recall/graph-assisted.js';
import { keywordRecall } from '@trapmap/server/lib/retrieval/recall/keyword.js';
import { getQueryEmbedding } from '@trapmap/server/lib/retrieval/recall/semantic.js';
import { buildEmptyResponse } from '@trapmap/server/lib/retrieval/response/assembly.js';

import { ChannelRegistry } from '@trapmap/server/lib/retrieval/orchestration/channel-registry.js';
import { StrategyRegistry } from '@trapmap/server/lib/retrieval/orchestration/strategy-registry.js';

function makeAuth(overrides: Partial<ResolvedAuthContext> = {}): ResolvedAuthContext {
  return {
    subjectType: 'user',
    actorId: 'user_test',
    handle: 'testuser',
    activeTeamId: 'team_test',
    securityLevel: 5,
    effectivePermissions: ['knowledge:search'],
    user: null,
    membership: null,
    team: null,
    ...overrides,
  };
}

function makeMockEntry(id: string): KnowledgeRecord {
  const now = new Date().toISOString();
  return {
    id,
    teamId: 'team_test',
    scope: 'project',
    labels: ['test'],
    shortcut: `Entry ${id}`,
    detail: `Detail for ${id}`,
    requiredLevel: 0,
    lifecycleState: 'approved',
    ownerUserId: 'user_test',
    latestRevision: {
      revision: 1,
      submittedAt: now,
      submittedByUserId: 'user_test',
      shortcut: `Entry ${id}`,
      detail: `Detail for ${id}`,
      labels: ['test'],
      reviewNotes: [],
    },
    history: [
      {
        revision: 1,
        submittedAt: now,
        submittedByUserId: 'user_test',
        shortcut: `Entry ${id}`,
        detail: `Detail for ${id}`,
        labels: ['test'],
        reviewNotes: [],
      },
    ],
    metadata: {
      scopeLabel: 'project-knowledge',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: `sub_${id}`,
      latestSubmittedAt: now,
      latestReviewedAt: now,
      latestDecision: 'approve',
    },
    latestSubmissionId: null,
    submissionHistory: [],
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    embeddingCache: null,
    indexState: null,
    boundary: null,
    decayMeta: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeServices(overrides: Partial<SkillShareerServices> = {}): SkillShareerServices {
  return {
    config: {
      ragLog: {
        enabled: false,
        logDir: '/tmp/test',
        maxFileSizeBytes: 1024 * 1024,
        maxBackupFiles: 3,
      },
    } as SkillShareerServices['config'],
    store: {
      snapshot: vi
        .fn()
        .mockResolvedValue({ knowledgeEntries: [], skillArtifacts: [], conflicts: [] }),
      transact: vi.fn(),
      nextId: vi.fn(),
    } as unknown as SkillShareerServices['store'],
    adapterRegistry: {
      register: () => {},
      get: () => undefined,
      all: () => [],
      kinds: () => [],
      has: () => false,
    } as any,
    channelRegistry: new ChannelRegistry(),
    strategyRegistry: (() => {
      const sr = new StrategyRegistry();
      sr.register({
        version: 'semantic',
        async execute(query, _channels, eligibleEntries, services, auth) {
          const { semanticRecall } = await import(
            '@trapmap/server/lib/retrieval/orchestration/recall-coordinator.js'
          );
          return semanticRecall(query.seed, eligibleEntries, query, services, auth);
        },
      });
      sr.register({
        version: 'hybrid',
        async execute(query, _channels, eligibleEntries, services, auth) {
          const { hybridRecall } = await import(
            '@trapmap/server/lib/retrieval/orchestration/recall-coordinator.js'
          );
          return hybridRecall(query.seed, eligibleEntries, query, services, auth);
        },
      });
      sr.register({
        version: 'graph-assisted',
        async execute(query, _channels, eligibleEntries) {
          const { graphAssistedRecall } = await import(
            '@trapmap/server/lib/retrieval/orchestration/recall-coordinator.js'
          );
          return graphAssistedRecall(query.seed, eligibleEntries, query);
        },
      });
      return sr;
    })(),
    ai: {
      embeddings: { isConfigured: false, embed: vi.fn() },
      chat: { isConfigured: false, invoke: vi.fn() },
    },
    knowledgeRepo: undefined,
    artifactRepo: undefined,
    repos: {
      knowledge: {
        listByFilter: vi.fn().mockResolvedValue([]),
      },
      artifact: {
        listByFilter: vi.fn().mockResolvedValue([]),
      },
    } as any,
    ...overrides,
  } as SkillShareerServices;
}

describe('Gap 3: Retrieval orchestrator combines multiple recall paths correctly', () => {
  beforeEach(() => {
    resetRetrievalReadModelCacheForTests();
    vi.clearAllMocks();
    process.env.USE_DB_SEARCH = undefined;
  });

  it('selectRetrievalStrategy maps unknown mode to semantic (local) fallback', () => {
    const decision = selectRetrievalStrategy('keyword', 'test');
    expect(decision.selectedMode).toBe('local');
    expect(decision.fallbackApplied).toBe(true);
  });

  it('graph-assisted mode dispatches to all three recall modules', async () => {
    const entry = makeMockEntry('entry_1');
    vi.mocked(filterByBoundaryContext).mockReturnValue([entry]);
    vi.mocked(filterEligibleEntries).mockReturnValue([entry]);

    const services = makeServices({
      store: {
        snapshot: vi.fn().mockResolvedValue({
          knowledgeEntries: [entry],
          skillArtifacts: [],
          conflicts: [],
        }),
        transact: vi.fn(),
        nextId: vi.fn(),
      } as unknown as SkillShareerServices['store'],
      repos: {
        knowledge: { listByFilter: vi.fn().mockResolvedValue([entry]) },
        artifact: { listByFilter: vi.fn().mockResolvedValue([]) },
      } as any,
    });

    const auth = makeAuth();
    const query = { seed: 'test query', mode: 'graph-assisted' as const };

    await searchKnowledge(services, auth, query);

    expect(getQueryEmbedding).toHaveBeenCalled();
    expect(keywordRecall).toHaveBeenCalled();
    expect(graphAssistedRecall).toHaveBeenCalled();
  });

  it('empty snapshot produces empty response without calling recall', async () => {
    // Restore mock return values after clearAllMocks
    vi.mocked(filterEligibleEntries).mockReturnValue([]);
    vi.mocked(filterByBoundaryContext).mockReturnValue([]);

    const services = makeServices({
      store: {
        snapshot: vi.fn().mockResolvedValue({
          knowledgeEntries: [],
          skillArtifacts: [],
          conflicts: [],
        }),
        transact: vi.fn(),
        nextId: vi.fn(),
      } as unknown as SkillShareerServices['store'],
      repos: {
        knowledge: { listByFilter: vi.fn().mockResolvedValue([]) },
        artifact: { listByFilter: vi.fn().mockResolvedValue([]) },
      } as any,
    });

    const auth = makeAuth();
    const query = { seed: 'test query', mode: 'hybrid' as const };

    await searchKnowledge(services, auth, query);

    expect(buildEmptyResponse).toHaveBeenCalled();
    expect(logRagRetrieval).toHaveBeenCalled();
  });

  it('selectRetrievalStrategyV2 always produces capsule route family', () => {
    const decision = selectRetrievalStrategyV2('any query text');
    expect(decision.routeFamily).toBe('capsule');
    expect(decision.channelsPlanned).toEqual(['capsule', 'profile']);
    expect(decision.fallbackApplied).toBe(false);
  });

  it('v1 semantic mode only dispatches to semantic recall (not keyword or graph)', async () => {
    const entry = makeMockEntry('entry_1');
    vi.mocked(filterByBoundaryContext).mockReturnValue([entry]);
    vi.mocked(filterEligibleEntries).mockReturnValue([entry]);

    const services = makeServices({
      store: {
        snapshot: vi.fn().mockResolvedValue({
          knowledgeEntries: [entry],
          skillArtifacts: [],
          conflicts: [],
        }),
        transact: vi.fn(),
        nextId: vi.fn(),
      } as unknown as SkillShareerServices['store'],
      repos: {
        knowledge: { listByFilter: vi.fn().mockResolvedValue([entry]) },
        artifact: { listByFilter: vi.fn().mockResolvedValue([]) },
      } as any,
    });

    const auth = makeAuth();
    const query = { seed: 'test query', mode: 'semantic' as const };

    await searchKnowledge(services, auth, query);

    expect(getQueryEmbedding).toHaveBeenCalled();
    // Semantic mode should NOT call keyword or graph
    expect(keywordRecall).not.toHaveBeenCalled();
    expect(graphAssistedRecall).not.toHaveBeenCalled();
  });

  it('error during snapshot re-throws and logs the failure', async () => {
    const testError = new Error('DB connection lost');
    const services = makeServices({
      store: {
        snapshot: vi.fn().mockRejectedValue(testError),
        transact: vi.fn(),
        nextId: vi.fn(),
      } as unknown as SkillShareerServices['store'],
      repos: {
        knowledge: { listByFilter: vi.fn().mockResolvedValue([]) },
        artifact: { listByFilter: vi.fn().mockResolvedValue([]) },
      } as any,
    });

    const auth = makeAuth();
    const query = { seed: 'test query', mode: 'semantic' as const };

    await expect(searchKnowledge(services, auth, query)).rejects.toThrow('DB connection lost');

    // RAG log should still be written for the failure
    expect(logRagRetrieval).toHaveBeenCalled();
  });
});
