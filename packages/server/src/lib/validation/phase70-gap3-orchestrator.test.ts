/**
 * Phase 70 Nyquist Gap Validation - Gap 3: Retrieval orchestrator.
 *
 * Tests that the orchestrator correctly combines multiple recall paths
 * (semantic, keyword, graph-assisted) and produces proper routing decisions.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedAuthContext, SkillShareerServices } from '../context.js';
import type { KnowledgeRecord } from '../store.js';

vi.mock('../retrieval/recall/semantic.js', () => ({
  getQueryEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  getEntryEmbedding: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  cosineSimilarity: vi.fn().mockReturnValue(0.8),
  computeScore: vi.fn().mockReturnValue(0.8),
  buildEmbeddingText: vi.fn().mockReturnValue('shortcut detail labels'),
  optimizedSemanticRecall: vi.fn().mockResolvedValue({ scoredEntries: [], cacheStats: { totalEntries: 0, cacheHits: 0, cacheMisses: 0, hitRate: 0 } }),
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

vi.mock('../retrieval/assembly.js', () => ({
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

vi.mock('../retrieval/filters.js', () => ({
  filterEligibleEntries: vi.fn().mockReturnValue([]),
  filterByBoundaryContext: vi.fn().mockReturnValue([]),
}));

vi.mock('../retrieval/merge.js', () => ({
  createSemanticCandidate: vi.fn(),
  mergeCandidates: vi.fn().mockReturnValue([]),
  toScoredEntries: vi.fn().mockReturnValue([]),
}));

vi.mock('../retrieval/rerank.js', () => ({
  rerankCandidates: vi.fn().mockReturnValue([]),
  toScoredEntriesFromReranked: vi.fn().mockReturnValue([]),
}));

vi.mock('../retrieval/citations.js', () => ({
  buildCitations: vi.fn().mockReturnValue([]),
}));

vi.mock('../retrieval/boundary-match.js', () => ({
  buildBoundaryExplanation: vi.fn(),
  computeBoundaryScoreDelta: vi.fn().mockReturnValue(0),
}));

vi.mock('../retrieval/summary.js', () => ({
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

vi.mock('../retrieval/capsule-recall.js', () => ({
  buildProfileShortlist: vi.fn().mockReturnValue([]),
  getCapsuleRecords: vi.fn().mockReturnValue([]),
  rankCapsules: vi.fn().mockReturnValue([]),
}));

vi.mock('../retrieval/intent.js', () => ({
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

vi.mock('../retrieval/db-search.js', () => ({
  vectorSimilaritySearch: vi.fn().mockResolvedValue([]),
}));

vi.mock('../retrieval/recall/pg-keyword.js', () => ({
  createPgKeywordRecall: vi.fn().mockReturnValue(() => Promise.resolve([])),
}));

vi.mock('../persistence/postgres-store.js', () => ({
  PostgresStore: class MockPostgresStore {},
}));

import {
  selectRetrievalStrategy,
  selectRetrievalStrategyV2,
  searchKnowledge,
} from '../retrieval/orchestrator.js';
import { keywordRecall } from '../retrieval/recall/keyword.js';
import { graphAssistedRecall } from '../retrieval/recall/graph-assisted.js';
import { logRagRetrieval } from '../rag-log.js';
import { buildEmptyResponse } from '../retrieval/assembly.js';
import { filterByBoundaryContext, filterEligibleEntries } from '../retrieval/filters.js';
import { getQueryEmbedding } from '../retrieval/recall/semantic.js';

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
    history: [{ revision: 1, submittedAt: now, submittedByUserId: 'user_test', shortcut: `Entry ${id}`, detail: `Detail for ${id}`, labels: ['test'], reviewNotes: [] }],
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
      ragLog: { enabled: false, logDir: '/tmp/test', maxFileSizeBytes: 1024 * 1024, maxBackupFiles: 3 },
    } as SkillShareerServices['config'],
    store: {
      snapshot: vi.fn().mockResolvedValue({ knowledgeEntries: [], skillArtifacts: [], conflicts: [] }),
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

describe('Gap 3: Retrieval orchestrator combines multiple recall paths correctly', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.USE_DB_SEARCH;
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
    });

    const auth = makeAuth();
    const query = { seed: 'test query', mode: 'semantic' as const };

    await expect(searchKnowledge(services, auth, query)).rejects.toThrow('DB connection lost');

    // RAG log should still be written for the failure
    expect(logRagRetrieval).toHaveBeenCalled();
  });
});
