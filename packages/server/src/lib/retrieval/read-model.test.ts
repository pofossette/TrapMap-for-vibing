/**
 * Tests for retrieval read model (Phase 4.1).
 *
 * Covers:
 * - buildRetrievalReadModel() assembles data from repos + store snapshot
 * - Knowledge and artifact reads happen in parallel via Promise.all
 * - Conflicts are sourced from the store snapshot
 */

import { describe, expect, it, vi } from 'vitest';

import type { ConflictRelation } from '@trapmap/contracts';
import type { SkillShareerRepos } from '@trapmap/server/lib/repos/index.js';
import type { KnowledgeRecord, SkillArtifactRecord, SkillShareerStore } from '@trapmap/server/lib/store.js';

import { buildRetrievalReadModel } from './read-model.js';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeKnowledgeRecord(id: string): KnowledgeRecord {
  const now = new Date().toISOString();
  return {
    id,
    teamId: null,
    scope: 'global',
    labels: ['test'],
    shortcut: `Shortcut ${id}`,
    detail: `Detail ${id}`,
    requiredLevel: 0,
    lifecycleState: 'approved',
    ownerUserId: 'user_1',
    latestRevision: {
      revision: 1,
      submittedAt: now,
      submittedByUserId: 'user_1',
      shortcut: `Shortcut ${id}`,
      detail: `Detail ${id}`,
      labels: ['test'],
      reviewNotes: [],
    },
    history: [],
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
    createdAt: now,
    updatedAt: now,
  };
}

function makeArtifactRecord(id: string): SkillArtifactRecord {
  const now = new Date().toISOString();
  return {
    id,
    slug: `artifact-${id}`,
    labels: ['test'],
    scope: 'global',
    requiredLevel: 0,
    teamId: null,
    lifecycleState: 'approved',
    ownerUserId: 'user1',
    latestRevision: {
      revision: 1,
      sourceHash: 'test-hash',
      submittedAt: now,
      submittedByUserId: 'user1',
      files: [],
      scriptDescriptors: [],
      derived: {
        profile: {
          artifactId: id,
          revision: 1,
          sourceHash: 'test-hash',
          title: `Artifact ${id}`,
          summary: 'Test summary',
          keywords: ['test'],
          referencePaths: [],
          contentHash: 'content-hash',
        },
        capsules: [],
        clientManifest: null,
        sourceHash: 'test-hash',
        derivedAt: now,
      },
    },
    history: [],
    metadata: {
      sourceKind: 'single-skill-md',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: null,
      latestReviewedAt: null,
      latestDecision: null,
    },
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    agentReview: null,
    createdAt: now,
  };
}

