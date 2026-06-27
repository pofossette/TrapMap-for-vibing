import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { HostLocalRuntime } from '../runtime/host-runtime.js';

const reviewServiceMock = {
  applyDecision: vi.fn(),
};

vi.mock('@trapmap/server/lib/candidates/services/resolution-service.js', () => ({
  applyResolution: vi.fn(),
  attachManualResult: vi.fn(),
}));

vi.mock('@trapmap/server/lib/knowledge/review-application-service.js', () => ({
  createReviewApplicationService: () => reviewServiceMock,
}));

vi.mock('@trapmap/server/lib/operations/read-model.js', () => ({
  buildReviewQueueProjection: vi.fn(),
}));

vi.mock('@trapmap/server/lib/lifecycle/publisher.js', () => ({
  createLifecyclePublisher: () => ({ publish: vi.fn() }),
}));

import { CandidateReviewController } from './candidate-review.controller.js';
import { applyResolution } from '@trapmap/server/lib/candidates/services/resolution-service.js';

function createRuntime(): HostLocalRuntime {
  return {
    services: {
      config: {},
      store: {},
      eventBus: {},
      asyncTransport: undefined,
      repos: {
        candidate: {},
        lineage: {},
        knowledge: {},
        audit: {},
        user: {},
        membership: {},
        feedback: {},
      },
    },
    retrievalQuery: {} as HostLocalRuntime['retrievalQuery'],
    sessionLookup: {} as HostLocalRuntime['sessionLookup'],
    teamLookup: {} as HostLocalRuntime['teamLookup'],
    permissionCheck: {} as HostLocalRuntime['permissionCheck'],
    auditLog: {} as HostLocalRuntime['auditLog'],
    queuePorts: {} as HostLocalRuntime['queuePorts'],
  };
}

describe('CandidateReviewController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes apply-resolution through the Nest light mainline runtime', async () => {
    vi.mocked(applyResolution).mockResolvedValueOnce({
      candidateId: 'candidate-1',
      status: 'resolved',
    });
    const controller = new CandidateReviewController(createRuntime());

    const result = await controller.applyCandidateResolution('candidate-1', {
      authContext: {
        actorId: 'user-1',
      },
    } as any);

    expect(applyResolution).toHaveBeenCalledWith(
      expect.objectContaining({
        repos: expect.objectContaining({
          candidate: {},
          lineage: {},
        }),
      }),
      expect.objectContaining({
        actorId: 'user-1',
      }),
      'candidate-1',
    );
    expect(result).toMatchObject({
      candidateId: 'candidate-1',
      status: 'resolved',
    });
  });

  it('routes knowledge review through the Nest light mainline runtime', async () => {
    reviewServiceMock.applyDecision.mockResolvedValueOnce({
      entry: {
        id: 'entry-1',
        lifecycleState: 'approved',
      },
    });
    const controller = new CandidateReviewController(createRuntime());

    const result = await controller.applyReviewDecision(
      {
        entryId: 'entry-1',
        decision: 'approve',
        notes: 'ship it',
      } as any,
      {
        authContext: {
          actorId: 'reviewer-1',
        },
      } as any,
    );

    expect(reviewServiceMock.applyDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'reviewer-1',
        entryId: 'entry-1',
        decision: 'approve',
      }),
    );
    expect(result).toMatchObject({
      entry: {
        id: 'entry-1',
        lifecycleState: 'approved',
      },
    });
  });
});
