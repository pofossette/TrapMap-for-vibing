import { beforeEach, describe, expect, it } from 'vitest';
import { vi } from 'vitest';

import { createRetrievalArtifactFixture, createRetrievalMockRepos } from '@trapmap/contracts';
import type { SkillShareerRepos } from '@trapmap/runtime-infra';

import { buildRetrievalReadModel } from './read-model.js';
import { resetRetrievalReadModelCacheForTests } from './retrieval-read-model-cache.js';

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
    }) as unknown as SkillShareerRepos;

    const result = await buildRetrievalReadModel(repos);

    expect(result.skillArtifacts).toEqual([artifact]);
    expect(result.skillArtifacts[0]).toBe(artifact);
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
    }) as unknown as SkillShareerRepos;

    await buildRetrievalReadModel(repos);

    expect(listFeedback).toHaveBeenCalledWith();
    expect(listConflicts).toHaveBeenCalledWith(['entry-1']);
  });
});
