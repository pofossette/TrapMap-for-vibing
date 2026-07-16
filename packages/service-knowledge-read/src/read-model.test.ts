import { beforeEach, describe, expect, it } from 'vitest';

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
});
