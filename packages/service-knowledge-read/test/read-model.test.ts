import { beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

import { createRetrievalArtifactFixture, createRetrievalMockRepos } from '@trapmap/contracts';
import type { SkillShareerRepos } from '../src/context.js';

import { buildOwnerReadModel, buildRetrievalReadModel } from '../src/read-model.js';
import { resetRetrievalReadModelCacheForTests } from '../src/retrieval-read-model-cache.js';

describe('buildRetrievalReadModel', () => {
  beforeEach(() => {
    resetRetrievalReadModelCacheForTests();
  });

  it('passes the owner hydrated artifact projection through unchanged', async () => {
    const artifact = createRetrievalArtifactFixture('owner_projection');
    const repos = createRetrievalMockRepos({
      artifact: {
        listByFilter: async () => [],
        listForRetrieval: async () => [artifact],
      },
    }) as SkillShareerRepos;

    const result = await buildRetrievalReadModel(repos);

    expect(result.skillArtifacts).toEqual([artifact]);
    expect(result.skillArtifacts[0]).toBe(artifact);
  });

  it('builds the admin read projection from owner ports', async () => {
    const repos = createRetrievalMockRepos() as SkillShareerRepos;

    await expect(buildOwnerReadModel(repos)).resolves.toEqual(await buildRetrievalReadModel(repos));
  });

  it('reads retrieval feedback and scoped conflicts through the governance projection seam', async () => {
    const listFeedback = vi.fn().mockResolvedValue([]);
    const listConflicts = vi.fn().mockResolvedValue([]);
    const repos = createRetrievalMockRepos({
      knowledge: {
        listByFilter: vi.fn().mockResolvedValue([{ id: 'entry-1' }]),
      },
      artifact: {
        listByFilter: vi.fn().mockResolvedValue([]),
      },
      feedback: {
        listByFilter: vi.fn(async () => {
          throw new Error('legacy feedback repository should not be used');
        }),
      },
      conflict: {
        listAll: vi.fn(async () => {
          throw new Error('legacy conflict repository should not be used');
        }),
      },
      governanceRetrievalProjection: {
        listFeedback,
        listConflicts,
      },
    }) as SkillShareerRepos;

    await buildRetrievalReadModel(repos);

    expect(listFeedback).toHaveBeenCalledWith();
    expect(listConflicts).toHaveBeenCalledWith(['entry-1']);
  });

  it('attaches remediation state from the governance projection owner', async () => {
    const listRemediation = vi.fn().mockResolvedValue([
      {
        entryId: 'entry-1',
        remediation: {
          status: 'pending-human-review',
          triggeredByFeedbackCount: 10,
          threshold: 10,
          suppressedFromRetrieval: true,
          suppressedFromIndex: true,
          activeFeedbackIds: ['feedback-1'],
          openedAt: '2026-07-18T00:00:00.000Z',
          openedByUserId: 'admin-1',
          resolvedAt: null,
          resolvedByUserId: null,
        },
      },
    ]);
    const repos = createRetrievalMockRepos({
      knowledge: {
        listByFilter: vi.fn().mockResolvedValue([{ id: 'entry-1' }]),
      },
      artifact: { listByFilter: vi.fn().mockResolvedValue([]) },
      governanceRetrievalProjection: {
        listFeedback: vi.fn(async () => {
          throw new Error('retrieval must not compute remediation from raw feedback');
        }),
        listConflicts: vi.fn().mockResolvedValue([]),
        listRemediation,
      },
    }) as SkillShareerRepos;

    const result = await buildRetrievalReadModel(repos);

    expect(result.knowledgeEntries[0]?.remediation).toMatchObject({
      status: 'pending-human-review',
      triggeredByFeedbackCount: 10,
    });
    expect(listRemediation).toHaveBeenCalledWith(['entry-1']);
  });
});
