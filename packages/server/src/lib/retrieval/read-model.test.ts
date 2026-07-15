/**
 * Tests for retrieval read model (Phase 4.1).
 *
 * Covers:
 * - buildRetrievalReadModel() assembles data from repository seams
 * - Knowledge and artifact reads happen in parallel via Promise.all
 * - Feedback and conflicts are sourced from repositories
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConflictRelation, SkillArtifact } from '@trapmap/contracts';
import { resetRetrievalReadModelCacheForTests } from '@trapmap/server/lib/cache/retrieval-read-model-cache.js';
import type { SkillShareerRepos } from '@trapmap/server/lib/repos/index.js';
import type {
  FeedbackQueueRecord,
  KnowledgeRecord,
  SkillArtifactRecord,
} from '@trapmap/server/lib/store.js';

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
    conflict: {
      listAll: vi.fn().mockResolvedValue([]),
    } as never,
    usageAnalytics: {} as never,
    feedback: {
      listByFilter: vi.fn().mockResolvedValue([]),
    } as never,
    audit: {} as never,
    duplicate: {} as never,
    lineage: {} as never,
    graphIndex: {} as never,
    ...overrides,
  } as SkillShareerRepos;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildRetrievalReadModel', () => {
  beforeEach(() => {
    resetRetrievalReadModelCacheForTests();
  });

  it('returns knowledge entries from the knowledge repository', async () => {
    const entries = [makeKnowledgeRecord('k_1'), makeKnowledgeRecord('k_2')];
    const repos = createMockRepos({
      knowledge: { listByFilter: vi.fn().mockResolvedValue(entries) },
    } as never);

    const result = await buildRetrievalReadModel(repos);

    expect(result.knowledgeEntries).toEqual(entries);
    expect(repos.knowledge.listByFilter).toHaveBeenCalledWith({});
  });

  it('returns skill artifacts from the artifact repository', async () => {
    const artifacts = [makeArtifactRecord('a_1')];
    const repos = createMockRepos({
      artifact: { listByFilter: vi.fn().mockResolvedValue(artifacts) },
    } as never);

    const result = await buildRetrievalReadModel(repos);

    expect(result.skillArtifacts).toEqual(artifacts);
    expect(repos.artifact.listByFilter).toHaveBeenCalledWith({});
  });

  it('prefers listForRetrieval when the artifact repository provides hydrated reads', async () => {
    const hydratedArtifacts = [makeArtifactRecord('a_hydrated')];
    const listForRetrieval = vi.fn().mockResolvedValue(hydratedArtifacts);
    const listByFilter = vi.fn().mockResolvedValue([makeArtifactRecord('a_lightweight')]);
    const repos = createMockRepos({
      artifact: {
        listByFilter,
        listForRetrieval,
      },
    } as never);

    const result = await buildRetrievalReadModel(repos);

    expect(result.skillArtifacts).toEqual(hydratedArtifacts);
    expect(listForRetrieval).toHaveBeenCalledWith({});
    expect(listByFilter).not.toHaveBeenCalled();
  });

  it('normalizes public artifact projections into hydrated retrieval records', async () => {
    const internalArtifact = makeArtifactRecord('a_public');
    const revision = internalArtifact.latestRevision;
    const publicArtifact = {
      id: internalArtifact.id,
      teamId: internalArtifact.teamId,
      scope: internalArtifact.scope,
      labels: internalArtifact.labels,
      title: 'Artifact a_public',
      slug: internalArtifact.slug,
      requiredLevel: internalArtifact.requiredLevel,
      lifecycleState: internalArtifact.lifecycleState,
      owner: { id: internalArtifact.ownerUserId, handle: 'owner', securityLevel: 0 },
      latestRevision: revision.revision,
      history: [
        {
          ...revision,
          submittedBy: { id: revision.submittedByUserId, handle: 'owner', securityLevel: 0 },
        },
      ],
      metadata: internalArtifact.metadata,
      agentReview: null,
      reviewHistory: [],
      reviewNotes: [],
      lifecycleHistory: [],
      boundaryMeta: null,
      evidenceMeta: null,
      maintenanceMeta: null,
      createdAt: internalArtifact.createdAt,
      updatedAt: internalArtifact.createdAt,
    } as unknown as SkillArtifact;
    const repos = createMockRepos({
      artifact: {
        listByFilter: vi.fn().mockResolvedValue([]),
        listForRetrieval: vi.fn().mockResolvedValue([publicArtifact]),
      },
    } as never);

    const result = await buildRetrievalReadModel(repos);

    expect(result.skillArtifacts[0]?.latestRevision.revision).toBe(1);
    expect(result.skillArtifacts[0]?.latestRevision.derived?.profile?.artifactId).toBe('a_public');
  });

  it('returns conflicts from the conflict repository', async () => {
    const conflicts = [makeConflict('c_1', 'k_1', 'k_2'), makeConflict('c_2', 'k_3', 'k_4')];
    const repos = createMockRepos({
      conflict: { listAll: vi.fn().mockResolvedValue(conflicts) },
    } as never);

    const result = await buildRetrievalReadModel(repos);

    expect(result.conflicts).toEqual(conflicts);
  });

  it('assembles all three data shapes together', async () => {
    const entries = [makeKnowledgeRecord('k_1')];
    const artifacts = [makeArtifactRecord('a_1')];
    const conflicts = [makeConflict('c_1', 'k_1', 'k_2')];

    const repos = createMockRepos({
      knowledge: { listByFilter: vi.fn().mockResolvedValue(entries) },
      artifact: { listByFilter: vi.fn().mockResolvedValue(artifacts) },
      conflict: { listAll: vi.fn().mockResolvedValue(conflicts) },
    } as never);

    const result = await buildRetrievalReadModel(repos);

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
    await buildRetrievalReadModel(repos);

    // Both calls should start before either finishes (parallel execution).
    // The first two elements should be the two "start" events.
    expect(callOrder.slice(0, 2)).toEqual(
      expect.arrayContaining(['knowledge:start', 'artifact:start']),
    );
  });

  it('includes feedback and conflict repositories in the parallel read', async () => {
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
      feedback: {
        listByFilter: vi.fn().mockImplementation(async () => {
          callOrder.push('feedback');
          return [] as FeedbackQueueRecord[];
        }),
      } as never,
      conflict: {
        listAll: vi.fn().mockImplementation(async () => {
          callOrder.push('conflict');
          return [] as ConflictRelation[];
        }),
      } as never,
    } as never);

    await buildRetrievalReadModel(repos);

    expect(callOrder).toHaveLength(4);
    expect(callOrder).toEqual(
      expect.arrayContaining(['knowledge', 'artifact', 'feedback', 'conflict']),
    );
  });

  it('returns empty arrays when repositories return empty results', async () => {
    const repos = createMockRepos();

    const result = await buildRetrievalReadModel(repos);

    expect(result.knowledgeEntries).toEqual([]);
    expect(result.skillArtifacts).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });
});
