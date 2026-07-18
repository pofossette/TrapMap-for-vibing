import { describe, expect, it, vi } from 'vitest';

import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';

import { createGovernanceReviewDeps } from './ports.js';

describe('distributed governance review composition', () => {
  it('injects a conflict workflow backed by internal knowledge-write reads', () => {
    const deps = createGovernanceReviewDeps(
      {
        feedbackRepo: {} as never,
        conflictProjection: {
          listByEntryIds: vi.fn().mockResolvedValue([]),
          upsert: vi.fn().mockResolvedValue(undefined),
        },
      } as never,
      {
        internalUrls: {
          identityAccess: 'http://identity.test',
          knowledgeRead: 'http://read.test',
          knowledgeWrite: 'http://write.test',
          candidateIngestion: 'http://candidate.test',
          review: 'http://review.test',
          governanceReview: 'http://review.test',
          jobRuntime: 'http://job.test',
          gateway: 'http://gateway.test',
        },
        internalTransports: { knowledgeWrite: 'http' },
      } as ServiceConfig,
      { auditLog: {} as never },
    );

    expect(deps.conflictWorkflow).toBeDefined();
  });
});
