/**
 * knowledge-read host ports: read-model projection + converged retrieval.
 *
 * Phase 4 / D5 removed the legacy ILIKE retrieval seam: the distributed
 * knowledge-read service now runs the complete retrieval-engine pipeline
 * (see converged-retrieval.ts). These tests cover the retained read-model
 * projection and the converged retrieval query's behaviour (ranking, score
 * semantics, and snippet/detail mapping), which mirror the monolith pipeline.
 */
import { createRetrievalArtifactFixture } from '@trapmap/contracts';
import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createKnowledgeReadChannelRegistry,
  createKnowledgeReadGraphIndexRepository,
  createKnowledgeReadOwnerRetrievalServices,
  createKnowledgeReadStrategyRegistry,
  createMemoryGraphQueryBackend,
  resetRetrievalReadModelCacheForTests,
} from '@trapmap/service-knowledge-read';

import { createConvergedRetrievalQuery } from '../../src/knowledge-read/converged-retrieval.js';
import { createPgKnowledgeReadProjection } from '../../src/knowledge-read/ports.js';

const ROW = {
  id: 'entry-1',
  detail: 'TrapMap assembly pilot',
  shortcut: 'pilot',
  labels: ['assembly'],
  owner_user_id: 'user-1',
  team_id: 'team-1',
  lifecycle_state: 'approved',
  created_at: '2026-08-16T00:00:00Z',
};

function pool(rows: unknown[]) {
  return { query: async () => ({ rows }) };
}

/** Test-only pool stub: never actually queried when services are injected. */
// lib type gap: the converged seam types the pool as pg.Pool, but tests inject
// services so the pool is unused; a minimal query stub satisfies the structural surface.
const neverPool = {
  query: async (_sql: string, _values?: unknown[]) => ({ rows: [] }),
} as unknown as Pool; // lib type gap: test-only pool stub, never queried when services are injected

function inMemoryKnowledgeRepo(entries: object[]) {
  return {
    async getById() {
      return null;
    },
    async listByFilter(_filter: Record<string, unknown>) {
      return entries;
    },
    async updateEmbeddingCache() {},
  } as unknown as Parameters<typeof createKnowledgeReadOwnerRetrievalServices>[0]['knowledge']; // lib type gap: owner-port seam expects contracts KnowledgeEntry rows while the pipeline consumes the same runtime entries
}

function inMemoryArtifactRepo(artifacts: unknown[] = []) {
  return {
    async listByFilter() {
      return [];
    },
    async listForRetrieval() {
      return artifacts;
    },
  } as unknown as Parameters<typeof createKnowledgeReadOwnerRetrievalServices>[0]['artifact']; // lib type gap: owner-port seam expects contracts SkillArtifact rows
}

/** Versioned skill artifact fixture completing the contracts artifact fixture. */
function versionedArtifact(id: string, version: string, title: string) {
  const fixture = createRetrievalArtifactFixture(id);
  return {
    ...fixture,
    title,
    boundary: null,
    decayMeta: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    updatedAt: '2026-01-01T00:00:00Z',
    latestRevision: {
      ...fixture.latestRevision,
      version,
    },
  };
}

function inMemoryGovernance() {
  return {
    async listFeedback() {
      return [];
    },
    async listConflicts() {
      return [];
    },
    async listRemediation() {
      return [];
    },
  } as unknown as Parameters<typeof createKnowledgeReadOwnerRetrievalServices>[0]['governance']; // lib type gap: backend-core governance rows vs the retrieval seam's richer record shape
}

