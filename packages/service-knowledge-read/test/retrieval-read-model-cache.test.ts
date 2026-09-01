import { beforeEach, describe, expect, it } from 'vitest';

import type { RetrievalReadModel } from '../src/read-model.js';
import {
  clearRetrievalReadModelCache,
  getCachedRetrievalReadModel,
  invalidateRetrievalReadModel,
  resetRetrievalReadModelCacheForTests,
  setCachedRetrievalReadModel,
} from '../src/retrieval-read-model-cache.js';

function createReadModel(id: string): RetrievalReadModel {
  return {
    knowledgeEntries: [
      {
        id,
        teamId: null,
        scope: 'global',
        labels: [],
        shortcut: 'shortcut',
        detail: 'detail',
        requiredLevel: 0,
        lifecycleState: 'approved',
        ownerUserId: 'user-1',
        latestRevision: null,
        history: [],
        metadata: {
          scopeLabel: 'global-constraint',
          submissionCount: 0,
          resubmissionCount: 0,
          revisionCount: 0,
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
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    skillArtifacts: [],
    conflicts: [],
  };
}

describe('retrieval read model cache', () => {
  beforeEach(() => {
    clearRetrievalReadModelCache();
    resetRetrievalReadModelCacheForTests();
  });

  it('returns the cached read model after it is stored', () => {
    const model = createReadModel('entry-1');

    setCachedRetrievalReadModel(model);

    expect(getCachedRetrievalReadModel()).toEqual(model);
  });

  it('clears the cache when a retrieval invalidation is emitted', () => {
    setCachedRetrievalReadModel(createReadModel('entry-1'));

    invalidateRetrievalReadModel('approved');

    expect(getCachedRetrievalReadModel()).toBeNull();
  });
});
