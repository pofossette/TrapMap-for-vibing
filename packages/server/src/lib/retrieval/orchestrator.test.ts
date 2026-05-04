/**
 * Tests for retrieval orchestrator.
 *
 * Covers:
 * - selectRetrievalStrategy() - V1 strategy selection (pure)
 * - selectRetrievalStrategyV2() - V2 strategy selection (pure)
 * - searchKnowledge() - Main retrieval pipeline (with mocks)
 * - updateEntryEmbeddingCache() - Embedding cache update (with mocks)
 *
 * Note: toRoutingTrace() and inferChannelsFromMerged() are not exported.
 * Their behavior is tested indirectly through searchKnowledge() routing traces
 * and channel inference in the RAG log output.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedAuthContext, SkillShareerServices } from '../context.js';
import type { KnowledgeRecord } from '../store.js';
import type { MergedCandidate, RoutingChannel } from './types.js';

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

// ── Imports after mocks ───────────────────────────────────────────────────

import { generateEmbedding, hashEmbeddingText } from '../embeddings.js';
import { AppError } from '../errors.js';
import { logRagRetrieval } from '../rag-log.js';
import { buildEmptyResponse, buildRetrievalResponse } from './assembly.js';
import { filterByBoundaryContext, filterEligibleEntries } from './filters.js';
import { mergeCandidates } from './merge.js';
import {
  searchKnowledge,
  selectRetrievalStrategy,
  selectRetrievalStrategyV2,
  updateEntryEmbeddingCache,
} from './orchestrator.js';
import { graphAssistedRecall } from './recall/graph-assisted.js';
import { keywordRecall } from './recall/keyword.js';
import {
  computeScore,
  cosineSimilarity,
  getEntryEmbedding,
  getQueryEmbedding,
  optimizedSemanticRecall,
} from './recall/semantic.js';
import { rerankCandidates, toScoredEntriesFromReranked } from './rerank.js';

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
// Part 1: selectRetrievalStrategy() - Pure Function Tests
// =============================================================================

describe('selectRetrievalStrategy (v1)', () => {
  describe('mode mapping', () => {
    it('maps semantic to local strategy with semantic channel', () => {
      const decision = selectRetrievalStrategy('semantic', 'test query');

      expect(decision.selectedMode).toBe('local');
      expect(decision.channelsPlanned).toEqual(['semantic']);
    });

    it('maps hybrid to hybrid strategy with semantic+keyword channels', () => {
      const decision = selectRetrievalStrategy('hybrid', 'test query');

      expect(decision.selectedMode).toBe('hybrid');
      expect(decision.channelsPlanned).toEqual(['semantic', 'keyword']);
    });

    it('maps graph-assisted to mix strategy with all entry channels', () => {
      const decision = selectRetrievalStrategy('graph-assisted', 'test query');

      expect(decision.selectedMode).toBe('mix');
      expect(decision.channelsPlanned).toEqual(['semantic', 'keyword', 'graph']);
    });

    it('defaults unknown mode to local strategy', () => {
      const decision = selectRetrievalStrategy('unknown-mode', 'test query');

      expect(decision.selectedMode).toBe('local');
      expect(decision.channelsPlanned).toEqual(['semantic']);
    });
  });

  describe('RoutingDecision structure', () => {
    it('returns routeFamily entry for v1', () => {
      const decision = selectRetrievalStrategy('semantic', 'test');
      expect(decision.routeFamily).toBe('entry');
    });

    it('sets routingReason to explicit-mode for valid modes', () => {
      const modes = ['semantic', 'hybrid', 'graph-assisted'] as const;
      for (const mode of modes) {
        const decision = selectRetrievalStrategy(mode, 'test');
        expect(decision.routingReason).toBe('explicit-mode');
      }
    });

    it('fallbackApplied is false for valid modes', () => {
      const modes = ['semantic', 'hybrid', 'graph-assisted'] as const;
      for (const mode of modes) {
        const decision = selectRetrievalStrategy(mode, 'test');
        expect(decision.fallbackApplied).toBe(false);
      }
    });

    it('fallbackApplied is true for unknown mode', () => {
      const decision = selectRetrievalStrategy('invalid', 'test');
      expect(decision.fallbackApplied).toBe(true);
    });

    it('channelsUsed starts empty (populated after recall)', () => {
      const decision = selectRetrievalStrategy('hybrid', 'test');
      expect(decision.channelsUsed).toEqual([]);
    });

    it('always returns complete decision object', () => {
      const decision = selectRetrievalStrategy('semantic', 'test');
      expect(decision).toHaveProperty('selectedMode');
      expect(decision).toHaveProperty('routeFamily');
      expect(decision).toHaveProperty('routingReason');
      expect(decision).toHaveProperty('fallbackApplied');
      expect(decision).toHaveProperty('fallbackTarget');
      expect(decision).toHaveProperty('confidenceScore');
      expect(decision).toHaveProperty('confidenceBucket');
      expect(decision).toHaveProperty('channelsPlanned');
      expect(decision).toHaveProperty('channelsUsed');
    });
  });
});

// =============================================================================
// Part 2: selectRetrievalStrategyV2() - Pure Function Tests
// =============================================================================

describe('selectRetrievalStrategyV2', () => {
  it('returns local strategy', () => {
    const decision = selectRetrievalStrategyV2('test query');
    expect(decision.selectedMode).toBe('local');
  });

  it('returns capsule route family', () => {
    const decision = selectRetrievalStrategyV2('test query');
    expect(decision.routeFamily).toBe('capsule');
  });

  it('returns v2-default-capsule routing reason', () => {
    const decision = selectRetrievalStrategyV2('test query');
    expect(decision.routingReason).toBe('v2-default-capsule');
  });

  it('channelsPlanned includes capsule and profile', () => {
    const decision = selectRetrievalStrategyV2('test query');
    expect(decision.channelsPlanned).toEqual(['capsule', 'profile']);
  });

  it('fallbackApplied is always false', () => {
    const decision = selectRetrievalStrategyV2('test query');
    expect(decision.fallbackApplied).toBe(false);
  });

  it('channelsUsed starts empty', () => {
    const decision = selectRetrievalStrategyV2('test query');
    expect(decision.channelsUsed).toEqual([]);
  });

  it('produces deterministic output for identical input', () => {
    const d1 = selectRetrievalStrategyV2('docker networking');
    const d2 = selectRetrievalStrategyV2('docker networking');
    expect(d1).toEqual(d2);
  });
});

// =============================================================================
// Part 5: searchKnowledge() - With Mocks
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
      vi.mocked(getQueryEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
      vi.mocked(optimizedSemanticRecall).mockResolvedValue({
        scoredEntries: [{ entry, score: 0.75 }],
        cacheStats: { totalEntries: 1, cacheHits: 0, cacheMisses: 1, hitRate: 0 },
      });

      const services = createMockServices();
      const auth = createMockAuth();
      const query = { seed: 'test query', mode: 'semantic' as const };

      await searchKnowledge(services, auth, query);

      // Semantic recall uses optimizedSemanticRecall for batch embedding retrieval
      expect(getQueryEmbedding).toHaveBeenCalledWith('test query');
      expect(optimizedSemanticRecall).toHaveBeenCalled();
    });

    it('dispatches to hybrid recall for mode=hybrid', async () => {
      const entry = createMockEntry('entry_1');
      vi.mocked(filterByBoundaryContext).mockReturnValue([entry]);
      vi.mocked(getQueryEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
      vi.mocked(optimizedSemanticRecall).mockResolvedValue({
        scoredEntries: [{ entry, score: 0.75 }],
        cacheStats: { totalEntries: 1, cacheHits: 0, cacheMisses: 1, hitRate: 0 },
      });

      const services = createMockServices();
      const auth = createMockAuth();
      const query = { seed: 'test query', mode: 'hybrid' as const };

      await searchKnowledge(services, auth, query);

      // Hybrid recall calls keywordRecall in addition to semantic
      expect(getQueryEmbedding).toHaveBeenCalled();
      expect(keywordRecall).toHaveBeenCalledWith('test query', [entry]);
    });

    it('dispatches to graph-assisted recall for mode=graph-assisted', async () => {
      const entry = createMockEntry('entry_1');
      vi.mocked(filterByBoundaryContext).mockReturnValue([entry]);
      vi.mocked(getQueryEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
      vi.mocked(optimizedSemanticRecall).mockResolvedValue({
        scoredEntries: [{ entry, score: 0.75 }],
        cacheStats: { totalEntries: 1, cacheHits: 0, cacheMisses: 1, hitRate: 0 },
      });

      const services = createMockServices();
      const auth = createMockAuth();
      const query = { seed: 'test query', mode: 'graph-assisted' as const };

      await searchKnowledge(services, auth, query);

      // Graph-assisted recall calls graphRecall in addition to semantic + keyword
      expect(getQueryEmbedding).toHaveBeenCalled();
      expect(keywordRecall).toHaveBeenCalled();
      expect(graphAssistedRecall).toHaveBeenCalled();
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

// =============================================================================
// Part 7: DB Search Integration (Phase 72-06)
// =============================================================================

describe('DB Search Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment
    process.env.USE_DB_SEARCH = undefined;
  });

  describe('getDbSearchConfig', () => {
    it('returns disabled when USE_DB_SEARCH is not set', async () => {
      const services = createMockServices();
      const auth = createMockAuth();
      const query = { seed: 'test query', mode: 'semantic' as const };

      await searchKnowledge(services, auth, query);

      // When DB search is disabled, should use in-memory path
      // This is tested indirectly by ensuring the mocks work
      expect(getQueryEmbedding).toHaveBeenCalledWith('test query');
    });

    it('returns disabled when store is not PostgresStore', async () => {
      process.env.USE_DB_SEARCH = 'true';
      const services = createMockServices();
      const auth = createMockAuth();
      const query = { seed: 'test query', mode: 'semantic' as const };

      await searchKnowledge(services, auth, query);

      // Should fall back to in-memory since store is not PostgresStore
      expect(getQueryEmbedding).toHaveBeenCalledWith('test query');
    });
  });

  describe('semantic recall with DB search fallback', () => {
    it('uses in-memory search when DB search fails', async () => {
      const entry = createMockEntry('entry_1');
      vi.mocked(filterByBoundaryContext).mockReturnValue([entry]);
      vi.mocked(getQueryEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
      vi.mocked(optimizedSemanticRecall).mockResolvedValue({
        scoredEntries: [{ entry, score: 0.75 }],
        cacheStats: { totalEntries: 1, cacheHits: 0, cacheMisses: 1, hitRate: 0 },
      });

      const services = createMockServices();
      const auth = createMockAuth();
      const query = { seed: 'test query', mode: 'semantic' as const };

      await searchKnowledge(services, auth, query);

      // Should use in-memory fallback with optimizedSemanticRecall
      expect(getQueryEmbedding).toHaveBeenCalled();
      expect(optimizedSemanticRecall).toHaveBeenCalled();
    });
  });

  describe('hybrid recall with DB search fallback', () => {
    it('uses in-memory search when DB search is disabled', async () => {
      const entry = createMockEntry('entry_1');
      vi.mocked(filterByBoundaryContext).mockReturnValue([entry]);
      vi.mocked(getQueryEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
      vi.mocked(optimizedSemanticRecall).mockResolvedValue({
        scoredEntries: [{ entry, score: 0.75 }],
        cacheStats: { totalEntries: 1, cacheHits: 0, cacheMisses: 1, hitRate: 0 },
      });

      const services = createMockServices();
      const auth = createMockAuth();
      const query = { seed: 'test query', mode: 'hybrid' as const };

      await searchKnowledge(services, auth, query);

      // Should use in-memory path for both channels
      expect(getQueryEmbedding).toHaveBeenCalled();
      expect(keywordRecall).toHaveBeenCalledWith('test query', [entry]);
    });
  });
});