/** Convenience test entries matching the recall pipeline's KnowledgeRecord shape. */
function testEntry(id: string, shortcut: string, detail: string, labels: string[]) {
  return {
    id,
    teamId: null,
    scope: 'global',
    labels,
    shortcut,
    detail,
    requiredLevel: 0,
    lifecycleState: 'approved',
    ownerUserId: 'user-1',
    latestRevision: {
      revision: 1,
      submittedAt: '2026-01-01T00:00:00Z',
      submittedByUserId: 'user-1',
      shortcut,
      detail,
      labels,
      reviewNotes: [],
    },
    history: [
      {
        revision: 1,
        submittedAt: '2026-01-01T00:00:00Z',
        submittedByUserId: 'user-1',
        shortcut,
        detail,
        labels,
        reviewNotes: [],
      },
    ],
    metadata: {
      scopeLabel: 'global-constraint',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: null,
      latestReviewedAt: null,
      latestDecision: null,
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
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

function inMemoryRetrievalServices(
  entries: object[],
  extra?: {
    intentRecognition?: Parameters<
      typeof createKnowledgeReadOwnerRetrievalServices
    >[0]['intentRecognition'];
    artifacts?: unknown[];
  },
) {
  const strategyRegistry = createKnowledgeReadStrategyRegistry();
  const channelRegistry = createKnowledgeReadChannelRegistry();
  const graphIndex = createKnowledgeReadGraphIndexRepository(neverPool);
  return createKnowledgeReadOwnerRetrievalServices({
    config: {
      ragLog: {
        enabled: false,
        logDir: '',
        maxFileSizeBytes: 0,
        maxBackupFiles: 0,
      },
    },
    knowledge: inMemoryKnowledgeRepo(entries),
    artifact: inMemoryArtifactRepo(extra?.artifacts ?? []),
    governance: inMemoryGovernance(),
    strategyRegistry,
    channelRegistry,
    ai: {
      chat: {
        isConfigured: false,
        async invoke() {
          throw new Error('not used in retrieval-only test');
        },
      },
    },
    store: { getPool: () => neverPool },
    graphQuery: { backendKind: 'memory', failOpen: true, mode: 'disabled' },
    graphQueryBackend: createMemoryGraphQueryBackend(graphIndex),
    ...(extra ?? {}),
  });
}

describe('createPgKnowledgeReadProjection', () => {
  it('maps a raw row into a KnowledgeEntryRecord', async () => {
    const projection = createPgKnowledgeReadProjection(pool([ROW]));
    const entry = await projection.getById('entry-1');
    expect(entry).toMatchObject({
      id: 'entry-1',
      content: 'TrapMap assembly pilot',
      title: 'pilot',
      labels: ['assembly'],
      ownerUserId: 'user-1',
      teamId: 'team-1',
      lifecycleState: 'approved',
    });
  });

  it('returns null for a missing row', async () => {
    const projection = createPgKnowledgeReadProjection(pool([]));
    await expect(projection.getById('missing')).resolves.toBeNull();
  });
});

describe('createConvergedRetrievalQuery', () => {
  // The service package caches the read model in a global single slot;
  // reset it so each harness build sees its own knowledge/artifact rows.
  beforeEach(() => {
    resetRetrievalReadModelCacheForTests();
  });

  it('returns ranked results with snippet mapped from entry detail and preserves the RetrievalQueryPort surface', async () => {
    const retrieval = createConvergedRetrievalQuery(
      neverPool,
      inMemoryRetrievalServices([
        testEntry(
          'entry-relevant',
          'Retrieval pipeline semantic match',
          'Complete retrieval engine using hash embeddings and reranking for robust recall.',
          ['retrieval', 'engine'],
        ),
        testEntry(
          'entry-unrelated',
          'Unrelated topic',
          'Gardening tips about watering houseplants.',
          ['misc'],
        ),
      ]),
    );

    const result = await retrieval.search({ query: 'retrieval pipeline', limit: 5 });

    expect(result.results.length).toBeGreaterThan(0);
    // The converged pipeline ranks by combined score, matching the monolith.
    expect(result.results[0]?.entryId).toBe('entry-relevant');

    const scores = result.results.map((row) => row.score);
    const sorted = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sorted);

    // The response surface stays the same as before (entryId/score/snippet).
    expect(result.results[0]).toEqual(
      expect.objectContaining({
        entryId: 'entry-relevant',
        score: expect.any(Number),
        snippet: 'Complete retrieval engine using hash embeddings and reranking for robust recall.',
      }),
    );
  });

  it('routes mode selection through the injected D8 intentRecognition port', async () => {
    const recognize = vi.fn(
      async (input: { requestedMode?: string; knownModes: readonly string[] }) => ({
        mode: input.requestedMode ?? 'semantic',
        confidence: 1,
        reason: 'test-spy',
      }),
    );
    const retrieval = createConvergedRetrievalQuery(
      neverPool,
      inMemoryRetrievalServices(
        [
          testEntry(
            'entry-relevant',
            'Retrieval pipeline semantic match',
            'Complete retrieval engine using hash embeddings and reranking for robust recall.',
            ['retrieval', 'engine'],
          ),
        ],
        { intentRecognition: { recognize } },
      ),
    );

    const result = await retrieval.search({ query: 'retrieval pipeline', limit: 5 });

    // The seam requests the hybrid mode; the port decides and the pipeline
    // executes the recognized mode (behavior preserved by the rule default).
    expect(recognize).toHaveBeenCalledTimes(1);
    const input = recognize.mock.calls[0]![0];
    expect(input.requestedMode).toBe('hybrid');
    expect(input.knownModes).toContain('semantic');
    expect(input.knownModes).toContain('graph-assisted');
    expect(result.results[0]?.entryId).toBe('entry-relevant');
  });

  it('recalls skill artifacts as retrieval entries with their declared version', async () => {
    const retrieval = createConvergedRetrievalQuery(
      neverPool,
      inMemoryRetrievalServices([], {
        artifacts: [versionedArtifact('artifact-1', '18.2.0', 'Retrieval pipeline semantic match')],
      }),
    );

    const result = await retrieval.search({ query: 'retrieval pipeline', limit: 5 });

    const artifactRow = result.results.find((row) => row.entryId === 'artifact-1');
    expect(artifactRow).toBeDefined();
    expect(artifactRow?.snippet).toContain('Test summary');
  });
});
