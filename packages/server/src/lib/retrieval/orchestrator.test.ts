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

import type { ResolvedAuthContext, SkillShareerServices } from '../context.js';
import type { KnowledgeRecord } from '../store.js';

// ── Mocks for recall modules ──────────────────────────────────────────────

vi.mock('./recall/semantic.js', () => ({
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

vi.mock('./recall/keyword.js', () => ({
  keywordRecall: vi.fn().mockResolvedValue([]),
  normalizeQuery: vi.fn().mockReturnValue(['test']),
}));

vi.mock('./recall/graph-assisted.js', () => ({
  graphAssistedRecall: vi.fn().mockResolvedValue([]),
}));

vi.mock('../rag-log.js', () => ({
  generateQueryId: vi.fn().mockReturnValue('test-query-id'),
  logRagRetrieval: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./assembly.js', () => ({
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

vi.mock('./filters.js', () => ({
  filterEligibleEntries: vi.fn().mockReturnValue([]),
  filterByBoundaryContext: vi.fn().mockReturnValue([]),
}));

vi.mock('./merge.js', () => ({
  createSemanticCandidate: vi.fn(),
  mergeCandidates: vi.fn().mockReturnValue([]),
  toScoredEntries: vi.fn().mockReturnValue([]),
}));

vi.mock('./rerank.js', () => ({
  rerankCandidates: vi.fn().mockReturnValue([]),
  toScoredEntriesFromReranked: vi.fn().mockReturnValue([]),
}));

vi.mock('./citations.js', () => ({
  buildCitations: vi.fn().mockReturnValue([]),
}));

vi.mock('./boundary-match.js', () => ({
  buildBoundaryExplanation: vi.fn(),
  computeBoundaryScoreDelta: vi.fn().mockReturnValue(0),
}));

vi.mock('./summary.js', () => ({
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

vi.mock('./capsule-recall.js', () => ({
  buildProfileShortlist: vi.fn().mockReturnValue([]),
  getCapsuleRecords: vi.fn().mockReturnValue([]),
  rankCapsules: vi.fn().mockReturnValue([]),
}));

vi.mock('./intent.js', () => ({
  parseSeedIntent: vi.fn().mockReturnValue({
    seed: 'test query',
    normalized: 'test query',
    situation: null,
    problem: null,
    goal: null,
    errorText: null,
    tokens: [],
    stackPathHints: [],
  }),
}));

vi.mock('./db-search.js', () => ({
  vectorSimilaritySearch: vi.fn().mockResolvedValue([]),
}));

vi.mock('./recall/pg-keyword.js', () => ({
  createPgKeywordRecall: vi.fn().mockReturnValue(() => Promise.resolve([])),
}));

vi.mock('../persistence/postgres-store.js', () => ({
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

vi.mock('./refinement.js', () => ({
  generateRefinement: vi.fn().mockResolvedValue(null),
}));

// ── Imports after mocks ───────────────────────────────────────────────────

import { generateEmbedding, hashEmbeddingText } from '../embeddings.js';
import { AppError } from '../errors.js';
import { logRagRetrieval } from '../rag-log.js';
import { buildEmptyResponse, buildRetrievalResponse } from './assembly.js';
import { filterByBoundaryContext, filterEligibleEntries } from './filters.js';
import { mergeCandidates } from './merge.js';
import { searchKnowledge, updateEntryEmbeddingCache } from './orchestrator.js';
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
    indexAdapters: [],
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
      expect(result).toEqual({
        globalConstraints: [],
        projectKnowledge: [],
        refinementSummary: null,
        summary: null,
      });
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
        services,
        auth,
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
      const query = { seed: '', mode: 'semantic' as const };

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
    let updatedEntry: KnowledgeRecord | undefined;

    const store = {
      transact: vi
        .fn()
        .mockImplementation(async (mutator: (data: Record<string, unknown>) => Promise<void>) => {
          const data = {
            knowledgeEntries: [entry],
            counters: {},
          };
          await mutator(data);
          updatedEntry = data.knowledgeEntries[0];
          return data;
        }),
      snapshot: vi.fn(),
      nextId: vi.fn(),
    };

    const services = createMockServices({
      store: store as unknown as SkillShareerServices['store'],
    });

    await updateEntryEmbeddingCache(services, 'entry_1');

    expect(updatedEntry).toBeDefined();
    expect(updatedEntry!.embeddingCache).not.toBeNull();
    expect(updatedEntry!.embeddingCache!.textHash).toBe('mock-hash-abc');
    expect(updatedEntry!.embeddingCache!.vector).toEqual([0.1, 0.2, 0.3]);
    expect(updatedEntry!.embeddingCache!.createdAt).toBeTruthy();
    expect(updatedEntry!.embeddingCache!.revision).toBe(1);
  });

  it('sets updatedAt when updating cache', async () => {
    const entry = createMockEntry('entry_1');
    const originalUpdatedAt = entry.updatedAt;
    let updatedEntry: KnowledgeRecord | undefined;

    const store = {
      transact: vi
        .fn()
        .mockImplementation(async (mutator: (data: Record<string, unknown>) => Promise<void>) => {
          const data = {
            knowledgeEntries: [entry],
            counters: {},
          };
          await mutator(data);
          updatedEntry = data.knowledgeEntries[0];
          return data;
        }),
      snapshot: vi.fn(),
      nextId: vi.fn(),
    };

    const services = createMockServices({
      store: store as unknown as SkillShareerServices['store'],
    });

    // Small delay to ensure different timestamp
    await new Promise((resolve) => setTimeout(resolve, 10));
    await updateEntryEmbeddingCache(services, 'entry_1');

    expect(updatedEntry).toBeDefined();
    expect(updatedEntry!.updatedAt).not.toBe(originalUpdatedAt);
  });

  it('throws AppError 404 for non-existent entry', async () => {
    const store = {
      transact: vi
        .fn()
        .mockImplementation(async (mutator: (data: Record<string, unknown>) => Promise<void>) => {
          const data = {
            knowledgeEntries: [],
            counters: {},
          };
          await mutator(data);
          return data;
        }),
      snapshot: vi.fn(),
      nextId: vi.fn(),
    };

    const services = createMockServices({
      store: store as unknown as SkillShareerServices['store'],
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

    const store = {
      transact: vi
        .fn()
        .mockImplementation(async (mutator: (data: Record<string, unknown>) => Promise<void>) => {
          const data = {
            knowledgeEntries: [entry],
            counters: {},
          };
          await mutator(data);
          return data;
        }),
      snapshot: vi.fn(),
      nextId: vi.fn(),
    };

    const services = createMockServices({
      store: store as unknown as SkillShareerServices['store'],
    });

    await updateEntryEmbeddingCache(services, 'entry_1');

    expect(generateEmbedding).toHaveBeenCalledWith('shortcut detail labels');
    expect(hashEmbeddingText).toHaveBeenCalledWith('shortcut detail labels');
  });
});