function makeConflict(id: string, entryIdA: string, entryIdB: string): ConflictRelation {
  return {
    id,
    entryIdA,
    entryIdB,
    conflictType: 'alternative',
    context: `Conflict between ${entryIdA} and ${entryIdB}`,
    problemOverlapScore: 0.8,
    solutionDiffScore: 0.6,
    detectedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockRepos(overrides: Partial<SkillShareerRepos> = {}): SkillShareerRepos {
  return {
    knowledge: {
      listByFilter: vi.fn().mockResolvedValue([]),
    },
    artifact: {
      listByFilter: vi.fn().mockResolvedValue([]),
    },
    session: {} as never,
    accessKey: {} as never,
    team: {} as never,
    membership: {} as never,
    user: {} as never,
    candidate: {} as never,
    usageAnalytics: {} as never,
    feedback: {} as never,
    audit: {} as never,
    duplicate: {} as never,
    lineage: {} as never,
    graphIndex: {} as never,
    ...overrides,
  } as SkillShareerRepos;
}

function createMockStore(conflicts: ConflictRelation[] = []): SkillShareerStore {
  return {
    snapshot: vi.fn().mockResolvedValue({
      conflicts,
      knowledgeEntries: [],
      skillArtifacts: [],
    }),
    transact: vi.fn(),
    nextId: vi.fn(),
  } as unknown as SkillShareerStore;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildRetrievalReadModel', () => {
  it('returns knowledge entries from the knowledge repository', async () => {
    const entries = [makeKnowledgeRecord('k_1'), makeKnowledgeRecord('k_2')];
    const repos = createMockRepos({
      knowledge: { listByFilter: vi.fn().mockResolvedValue(entries) },
    } as never);
    const store = createMockStore();

    const result = await buildRetrievalReadModel(repos, store);

    expect(result.knowledgeEntries).toEqual(entries);
    expect(repos.knowledge.listByFilter).toHaveBeenCalledWith({});
  });

  it('returns skill artifacts from the artifact repository', async () => {
    const artifacts = [makeArtifactRecord('a_1')];
    const repos = createMockRepos({
      artifact: { listByFilter: vi.fn().mockResolvedValue(artifacts) },
    } as never);
    const store = createMockStore();

    const result = await buildRetrievalReadModel(repos, store);

    expect(result.skillArtifacts).toEqual(artifacts);
    expect(repos.artifact.listByFilter).toHaveBeenCalledWith({});
  });

  it('returns conflicts from the store snapshot', async () => {
    const conflicts = [
      makeConflict('c_1', 'k_1', 'k_2'),
      makeConflict('c_2', 'k_3', 'k_4'),
    ];
    const repos = createMockRepos();
    const store = createMockStore(conflicts);

    const result = await buildRetrievalReadModel(repos, store);

    expect(result.conflicts).toEqual(conflicts);
  });

  it('assembles all three data shapes together', async () => {
    const entries = [makeKnowledgeRecord('k_1')];
    const artifacts = [makeArtifactRecord('a_1')];
    const conflicts = [makeConflict('c_1', 'k_1', 'k_2')];

    const repos = createMockRepos({
      knowledge: { listByFilter: vi.fn().mockResolvedValue(entries) },
      artifact: { listByFilter: vi.fn().mockResolvedValue(artifacts) },
    } as never);
    const store = createMockStore(conflicts);

    const result = await buildRetrievalReadModel(repos, store);

    expect(result.knowledgeEntries).toEqual(entries);
    expect(result.skillArtifacts).toEqual(artifacts);
    expect(result.conflicts).toEqual(conflicts);
  });

  it('reads knowledge and artifacts in parallel (Promise.all)', async () => {
    const callOrder: string[] = [];

    const repos = createMockRepos({
      knowledge: {
        listByFilter: vi.fn().mockImplementation(async () => {
          callOrder.push('knowledge:start');
          await new Promise((r) => setTimeout(r, 10));
          callOrder.push('knowledge:end');
          return [];
        }),
      },
      artifact: {
        listByFilter: vi.fn().mockImplementation(async () => {
          callOrder.push('artifact:start');
          await new Promise((r) => setTimeout(r, 10));
          callOrder.push('artifact:end');
          return [];
        }),
      },
    } as never);
    const store = createMockStore();

    await buildRetrievalReadModel(repos, store);

    // Both calls should start before either finishes (parallel execution).
    // The first two elements should be the two "start" events.
    expect(callOrder.slice(0, 2)).toEqual(
      expect.arrayContaining(['knowledge:start', 'artifact:start']),
    );
  });

  it('includes store.snapshot() in the parallel read', async () => {
    const callOrder: string[] = [];

    const repos = createMockRepos({
      knowledge: {
        listByFilter: vi.fn().mockImplementation(async () => {
          callOrder.push('knowledge');
          return [];
        }),
      },
      artifact: {
        listByFilter: vi.fn().mockImplementation(async () => {
          callOrder.push('artifact');
          return [];
        }),
      },
    } as never);

    const store = {
      snapshot: vi.fn().mockImplementation(async () => {
        callOrder.push('snapshot');
        return { conflicts: [] };
      }),
      transact: vi.fn(),
      nextId: vi.fn(),
    } as unknown as SkillShareerStore;

    await buildRetrievalReadModel(repos, store);

    // All three should have been called.
    expect(callOrder).toHaveLength(3);
    expect(callOrder).toEqual(
      expect.arrayContaining(['knowledge', 'artifact', 'snapshot']),
    );
  });

  it('returns empty arrays when repositories return empty results', async () => {
    const repos = createMockRepos();
    const store = createMockStore();

    const result = await buildRetrievalReadModel(repos, store);

    expect(result.knowledgeEntries).toEqual([]);
    expect(result.skillArtifacts).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });
});
