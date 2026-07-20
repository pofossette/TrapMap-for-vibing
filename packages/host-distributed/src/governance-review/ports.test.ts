import { describe, expect, it, vi } from 'vitest';

import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';

import {
  createDistributedGovernanceArtifactReadProjection,
  createDistributedGovernanceKnowledgeReadPort,
  createGovernanceReviewDeps,
} from './ports.js';

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

  it('injects owner async commands and feedback admin capabilities', () => {
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

    expect(deps.asyncCommands).toBeDefined();
    expect(deps.admin).toBeDefined();
  });

  it('maps remote knowledge and artifact read statuses for owner admin calls', async () => {
    const knowledgeRead = createDistributedGovernanceKnowledgeReadPort({
      knowledgeRead: {
        getById: vi.fn().mockResolvedValue({
          status: 404,
          body: { error: 'Knowledge entry not found', kind: 'not-found' },
        }),
      },
    } as never);
    await expect(knowledgeRead.getById('entry-1')).resolves.toBeNull();

    const unavailableBody = { error: 'knowledge unavailable', kind: 'unavailable' };
    const unavailableRead = createDistributedGovernanceKnowledgeReadPort({
      knowledgeRead: {
        getById: vi.fn().mockResolvedValue({ status: 503, body: unavailableBody }),
      },
    } as never);
    await expect(unavailableRead.getById('entry-1')).rejects.toMatchObject({
      kind: 'unavailable',
      cause: unavailableBody,
    });

    const artifactRead = createDistributedGovernanceArtifactReadProjection({
      knowledgeWrite: {
        getArtifactById: vi.fn().mockResolvedValue({
          status: 404,
          body: { error: 'Artifact not found', kind: 'not-found' },
        }),
      },
    } as never);
    await expect(artifactRead.getById('artifact-1')).resolves.toBeNull();

    const artifactUnavailableBody = { error: 'artifact unavailable', kind: 'unavailable' };
    const unavailableArtifactRead = createDistributedGovernanceArtifactReadProjection({
      knowledgeWrite: {
        getArtifactById: vi.fn().mockResolvedValue({
          status: 503,
          body: artifactUnavailableBody,
        }),
      },
    } as never);
    await expect(unavailableArtifactRead.getById('artifact-1')).rejects.toMatchObject({
      kind: 'unavailable',
      cause: artifactUnavailableBody,
    });
  });
});
