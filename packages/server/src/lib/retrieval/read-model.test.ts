/**
 * Tests for retrieval read model (Phase 4.1).
 *
 * Covers:
 * - buildRetrievalReadModel() assembles data from repository seams
 * - Knowledge and artifact reads happen in parallel via Promise.all
 * - Feedback and conflicts are sourced from repositories
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createRetrievalArtifactFixture,
  createRetrievalConflictFixture,
  createRetrievalKnowledgeFixture,
  createRetrievalMockRepos,
  type ConflictRelation,
  type SkillArtifact,
} from '@trapmap/contracts';
import { resetRetrievalReadModelCacheForTests } from '@trapmap/server/lib/cache/retrieval-read-model-cache.js';
import type { SkillShareerRepos } from '@trapmap/server/lib/repos/index.js';
import type { FeedbackQueueRecord } from '@trapmap/server/lib/store.js';

import { buildRetrievalReadModel } from './read-model.js';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildRetrievalReadModel', () => {
  beforeEach(() => {
    resetRetrievalReadModelCacheForTests();
  });

  it('returns knowledge entries from the knowledge repository', async () => {
    const entries = [
      createRetrievalKnowledgeFixture('k_1'),
      createRetrievalKnowledgeFixture('k_2'),
    ];
    const repos = createRetrievalMockRepos({
      knowledge: { listByFilter: vi.fn().mockResolvedValue(entries) },
    }) as unknown as SkillShareerRepos;

    const result = await buildRetrievalReadModel(repos);

    expect(result.knowledgeEntries).toEqual(entries);
    expect(repos.knowledge.listByFilter).toHaveBeenCalledWith({});
  });

  it('returns skill artifacts from the artifact repository', async () => {
    const artifacts = [createRetrievalArtifactFixture('a_1')];
    const repos = createRetrievalMockRepos({
      artifact: { listByFilter: vi.fn().mockResolvedValue(artifacts) },
    }) as unknown as SkillShareerRepos;

    const result = await buildRetrievalReadModel(repos);

    expect(result.skillArtifacts).toEqual(artifacts);
    expect(repos.artifact.listByFilter).toHaveBeenCalledWith({});
  });

  it('prefers listForRetrieval when the artifact repository provides hydrated reads', async () => {
    const hydratedArtifacts = [createRetrievalArtifactFixture('a_hydrated')];
    const listForRetrieval = vi.fn().mockResolvedValue(hydratedArtifacts);
    const listByFilter = vi
      .fn()
      .mockResolvedValue([createRetrievalArtifactFixture('a_lightweight')]);
    const repos = createRetrievalMockRepos({
      artifact: {
        listByFilter,
        listForRetrieval,
      },
    }) as unknown as SkillShareerRepos;

    const result = await buildRetrievalReadModel(repos);

    expect(result.skillArtifacts).toEqual(hydratedArtifacts);
    expect(listForRetrieval).toHaveBeenCalledWith({});
    expect(listByFilter).not.toHaveBeenCalled();
  });

  it('normalizes public artifact projections into hydrated retrieval records', async () => {
    const internalArtifact = createRetrievalArtifactFixture('a_public');
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
    const repos = createRetrievalMockRepos({
      artifact: {
        listByFilter: vi.fn().mockResolvedValue([]),
        listForRetrieval: vi.fn().mockResolvedValue([publicArtifact]),
      },
    }) as unknown as SkillShareerRepos;

    const result = await buildRetrievalReadModel(repos);

    expect(result.skillArtifacts[0]?.latestRevision.revision).toBe(1);
    expect(result.skillArtifacts[0]?.latestRevision.derived?.profile?.artifactId).toBe('a_public');
  });

  it('returns conflicts from the conflict repository', async () => {
    const conflicts = [
      createRetrievalConflictFixture('c_1', 'k_1', 'k_2'),
      createRetrievalConflictFixture('c_2', 'k_3', 'k_4'),
    ];
    const repos = createRetrievalMockRepos({
      conflict: { listAll: vi.fn().mockResolvedValue(conflicts) },
    }) as unknown as SkillShareerRepos;

    const result = await buildRetrievalReadModel(repos);

    expect(result.conflicts).toEqual(conflicts);
  });

  it('assembles all three data shapes together', async () => {
    const entries = [createRetrievalKnowledgeFixture('k_1')];
    const artifacts = [createRetrievalArtifactFixture('a_1')];
    const conflicts = [createRetrievalConflictFixture('c_1', 'k_1', 'k_2')];

    const repos = createRetrievalMockRepos({
      knowledge: { listByFilter: vi.fn().mockResolvedValue(entries) },
      artifact: { listByFilter: vi.fn().mockResolvedValue(artifacts) },
      conflict: { listAll: vi.fn().mockResolvedValue(conflicts) },
    }) as unknown as SkillShareerRepos;

    const result = await buildRetrievalReadModel(repos);

    expect(result.knowledgeEntries).toEqual(entries);
    expect(result.skillArtifacts).toEqual(artifacts);
    expect(result.conflicts).toEqual(conflicts);
  });

  it('reads knowledge and artifacts in parallel (Promise.all)', async () => {
    const callOrder: string[] = [];

    const repos = createRetrievalMockRepos({
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
    }) as unknown as SkillShareerRepos;
    await buildRetrievalReadModel(repos);

    // Both calls should start before either finishes (parallel execution).
    // The first two elements should be the two "start" events.
    expect(callOrder.slice(0, 2)).toEqual(
      expect.arrayContaining(['knowledge:start', 'artifact:start']),
    );
  });

  it('includes feedback and conflict repositories in the parallel read', async () => {
    const callOrder: string[] = [];

    const repos = createRetrievalMockRepos({
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
    }) as unknown as SkillShareerRepos;

    await buildRetrievalReadModel(repos);

    expect(callOrder).toHaveLength(4);
    expect(callOrder).toEqual(
      expect.arrayContaining(['knowledge', 'artifact', 'feedback', 'conflict']),
    );
  });

  it('returns empty arrays when repositories return empty results', async () => {
    const repos = createRetrievalMockRepos() as unknown as SkillShareerRepos;

    const result = await buildRetrievalReadModel(repos);

    expect(result.knowledgeEntries).toEqual([]);
    expect(result.skillArtifacts).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });
});
