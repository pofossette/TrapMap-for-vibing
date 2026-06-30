import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConflictRelation } from '@trapmap/contracts';
import type { SkillShareerRepos } from '@trapmap/runtime-infra';
import { resetRetrievalReadModelCacheForTests } from '@trapmap/server/lib/cache/retrieval-read-model-cache.js';

import { buildRetrievalReadModel } from './read-model.js';
import type { FeedbackQueueRecord, KnowledgeRecord, SkillArtifactRecord } from './store.js';

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

describe('buildRetrievalReadModel', () => {
  beforeEach(() => {
    resetRetrievalReadModelCacheForTests();
  });

  it('prefers hydrated retrieval artifact reads when available', async () => {
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

  it('assembles entries, artifacts, and conflicts into one retrieval snapshot', async () => {
    const entries = [makeKnowledgeRecord('k_1')];
    const artifacts = [makeArtifactRecord('a_1')];
    const conflicts = [makeConflict('c_1', 'k_1', 'k_2')];
    const feedbackQueue: FeedbackQueueRecord[] = [];

    const repos = createMockRepos({
      knowledge: { listByFilter: vi.fn().mockResolvedValue(entries) },
      artifact: { listByFilter: vi.fn().mockResolvedValue(artifacts) },
      feedback: { listByFilter: vi.fn().mockResolvedValue(feedbackQueue) } as never,
      conflict: { listAll: vi.fn().mockResolvedValue(conflicts) } as never,
    } as never);

    const result = await buildRetrievalReadModel(repos);

    expect(result.knowledgeEntries).toEqual(entries);
    expect(result.skillArtifacts).toEqual(artifacts);
    expect(result.conflicts).toEqual(conflicts);
  });
});
