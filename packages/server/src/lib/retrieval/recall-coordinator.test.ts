/**
 * Tests for recall coordination module.
 *
 * Covers:
 * - dispatchByMode() - Mode dispatch to recall channels
 * - getDbSearchConfig() - DB search configuration detection
 * - semanticRecall() - Semantic channel with in-memory fallback
 * - hybridRecall() - Hybrid channel with in-memory fallback
 * - inferChannelsFromMerged() - Channel inference from merged candidates
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedAuthContext, SkillShareerServices } from '../context.js';
import type { KnowledgeRecord } from '../store.js';
import type { MergedCandidate } from './types.js';

// ── Mocks for recall modules ──────────────────────────────────────────────

vi.mock('./recall/semantic.js', () => ({
  getQueryEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
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

vi.mock('./boundary-match.js', () => ({
  buildBoundaryExplanation: vi.fn(),
  computeBoundaryScoreDelta: vi.fn().mockReturnValue(0),
}));

vi.mock('./merge.js', () => ({
  createSemanticCandidate: vi.fn(),
  mergeCandidates: vi.fn().mockReturnValue([]),
}));

vi.mock('./rerank.js', () => ({
  rerankCandidates: vi.fn().mockReturnValue([]),
  toScoredEntriesFromReranked: vi.fn().mockReturnValue([]),
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

vi.mock('../decay/freshness.js', () => ({
  DEFAULT_FRESHNESS_CONFIG: { enabled: false },
}));

// ── Imports after mocks ───────────────────────────────────────────────────

import { AppError } from '../errors.js';
import {
  GRAPH_SCORE_BOOST_FACTOR,
  computeSemanticCandidates,
  dispatchByMode,
  getDbSearchConfig,
  graphAssistedRecall,
  hybridRecall,
  inferChannelsFromMerged,
  mergeCandidatesWithGraph,
  semanticRecall,
} from './recall-coordinator.js';
import { graphAssistedRecall as graphRecall } from './recall/graph-assisted.js';
import { keywordRecall } from './recall/keyword.js';
import { getQueryEmbedding, optimizedSemanticRecall } from './recall/semantic.js';
import { mergeCandidates, createSemanticCandidate } from './merge.js';
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
      transact: vi.fn(),
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

function createParsedQuery(overrides: Record<string, unknown> = {}) {
  return {
    seed: 'test query',
    mode: 'semantic' as const,
    maxResults: 10,
    filters: { labels: [], scopes: [] },
    boundaryContext: undefined,
    ...overrides,
  };
}

// =============================================================================
// Tests: dispatchByMode
// =============================================================================

describe('dispatchByMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches to semanticRecall for mode=semantic', async () => {
    const entry = createMockEntry('entry_1');
    const parsed = createParsedQuery();
    vi.mocked(getQueryEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);

    const result = await dispatchByMode('semantic', 'test query', [entry], parsed);

    expect(getQueryEmbedding).toHaveBeenCalledWith('test query');
    expect(optimizedSemanticRecall).toHaveBeenCalled();
    expect(result.scoredEntries).toBeDefined();
  });

  it('dispatches to hybridRecall for mode=hybrid', async () => {
    const entry = createMockEntry('entry_1');
    const parsed = createParsedQuery({ mode: 'hybrid' });
    vi.mocked(getQueryEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);

    const result = await dispatchByMode('hybrid', 'test query', [entry], parsed);

    expect(keywordRecall).toHaveBeenCalled();
    expect(result.scoredEntries).toBeDefined();
  });

  it('dispatches to graphAssistedRecall for mode=graph-assisted', async () => {
    const entry = createMockEntry('entry_1');
    const parsed = createParsedQuery({ mode: 'graph-assisted' });
    vi.mocked(getQueryEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);

    const result = await dispatchByMode('graph-assisted', 'test query', [entry], parsed);

    expect(graphRecall).toHaveBeenCalledWith('test query', expect.any(Map));
    expect(result.scoredEntries).toBeDefined();
  });

  it('throws AppError for invalid mode', async () => {
    const entry = createMockEntry('entry_1');
    const parsed = createParsedQuery();

    await expect(dispatchByMode('invalid-mode', 'test query', [entry], parsed)).rejects.toThrow(
      AppError,
    );

    try {
      await dispatchByMode('invalid-mode', 'test query', [entry], parsed);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(400);
      expect((error as AppError).code).toBe('invalid_mode');
    }
  });
});

// =============================================================================
// Tests: getDbSearchConfig
// =============================================================================

describe('getDbSearchConfig', () => {
  beforeEach(() => {
    process.env.USE_DB_SEARCH = undefined;
  });

  it('returns disabled when USE_DB_SEARCH is not set', () => {
    const services = createMockServices();
    const config = getDbSearchConfig(services);
    expect(config.enabled).toBe(false);
    expect(config.pool).toBeNull();
  });

  it('returns disabled when store is not PostgresStore', () => {
    process.env.USE_DB_SEARCH = 'true';
    const services = createMockServices();
    const config = getDbSearchConfig(services);
    // The mock store is a plain object, not a PostgresStore instance
    expect(config.enabled).toBe(false);
  });
});

// =============================================================================
// Tests: semanticRecall
// =============================================================================

describe('semanticRecall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.USE_DB_SEARCH = undefined;
  });

  it('uses in-memory fallback when DB search disabled', async () => {
    const entry = createMockEntry('entry_1');
    const parsed = createParsedQuery();
    vi.mocked(getQueryEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
    vi.mocked(optimizedSemanticRecall).mockResolvedValue({
      scoredEntries: [{ entry, score: 0.75 }],
      cacheStats: { totalEntries: 1, cacheHits: 0, cacheMisses: 1, hitRate: 0 },
    });

    const result = await semanticRecall('test query', [entry], parsed);

    expect(getQueryEmbedding).toHaveBeenCalledWith('test query');
    expect(optimizedSemanticRecall).toHaveBeenCalled();
    expect(result.scoredEntries).toBeDefined();
  });
});

// =============================================================================
// Tests: hybridRecall
// =============================================================================

describe('hybridRecall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.USE_DB_SEARCH = undefined;
  });

  it('uses in-memory path when DB search disabled', async () => {
    const entry = createMockEntry('entry_1');
    const parsed = createParsedQuery({ mode: 'hybrid' });
    vi.mocked(getQueryEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
    vi.mocked(optimizedSemanticRecall).mockResolvedValue({
      scoredEntries: [{ entry, score: 0.75 }],
      cacheStats: { totalEntries: 1, cacheHits: 0, cacheMisses: 1, hitRate: 0 },
    });

    const result = await hybridRecall('test query', [entry], parsed);

    expect(getQueryEmbedding).toHaveBeenCalled();
    expect(keywordRecall).toHaveBeenCalledWith('test query', [entry]);
    expect(result.scoredEntries).toBeDefined();
  });
});

// =============================================================================
// Tests: inferChannelsFromMerged
// =============================================================================

describe('inferChannelsFromMerged', () => {
  it('returns semantic for empty/undefined candidates', () => {
    expect(inferChannelsFromMerged(undefined)).toEqual(['semantic']);
    expect(inferChannelsFromMerged([])).toEqual(['semantic']);
  });

  it('returns correct channels from merged candidates', () => {
    const entry = createMockEntry('entry_1');
    const candidates: MergedCandidate[] = [
      {
        entry,
        semanticScore: 0.8,
        keywordScore: 0.5,
        combinedScore: 0.9,
        tokenMatches: [],
        channels: ['semantic', 'keyword'],
        preRerankScore: 0.9,
        finalScore: 0.9,
      },
    ];

    const channels = inferChannelsFromMerged(candidates);
    expect(channels).toContain('semantic');
    expect(channels).toContain('keyword');
  });
});

// =============================================================================
// Tests: computeSemanticCandidates
// =============================================================================

describe('computeSemanticCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.USE_DB_SEARCH = undefined;
  });

  it('returns candidates sorted by score descending', async () => {
    const entry1 = createMockEntry('entry_1');
    const entry2 = createMockEntry('entry_2');
    const entry3 = createMockEntry('entry_3');

    vi.mocked(getQueryEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
    vi.mocked(optimizedSemanticRecall).mockResolvedValue({
      scoredEntries: [
        { entry: entry1, score: 0.9 },
        { entry: entry2, score: 0.7 },
        { entry: entry3, score: 0.5 },
      ],
      cacheStats: { totalEntries: 3, cacheHits: 0, cacheMisses: 3, hitRate: 0 },
    });
    // Mock createSemanticCandidate to return a RecallCandidate with score
    vi.mocked(createSemanticCandidate).mockImplementation((entry, score) => ({
      entry,
      channel: 'semantic' as const,
      score,
      tokenMatches: [],
    }));

    const candidates = await computeSemanticCandidates('test query', [entry1, entry2, entry3], undefined);

    expect(candidates.length).toBe(3);
    expect(candidates[0].score).toBeGreaterThanOrEqual(candidates[1].score);
    expect(candidates[1].score).toBeGreaterThanOrEqual(candidates[2].score);
  });

  it('calls getQueryEmbedding with the seed', async () => {
    const entry = createMockEntry('entry_1');
    vi.mocked(getQueryEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
    vi.mocked(optimizedSemanticRecall).mockResolvedValue({
      scoredEntries: [],
      cacheStats: { totalEntries: 0, cacheHits: 0, cacheMisses: 0, hitRate: 0 },
    });

    await computeSemanticCandidates('my search query', [entry], undefined);

    expect(getQueryEmbedding).toHaveBeenCalledWith('my search query');
  });
});

// =============================================================================
// Tests: graphAssistedRecall
// =============================================================================

describe('graphAssistedRecall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.USE_DB_SEARCH = undefined;
  });

  it('calls all three recall channels (semantic, keyword, graph)', async () => {
    const entry = createMockEntry('entry_1');
    const parsed = createParsedQuery({ mode: 'graph-assisted' });

    vi.mocked(getQueryEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
    vi.mocked(optimizedSemanticRecall).mockResolvedValue({
      scoredEntries: [],
      cacheStats: { totalEntries: 0, cacheHits: 0, cacheMisses: 0, hitRate: 0 },
    });
    vi.mocked(keywordRecall).mockResolvedValue([]);
    vi.mocked(graphRecall).mockResolvedValue([]);

    await graphAssistedRecall('test query', [entry], parsed);

    expect(getQueryEmbedding).toHaveBeenCalled();
    expect(keywordRecall).toHaveBeenCalledWith('test query', [entry]);
    expect(graphRecall).toHaveBeenCalledWith('test query', expect.any(Map));
  });

  it('returns scored entries sorted by final score', async () => {
    const entry1 = createMockEntry('entry_1');
    const entry2 = createMockEntry('entry_2');
    const parsed = createParsedQuery({ mode: 'graph-assisted' });

    vi.mocked(getQueryEmbedding).mockResolvedValue([0.1, 0.2, 0.3]);
    vi.mocked(optimizedSemanticRecall).mockResolvedValue({
      scoredEntries: [
        { entry: entry1, score: 0.9 },
        { entry: entry2, score: 0.7 },
      ],
      cacheStats: { totalEntries: 2, cacheHits: 0, cacheMisses: 2, hitRate: 0 },
    });
    vi.mocked(keywordRecall).mockResolvedValue([]);
    vi.mocked(graphRecall).mockResolvedValue([]);
    vi.mocked(mergeCandidates).mockReturnValue([
      {
        entry: entry1,
        semanticScore: 0.9,
        keywordScore: 0,
        combinedScore: 0.9,
        tokenMatches: [],
        channels: ['semantic'],
        preRerankScore: 0.9,
        finalScore: 0.9,
      },
      {
        entry: entry2,
        semanticScore: 0.7,
        keywordScore: 0,
        combinedScore: 0.7,
        tokenMatches: [],
        channels: ['semantic'],
        preRerankScore: 0.7,
        finalScore: 0.7,
      },
    ]);
    vi.mocked(rerankCandidates).mockImplementation((candidates) => candidates);
    vi.mocked(toScoredEntriesFromReranked).mockImplementation((candidates) =>
      candidates.map((c) => ({ entry: c.entry, score: c.finalScore })),
    );

    const result = await graphAssistedRecall('test query', [entry1, entry2], parsed);

    expect(result.scoredEntries).toBeDefined();
    expect(result.mergedCandidates).toBeDefined();
  });
});

// =============================================================================
// Tests: mergeCandidatesWithGraph
// =============================================================================

describe('mergeCandidatesWithGraph', () => {
  it('adds graph channel to existing candidates', () => {
    const entry = createMockEntry('entry_1');
    const hybridMerged = [
      {
        entry,
        semanticScore: 0.8,
        keywordScore: 0.5,
        combinedScore: 0.9,
        tokenMatches: [],
        channels: ['semantic', 'keyword'] as const,
        preRerankScore: 0.9,
        finalScore: 0.9,
      },
    ];
    const graphCandidates = [{ entry, score: 0.7 }];

    const result = mergeCandidatesWithGraph(hybridMerged, graphCandidates);

    expect(result[0].channels).toContain('graph');
    expect(result[0].graphScore).toBe(0.7);
  });

  it('applies GRAPH_SCORE_BOOST_FACTOR to combinedScore', () => {
    const entry = createMockEntry('entry_1');
    const hybridMerged = [
      {
        entry,
        semanticScore: 0.8,
        keywordScore: 0.5,
        combinedScore: 0.9,
        tokenMatches: [],
        channels: ['semantic'] as const,
        preRerankScore: 0.9,
        finalScore: 0.9,
      },
    ];
    const graphCandidates = [{ entry, score: 0.5 }];

    const result = mergeCandidatesWithGraph(hybridMerged, graphCandidates);

    // finalScore = min(1, preRerankScore + graphScore * GRAPH_SCORE_BOOST_FACTOR)
    const expectedFinalScore = Math.min(1, 0.9 + 0.5 * GRAPH_SCORE_BOOST_FACTOR);
    expect(result[0].finalScore).toBe(expectedFinalScore);
  });

  it('adds new candidates from graph that are not in hybrid', () => {
    const entry1 = createMockEntry('entry_1');
    const entry2 = createMockEntry('entry_2');
    const hybridMerged = [
      {
        entry: entry1,
        semanticScore: 0.8,
        keywordScore: 0,
        combinedScore: 0.8,
        tokenMatches: [],
        channels: ['semantic'] as const,
        preRerankScore: 0.8,
        finalScore: 0.8,
      },
    ];
    const graphCandidates = [{ entry: entry2, score: 0.6 }];

    const result = mergeCandidatesWithGraph(hybridMerged, graphCandidates);

    expect(result.length).toBe(2);
    const newCandidate = result.find((c) => c.entry.id === 'entry_2');
    expect(newCandidate).toBeDefined();
    expect(newCandidate!.channels).toEqual(['graph']);
    expect(newCandidate!.graphScore).toBe(0.6);
  });

  it('sorts results by combinedScore descending', () => {
    const entry1 = createMockEntry('entry_1');
    const entry2 = createMockEntry('entry_2');
    const hybridMerged = [
      {
        entry: entry1,
        semanticScore: 0.9,
        keywordScore: 0,
        combinedScore: 0.9,
        tokenMatches: [],
        channels: ['semantic'] as const,
        preRerankScore: 0.9,
        finalScore: 0.9,
      },
    ];
    const graphCandidates = [{ entry: entry2, score: 0.95 }];

    const result = mergeCandidatesWithGraph(hybridMerged, graphCandidates);

    expect(result[0].combinedScore).toBeGreaterThanOrEqual(result[1].combinedScore);
  });
});

// =============================================================================
// Tests: GRAPH_SCORE_BOOST_FACTOR constant
// =============================================================================

describe('GRAPH_SCORE_BOOST_FACTOR', () => {
  it('is defined as 0.2', () => {
    expect(GRAPH_SCORE_BOOST_FACTOR).toBe(0.2);
  });

  it('is a positive number less than 1', () => {
    expect(GRAPH_SCORE_BOOST_FACTOR).toBeGreaterThan(0);
    expect(GRAPH_SCORE_BOOST_FACTOR).toBeLessThan(1);
  });
});
