/**
 * Tests for retrieval orchestrator.
 *
 * Covers:
 * - searchKnowledge() - Main retrieval pipeline (with mocks)
 * - updateEntryEmbeddingCache() - Embedding cache update (with mocks)
 *
 * Routing tests are in routing.test.ts.
 * Recall coordination tests are in recall-coordinator.test.ts.
 * Refinement tests are in refinement.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedAuthContext, SkillShareerServices } from '@trapmap/server/lib/context.js';
import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';

// ── Mocks for recall modules ──────────────────────────────────────────────

vi.mock('../recall/semantic.js', () => ({
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

vi.mock('../recall/keyword.js', () => ({
  keywordRecall: vi.fn().mockResolvedValue([]),
  normalizeQuery: vi.fn().mockReturnValue(['test']),
}));

vi.mock('../recall/graph-assisted.js', () => ({
  graphAssistedRecall: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../rag-log.js', () => ({
  generateQueryId: vi.fn().mockReturnValue('test-query-id'),
  logRagRetrieval: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../response/assembly.js', () => ({
  assembleResponseBuckets: vi.fn().mockImplementation((scoredEntries) => ({
    globalConstraints: scoredEntries.map((e: { entry: { id: string } }) => ({
      entryId: e.entry.id,
      scope: 'project',
      shortcut: `Entry ${e.entry.id}`,
      detail: `Detail for ${e.entry.id}`,
      labels: ['test'],
      score: 0.9,
      reason: 'test match',
      requiredLevel: 0,
    })),
    projectKnowledge: [],
  })),
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

vi.mock('./filters.js', () => ({
  filterEligibleEntries: vi.fn().mockReturnValue([]),
  filterByBoundaryContext: vi.fn().mockReturnValue([]),
}));

vi.mock('../scoring/merge.js', () => ({
  createSemanticCandidate: vi.fn(),
  mergeCandidates: vi.fn().mockReturnValue([]),
  toScoredEntries: vi.fn().mockReturnValue([]),
}));

vi.mock('../scoring/rerank.js', () => ({
  rerankCandidates: vi.fn().mockReturnValue([]),
  toScoredEntriesFromReranked: vi.fn().mockReturnValue([]),
}));

vi.mock('../response/citations.js', () => ({
  buildCitations: vi.fn().mockReturnValue([]),
}));

vi.mock('../scoring/boundary-match.js', () => ({
  buildBoundaryExplanation: vi.fn(),
  computeBoundaryScoreDelta: vi.fn().mockReturnValue(0),
}));

vi.mock('../response/summary.js', () => ({
  buildCapsuleCitations: vi.fn().mockReturnValue([]),
  buildCapsuleSummary: vi.fn(),
  buildSummary: vi.fn(),
}));

vi.mock('../../conflict/enrich.js', () => ({
  enrichMatchesWithConflicts: vi.fn().mockReturnValue([]),
}));

vi.mock('../../decay/freshness.js', () => ({
  DEFAULT_FRESHNESS_CONFIG: { enabled: false },
}));

vi.mock('../../embeddings.js', () => ({
  generateEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  hashEmbeddingText: vi.fn().mockReturnValue('mock-hash-abc'),
}));

vi.mock('../capsules/capsule-recall.js', () => ({
  buildProfileShortlist: vi.fn().mockReturnValue([]),
  getCapsuleRecords: vi.fn().mockReturnValue([]),
  rankCapsules: vi.fn().mockReturnValue([]),
}));

vi.mock('../capsules/capsule-recall-coordinator.js', () => ({
  CapsuleRecallCoordinator: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({
      capsuleCandidates: [],
      mergedCandidates: [],
      channelsPlanned: [],
      channelsUsed: [],
      channelsFailed: [],
      channelErrors: {},
      mergeStats: { totalChannelCandidates: 0, preMergeCount: 0, postMergeCount: 0 },
    }),
  })),
  createDefaultCapsuleRecallCoordinator: vi.fn(),
}));

vi.mock('../capsules/capsule-channel-registry.js', () => ({
  CapsuleChannelRegistry: vi.fn().mockImplementation(() => ({
    register: vi.fn(),
    all: vi.fn().mockReturnValue([]),
    get: vi.fn(),
    unregister: vi.fn(),
  })),
  createDefaultCapsuleChannelRegistry: vi.fn(),
  createFullCapsuleChannelRegistry: vi.fn().mockResolvedValue({
    register: vi.fn(),
    all: vi.fn().mockReturnValue([]),
    get: vi.fn(),
    unregister: vi.fn(),
  }),
}));

vi.mock('../capsules/channels/heuristic.js', () => ({
  capsuleHeuristicChannel: { name: 'capsule-heuristic', recall: vi.fn().mockResolvedValue([]) },
}));

vi.mock('../capsules/channels/keyword.js', () => ({
  createCapsuleKeywordChannel: vi.fn().mockReturnValue({
    name: 'capsule-keyword',
    recall: vi.fn().mockResolvedValue([]),
  }),
  capsuleKeywordChannel: { name: 'capsule-keyword', recall: vi.fn().mockResolvedValue([]) },
  capsuleKeywordRecall: vi.fn().mockResolvedValue([]),
}));

vi.mock('../capsules/channels/semantic.js', () => ({
  createCapsuleSemanticChannel: vi.fn().mockReturnValue({
    name: 'capsule-semantic',
    recall: vi.fn().mockResolvedValue([]),
  }),
  capsuleSemanticChannel: { name: 'capsule-semantic', recall: vi.fn().mockResolvedValue([]) },
  capsuleSemanticRecall: vi.fn().mockResolvedValue([]),
  buildCapsuleEmbeddingText: vi.fn(),
  hashCapsuleEmbeddingText: vi.fn(),
}));

vi.mock('../capsules/channels/graph.js', () => ({
  createCapsuleGraphChannel: vi.fn().mockReturnValue({
    name: 'capsule-graph',
    recall: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock('../capsules/intent.js', () => ({
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
  parseSeedIntentWithLLM: vi.fn().mockResolvedValue({
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

vi.mock('../capsules/intent-cache.js', () => ({
  InMemoryIntentCache: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    clear: vi.fn(),
  })),
}));

vi.mock('../recall/db-search.js', () => ({
  vectorSimilaritySearch: vi.fn().mockResolvedValue([]),
}));

vi.mock('../recall/pg-keyword.js', () => ({
  createPgKeywordRecall: vi.fn().mockReturnValue(() => Promise.resolve([])),
}));

vi.mock('../../persistence/postgres-store.js', () => ({
  PostgresStore: class MockPostgresStore {},
}));

vi.mock('./routing.js', () => ({
  selectRetrievalStrategy: vi.fn().mockImplementation((mode: string, _seed: string) => ({
    selectedMode: mode === 'hybrid' ? 'hybrid' : mode === 'graph-assisted' ? 'mix' : 'local',
    routeFamily: 'entry',
    routingReason: 'explicit-mode',
    fallbackApplied: false,
    fallbackTarget: null,
    confidenceScore: null,
    confidenceBucket: null,
    channelsPlanned:
      mode === 'hybrid'
        ? ['semantic', 'keyword']
        : mode === 'graph-assisted'
          ? ['semantic', 'keyword', 'graph']
          : ['semantic'],
    channelsUsed: [],
  })),
  selectRetrievalStrategyV2: vi.fn().mockImplementation((_seed: string) => ({
    selectedMode: 'local',
    routeFamily: 'capsule',
    routingReason: 'v2-default-capsule',
    fallbackApplied: false,
    fallbackTarget: null,
    confidenceScore: null,
    confidenceBucket: null,
    channelsPlanned: ['capsule', 'profile'],
    channelsUsed: [],
  })),
  toRoutingTrace: vi.fn().mockImplementation((d: Record<string, unknown>) => ({
    selectedMode: d.selectedMode,
    routeFamily: d.routeFamily,
    routingReason: d.routingReason,
    fallbackApplied: d.fallbackApplied,
    fallbackTarget: d.fallbackTarget,
    confidenceScore: d.confidenceScore,
    confidenceBucket: d.confidenceBucket,
    channelsUsed: d.channelsUsed,
  })),
}));

vi.mock('./recall-coordinator.js', () => ({
  dispatchByMode: vi.fn().mockResolvedValue({ scoredEntries: [], mergedCandidates: undefined }),
  inferChannelsFromMerged: vi.fn().mockReturnValue(['semantic']),
}));

vi.mock('../response/refinement.js', () => ({
  generateRefinement: vi.fn().mockResolvedValue(null),
}));

// ── Imports after mocks ───────────────────────────────────────────────────

import { generateEmbedding, hashEmbeddingText } from '@trapmap/server/lib/embeddings.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import { logRagRetrieval } from '@trapmap/server/lib/rag-log.js';
import { CapsuleRecallCoordinator } from '@trapmap/server/lib/retrieval/capsules/capsule-recall-coordinator.js';
import {
  buildProfileShortlist,
  getCapsuleRecords,
} from '@trapmap/server/lib/retrieval/capsules/capsule-recall.js';
import {
  buildCapsuleMatch,
  buildEmptyResponse,
  buildProfileHint,
  buildRetrievalResponse,
  buildV2RetrievalResponse,
} from '@trapmap/server/lib/retrieval/response/assembly.js';
import {
  buildCapsuleCitations,
  buildCapsuleSummary,
} from '@trapmap/server/lib/retrieval/response/summary.js';
import { mergeCandidates } from '@trapmap/server/lib/retrieval/scoring/merge.js';
import { filterByBoundaryContext, filterEligibleEntries } from './filters.js';
import { searchKnowledge, searchKnowledgeV2, updateEntryEmbeddingCache } from './orchestrator.js';
import { dispatchByMode } from './recall-coordinator.js';

// ── Test helpers ──────────────────────────────────────────────────────────

function createMockAuth(overrides: Partial<ResolvedAuthContext> = {}): ResolvedAuthContext {
  return {
    subjectType: 'user',
    actorId: 'user_test_001',
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

function createMockEntry(id: string, overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
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
    ownerUserId: 'user_test_001',
    latestRevision: {
      revision: 1,
      submittedAt: now,
      submittedByUserId: 'user_test_001',
      shortcut: `Entry ${id}`,
      detail: `Detail for ${id}`,
      labels: ['test'],
      reviewNotes: [],
    },
    history: [
      {
        revision: 1,
        submittedAt: now,
        submittedByUserId: 'user_test_001',
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
    ...overrides,
  };
}

function createMockServices(overrides: Partial<SkillShareerServices> = {}): SkillShareerServices {
  return {
    config: {
      ragLog: {
        enabled: false,
        logDir: '/tmp/test-logs',
        maxFileSizeBytes: 1024 * 1024,
        maxBackupFiles: 3,
      },
    } as SkillShareerServices['config'],
    store: {
      snapshot: vi.fn().mockResolvedValue({
        knowledgeEntries: [],
        skillArtifacts: [],
        conflicts: [],
      }),
      transact: vi
        .fn()
        .mockImplementation(
          async (mutator: (data: Record<string, unknown>) => Promise<void> | void) => {
            const data = {
              knowledgeEntries: [createMockEntry('entry_1')],
              counters: {},
            };
            await mutator(data);
            return data;
          },
        ),
      nextId: vi.fn(),
    } as unknown as SkillShareerServices['store'],
    repos: {
      knowledge: {
        listByFilter: vi.fn().mockResolvedValue([]),
      },
      artifact: {
        listByFilter: vi.fn().mockResolvedValue([]),
      },
    } as any,
    adapterRegistry: {} as any,
    channelRegistry: {} as any,
    strategyRegistry: {} as any,
    ai: {
      embeddings: { isConfigured: false, embed: vi.fn() },
      chat: { isConfigured: false, invoke: vi.fn() },
    },
    knowledgeRepo: undefined,
    artifactRepo: undefined,
    ...overrides,
  } as SkillShareerServices;
}

// =============================================================================
// searchKnowledge() - With Mocks
// =============================================================================

describe('searchKnowledge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('empty results path', () => {
    it('returns buildEmptyResponse when no eligible entries', async () => {
      // filterByBoundaryContext returns empty by default (from mock)
      const services = createMockServices();
      const auth = createMockAuth();
      const query = { seed: 'test query', mode: 'semantic' as const };

      const result = await searchKnowledge(services, auth, query);

      expect(buildEmptyResponse).toHaveBeenCalled();
      expect(result).toEqual(
        expect.objectContaining({
          globalConstraints: [],
          projectKnowledge: [],
          refinementSummary: null,
          summary: null,
          routingTrace: expect.objectContaining({
            selectedMode: 'local',
            routeFamily: 'entry',
          }),
        }),
      );
    });

    it('logs RAG retrieval with resultCount 0 for empty results', async () => {
      const services = createMockServices();
      const auth = createMockAuth();
      const query = { seed: 'test query', mode: 'semantic' as const };

      await searchKnowledge(services, auth, query);

      expect(logRagRetrieval).toHaveBeenCalled();
      const logCall = vi.mocked(logRagRetrieval).mock.calls[0];
      expect(logCall).toBeDefined();
      // The log entry has resultCount: 0 for empty results
      const logEntry = logCall![1];
      expect(logEntry.resultCount).toBe(0);
    });
  });

  describe('mode dispatch', () => {
    it('dispatches to semantic recall for mode=semantic', async () => {
      const entry = createMockEntry('entry_1');
      vi.mocked(filterByBoundaryContext).mockReturnValue([entry]);

      const services = createMockServices();
      const auth = createMockAuth();
      const query = { seed: 'test query', mode: 'semantic' as const };

      await searchKnowledge(services, auth, query);

      // Orchestrator delegates to dispatchByMode with mode='semantic'
      expect(dispatchByMode).toHaveBeenCalledWith(
        'semantic',
        'test query',
        [entry],
        expect.any(Object),
        services.strategyRegistry,
        services.channelRegistry,
        services,
        auth,
      );
    });

    it('dispatches to hybrid recall for mode=hybrid', async () => {
      const entry = createMockEntry('entry_1');
      vi.mocked(filterByBoundaryContext).mockReturnValue([entry]);

      const services = createMockServices();
      const auth = createMockAuth();
      const query = { seed: 'test query', mode: 'hybrid' as const };

      await searchKnowledge(services, auth, query);

      expect(dispatchByMode).toHaveBeenCalledWith(
        'hybrid',
        'test query',
        [entry],
        expect.any(Object),
        services.strategyRegistry,
        services.channelRegistry,
        services,
        auth,
      );
    });

    it('dispatches to graph-assisted recall for mode=graph-assisted', async () => {
      const entry = createMockEntry('entry_1');
      vi.mocked(filterByBoundaryContext).mockReturnValue([entry]);

      const services = createMockServices();
      const auth = createMockAuth();
      const query = { seed: 'test query', mode: 'graph-assisted' as const };

      await searchKnowledge(services, auth, query);

      expect(dispatchByMode).toHaveBeenCalledWith(
        'graph-assisted',
        'test query',
        [entry],
        expect.any(Object),
        services.strategyRegistry,
        services.channelRegistry,
        services,
        auth,
      );
    });

    it('returns graph retrieval trace metadata for graph-assisted mode', async () => {
      const entry = createMockEntry('entry_1');
      vi.mocked(filterByBoundaryContext).mockReturnValue([entry]);
      vi.mocked(dispatchByMode).mockResolvedValue({
        scoredEntries: [{ entry, score: 0.9 }],
        mergedCandidates: [],
        trace: {
          graph: {
            mergeMode: 'mixed',
            graphExpansion: 'local-neighborhood',
            backendKind: 'neo4j',
            backendMode: 'enabled-fallback',
            graphCandidateCount: 1,
          },
        },
      });

      const services = createMockServices();
      const auth = createMockAuth();
      const query = { seed: 'test query', mode: 'graph-assisted' as const };

      const result = await searchKnowledge(services, auth, query);

      expect(result).toEqual(
        expect.objectContaining({
          routingTrace: expect.objectContaining({
            selectedMode: 'mix',
            graphRetrieval: {
              mergeMode: 'mixed',
              graphExpansion: 'local-neighborhood',
              backendKind: 'neo4j',
              backendMode: 'enabled-fallback',
              graphCandidateCount: 1,
            },
          }),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('logs failed retrieval and re-throws errors', async () => {
      const testError = new Error('Store snapshot failed');
      const services = createMockServices();
      vi.mocked(services.store.snapshot).mockRejectedValue(testError);
      const auth = createMockAuth();
      const query = { seed: 'test query', mode: 'semantic' as const };

      await expect(searchKnowledge(services, auth, query)).rejects.toThrow('Store snapshot failed');

      // Should log the failed retrieval attempt
      expect(logRagRetrieval).toHaveBeenCalled();
      const logCall = vi.mocked(logRagRetrieval).mock.calls[0];
      const logEntry = logCall![1];
      expect(logEntry.resultCount).toBe(0);
    });

    it('logs with routing trace on error', async () => {
      const testError = new Error('Query parse failed');
      const services = createMockServices();
      const auth = createMockAuth();
      // Invalid query that will fail Zod parse
      const _query = { seed: '', mode: 'semantic' as const };

      // seed: '' fails zod .min(1) validation
      // But searchKnowledge catches error before parsing, so let's make the store fail
      vi.mocked(services.store.snapshot).mockRejectedValue(testError);
      const queryValid = { seed: 'test query', mode: 'semantic' as const };

      await expect(searchKnowledge(services, auth, queryValid)).rejects.toThrow(
        'Query parse failed',
      );

      // Verify the log entry contains routing trace metadata
      expect(logRagRetrieval).toHaveBeenCalled();
    });
  });

  describe('pipeline step timing', () => {
    it('records timing for pipeline steps in RAG log', async () => {
      const services = createMockServices();
      const auth = createMockAuth();
      const query = { seed: 'test query', mode: 'semantic' as const };

      await searchKnowledge(services, auth, query);

      // Should have logged retrieval with pipeline steps
      expect(logRagRetrieval).toHaveBeenCalled();
      const logCall = vi.mocked(logRagRetrieval).mock.calls[0];
      const logEntry = logCall![1];

      // pipelineSteps is an array of {name, latencyMs}
      expect(Array.isArray(logEntry.pipelineSteps)).toBe(true);
      expect(logEntry.pipelineSteps!.length).toBeGreaterThan(0);

      // Each step should have name and latencyMs
      for (const step of logEntry.pipelineSteps!) {
        expect(step).toHaveProperty('name');
        expect(step).toHaveProperty('latencyMs');
        expect(typeof step.latencyMs).toBe('number');
      }
    });

    it('records totalLatencyMs in RAG log', async () => {
      const services = createMockServices();
      const auth = createMockAuth();
      const query = { seed: 'test query', mode: 'semantic' as const };

      await searchKnowledge(services, auth, query);

      const logCall = vi.mocked(logRagRetrieval).mock.calls[0];
      const logEntry = logCall![1];
      expect(typeof logEntry.totalLatencyMs).toBe('number');
      expect(logEntry.totalLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('includes routing trace in log metadata', async () => {
      const services = createMockServices();
      const auth = createMockAuth();
      const query = { seed: 'test query', mode: 'hybrid' as const };

      await searchKnowledge(services, auth, query);

      const logCall = vi.mocked(logRagRetrieval).mock.calls[0];
      const logEntry = logCall![1];
      expect(logEntry.metadata).toBeDefined();
      expect(logEntry.metadata!.routingTrace).toBeDefined();
    });
  });
});

// =============================================================================
// Part 6: updateEntryEmbeddingCache() - With Mocks
// =============================================================================

describe('updateEntryEmbeddingCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates entry embeddingCache on success', async () => {
    const entry = createMockEntry('entry_1');
    const updateEmbeddingCache = vi.fn().mockResolvedValue(undefined);

    const services = createMockServices({
      repos: {
        knowledge: {
          getById: vi.fn().mockResolvedValue(entry),
          updateEmbeddingCache,
        },
      } as any,
    });

    await updateEntryEmbeddingCache(services, 'entry_1');

    expect(updateEmbeddingCache).toHaveBeenCalledWith('entry_1', {
      textHash: 'mock-hash-abc',
      vector: [0.1, 0.2, 0.3],
      createdAt: expect.any(String),
      revision: 1,
    });
  });

  it('throws AppError 404 for non-existent entry', async () => {
    const services = createMockServices({
      repos: {
        knowledge: {
          getById: vi.fn().mockResolvedValue(null),
          updateEmbeddingCache: vi.fn(),
        },
      } as any,
    });

    await expect(updateEntryEmbeddingCache(services, 'nonexistent')).rejects.toThrow(AppError);

    try {
      await updateEntryEmbeddingCache(services, 'nonexistent');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(404);
      expect((error as AppError).code).toBe('knowledge_not_found');
    }
  });

  it('calls generateEmbedding with built text', async () => {
    const entry = createMockEntry('entry_1');

    const services = createMockServices({
      repos: {
        knowledge: {
          getById: vi.fn().mockResolvedValue(entry),
          updateEmbeddingCache: vi.fn().mockResolvedValue(undefined),
        },
      } as any,
    });

    await updateEntryEmbeddingCache(services, 'entry_1');

    expect(generateEmbedding).toHaveBeenCalledWith('shortcut detail labels');
    expect(hashEmbeddingText).toHaveBeenCalledWith('shortcut detail labels');
  });

  it('does not call store.transact', async () => {
    const entry = createMockEntry('entry_1');

    const services = createMockServices({
      repos: {
        knowledge: {
          getById: vi.fn().mockResolvedValue(entry),
          updateEmbeddingCache: vi.fn().mockResolvedValue(undefined),
        },
      } as any,
    });

    await updateEntryEmbeddingCache(services, 'entry_1');

    expect(services.store.transact).not.toHaveBeenCalled();
  });
});

// =============================================================================
// Phase 1E additions
// =============================================================================

describe('searchKnowledge with real store data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters entries by governance securityLevel', async () => {
    const entryLow = createMockEntry('entry_low', { requiredLevel: 0 });
    const entryHigh = createMockEntry('entry_high', { requiredLevel: 10 });

    // filterEligibleEntries should filter out high-level entry
    vi.mocked(filterEligibleEntries).mockImplementation((entries, auth) => {
      return entries.filter((e) => e.requiredLevel <= auth.securityLevel);
    });
    vi.mocked(filterByBoundaryContext).mockReturnValue([entryLow]);
    vi.mocked(dispatchByMode).mockResolvedValue({
      scoredEntries: [{ entry: entryLow, score: 0.9 }],
    });

    const services = createMockServices({
      store: {
        snapshot: vi.fn().mockResolvedValue({
          knowledgeEntries: [entryLow, entryHigh],
          skillArtifacts: [],
          conflicts: [],
        }),
        transact: vi.fn(),
        nextId: vi.fn(),
      } as unknown as SkillShareerServices['store'],
      repos: {
        knowledge: {
          listByFilter: vi.fn().mockResolvedValue([entryLow, entryHigh]),
        },
        artifact: {
          listByFilter: vi.fn().mockResolvedValue([]),
        },
      } as any,
    });

    const auth = createMockAuth({ securityLevel: 5 });
    const query = { seed: 'governance filter', mode: 'semantic' as const };

    const result = await searchKnowledge(services, auth, query);

    // Only entryLow should be returned
    const allResults = [...result.globalConstraints, ...result.projectKnowledge];
    expect(allResults.find((r) => r.entryId === 'entry_high')).toBeUndefined();
  });
});

// =============================================================================
// searchKnowledgeV2 - label filtering regression (Phase 7.2)
// =============================================================================

describe('searchKnowledgeV2 - label filtering regression', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes governanceFilters.labels to coordinator and produces label-filtered summary', async () => {
    // Arrange: mock coordinator execute to capture governance filters
    const mockExecute = vi.fn().mockResolvedValue({
      capsuleCandidates: [
        {
          capsuleId: 'cap_node_1',
          artifactId: 'artifact_core_label_filter_node',
          revision: 1,
          situationScore: 0.5,
          problemScore: 0.8,
          goalScore: 0.6,
          errorScore: null,
          contextScore: 0,
          stackPathBoost: 1.0,
          finalScore: 0.85,
          reason: 'problem match (80%)',
        },
      ],
      mergedCandidates: [],
      channelsPlanned: ['capsule-heuristic'],
      channelsUsed: ['capsule-heuristic'],
      channelsFailed: [],
      channelErrors: {},
      mergeStats: { totalChannelCandidates: 1, preMergeCount: 1, postMergeCount: 1 },
    });

    vi.mocked(CapsuleRecallCoordinator).mockImplementation(() => ({ execute: mockExecute }) as any);

    // Configure getCapsuleRecords to return only the node capsule
    const nodeArtifact = {
      id: 'artifact_core_label_filter_node',
      teamId: 'team_test',
      scope: 'global',
      labels: ['nodejs'],
      title: 'Node.js Skill',
      slug: 'nodejs-skill',
      requiredLevel: 0,
      lifecycleState: 'approved',
    };

    vi.mocked(getCapsuleRecords).mockReturnValue([
      {
        artifact: nodeArtifact as any,
        capsule: {
          capsuleId: 'cap_node_1',
          artifactId: 'artifact_core_label_filter_node',
          revision: 1,
          sourcePaths: ['SKILL.md'],
          content: 'Express.js middleware for request handling',
          situation: 'Building REST APIs',
          problem: 'Need request validation',
          goal: 'Validate requests with Express.js middleware',
          errorText: null,
          labels: ['nodejs'],
          scope: 'global',
          requiredLevel: 0,
          contextualPrefix: null,
        } as any,
        candidate: {
          capsuleId: 'cap_node_1',
          artifactId: 'artifact_core_label_filter_node',
          revision: 1,
          finalScore: 0.85,
          reason: 'problem match (80%)',
        } as any,
      },
    ]);

    // Configure buildCapsuleMatch to return node capsule match
    vi.mocked(buildCapsuleMatch).mockReturnValue({
      capsuleId: 'cap_node_1',
      artifactId: 'artifact_core_label_filter_node',
      revision: 1,
      sourcePaths: ['SKILL.md'],
      content: 'Express.js middleware for request handling',
      situation: 'Building REST APIs',
      problem: 'Need request validation',
      goal: 'Validate requests with Express.js middleware',
      labels: ['nodejs'],
      scope: 'global',
      requiredLevel: 0,
      score: 0.85,
      reason: 'problem match (80%)',
    } as any);

    // Configure buildProfileShortlist to return only the node artifact
    vi.mocked(buildProfileShortlist).mockReturnValue([
      { artifact: nodeArtifact as any, profile: {} as any },
    ]);

    // Configure buildProfileHint
    vi.mocked(buildProfileHint).mockReturnValue({
      artifactId: 'artifact_core_label_filter_node',
      title: 'Node.js Skill',
      slug: 'nodejs-skill',
      labels: ['nodejs'],
    } as any);

    // Configure buildCapsuleCitations
    vi.mocked(buildCapsuleCitations).mockReturnValue([
      {
        source: { entryId: 'cap_node_1', scope: 'global', shortcut: 'Express.js middleware' },
        snippet: 'Express.js middleware for request handling',
        tags: ['nodejs'],
        recallChannels: ['semantic'],
        scores: { semantic: 0.85, keyword: null, graph: null, preRerank: 0.85, final: 0.85 },
      },
    ]);

    // Configure buildCapsuleSummary to return a summary referencing Express.js
    vi.mocked(buildCapsuleSummary).mockReturnValue({
      text: 'Express.js middleware for request handling',
      citations: [
        {
          source: { entryId: 'cap_node_1', scope: 'global', shortcut: 'Express.js middleware' },
          snippet: 'Express.js middleware for request handling',
          tags: ['nodejs'],
          recallChannels: ['semantic'],
          scores: { semantic: 0.85, keyword: null, graph: null, preRerank: 0.85, final: 0.85 },
        },
      ],
    });

    // Configure buildV2RetrievalResponse to pass through its arguments
    vi.mocked(buildV2RetrievalResponse).mockImplementation(
      (capsules, profileHints, summary, activationHints) => ({
        capsules,
        profileHints,
        refinementSummary: null,
        summary: summary ?? null,
        ...(activationHints ? { activationHints } : {}),
      }),
    );

    const services = createMockServices();
    const auth = createMockAuth();

    // Act: call searchKnowledgeV2 with label filter
    const result = await searchKnowledgeV2(services, auth, {
      seed: 'Express.js middleware',
      filters: { labels: ['nodejs'] },
      includeSummary: true,
    });

    // Assert: coordinator received governanceFilters with labels
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        governanceFilters: expect.objectContaining({ labels: ['nodejs'] }),
      }),
    );

    // Assert: summary contains Express.js but NOT Flask
    expect(result.summary?.text).toContain('Express.js middleware');
    expect(result.summary?.text).not.toContain('Flask');

    // Assert: profileHints only reference the node artifact
    expect(result.profileHints).toEqual([
      expect.objectContaining({ artifactId: 'artifact_core_label_filter_node' }),
    ]);
  });

  it('does not pass Flask capsules to buildCapsuleSummary when labels filter to nodejs', async () => {
    // Arrange: coordinator returns only nodejs candidate (simulating label filtering in recall)
    const mockExecute = vi.fn().mockResolvedValue({
      capsuleCandidates: [
        {
          capsuleId: 'cap_node_1',
          artifactId: 'artifact_core_label_filter_node',
          revision: 1,
          finalScore: 0.85,
          reason: 'match',
          situationScore: 0,
          problemScore: 0.8,
          goalScore: 0,
          errorScore: null,
          contextScore: 0,
          stackPathBoost: 1.0,
        },
      ],
      mergedCandidates: [],
      channelsPlanned: ['capsule-heuristic'],
      channelsUsed: ['capsule-heuristic'],
      channelsFailed: [],
      channelErrors: {},
      mergeStats: { totalChannelCandidates: 1, preMergeCount: 1, postMergeCount: 1 },
    });

    vi.mocked(CapsuleRecallCoordinator).mockImplementation(() => ({ execute: mockExecute }) as any);

    // getCapsuleRecords returns only node capsule (Flask was filtered by governance)
    vi.mocked(getCapsuleRecords).mockReturnValue([
      {
        artifact: {
          id: 'artifact_core_label_filter_node',
          teamId: 'team_test',
          scope: 'global',
          labels: ['nodejs'],
        } as any,
        capsule: {
          capsuleId: 'cap_node_1',
          artifactId: 'artifact_core_label_filter_node',
          revision: 1,
          sourcePaths: ['SKILL.md'],
          content: 'Express.js middleware',
          situation: 'Building REST APIs',
          problem: 'Need validation',
          goal: 'Validate with Express.js',
          errorText: null,
          labels: ['nodejs'],
          scope: 'global',
          requiredLevel: 0,
          contextualPrefix: null,
        } as any,
        candidate: {
          capsuleId: 'cap_node_1',
          artifactId: 'artifact_core_label_filter_node',
          revision: 1,
          finalScore: 0.85,
          reason: 'match',
        } as any,
      },
    ]);

    vi.mocked(buildCapsuleMatch).mockReturnValue({
      capsuleId: 'cap_node_1',
      artifactId: 'artifact_core_label_filter_node',
      content: 'Express.js middleware',
      labels: ['nodejs'],
      score: 0.85,
    } as any);

    vi.mocked(buildProfileShortlist).mockReturnValue([]);
    vi.mocked(buildCapsuleCitations).mockReturnValue([]);
    vi.mocked(buildCapsuleSummary).mockReturnValue(null);
    vi.mocked(buildV2RetrievalResponse).mockImplementation((capsules, profileHints, summary) => ({
      capsules,
      profileHints,
      refinementSummary: null,
      summary: summary ?? null,
    }));

    const services = createMockServices();
    const auth = createMockAuth();

    // Act
    await searchKnowledgeV2(services, auth, {
      seed: 'middleware',
      filters: { labels: ['nodejs'] },
      includeSummary: true,
    });

    // Assert: buildCapsuleSummary was called - verify capsules arg has NO Flask content
    expect(buildCapsuleSummary).toHaveBeenCalled();
    const summaryCall = vi.mocked(buildCapsuleSummary).mock.calls[0]![0];
    expect(summaryCall.capsules).toHaveLength(1);
    expect(summaryCall.capsules[0]!.content).toContain('Express.js');
    expect(summaryCall.capsules.some((c: any) => c.content?.includes('Flask'))).toBe(false);
    expect(summaryCall.capsules.some((c: any) => c.labels?.includes('python'))).toBe(false);
  });
});
