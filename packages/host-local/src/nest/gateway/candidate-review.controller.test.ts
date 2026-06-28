import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CandidateIngestionPort, ReviewPort } from '@trapmap/backend-core';

import type { HostLocalRuntime } from '../runtime/host-runtime.js';

const candidateIngestionMock: CandidateIngestionPort = {
  submit: vi.fn(),
  getById: vi.fn(),
  listByStatus: vi.fn(),
  applyResolution: vi.fn(),
  submitManualResult: vi.fn(),
  publishCandidateResult: vi.fn(),
};

const governanceReviewMock: ReviewPort = {
  approve: vi.fn(),
  reject: vi.fn(),
  applyMaintenance: vi.fn(),
  applyDecay: vi.fn(),
  reviewArtifact: vi.fn(),
  submitFeedback: vi.fn(),
};

vi.mock('@trapmap/server/lib/operations/read-model.js', () => ({
  buildReviewQueueProjection: vi.fn(),
}));

import { CandidateReviewController } from './candidate-review.controller.js';

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
        knowledge: {
          getById: vi.fn(async () => ({
            id: 'entry-1',
            lifecycleState: 'approved',
          })),
        },
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
    const runtime = createRuntime();
    const candidateRepo = {
      getById: vi
        .fn()
        .mockResolvedValueOnce({
          id: 'candidate-1',
          status: 'duplicate_detected',
          manualResult: {
            decision: 'independent',
            notes: 'publish it',
          },
        })
        .mockResolvedValueOnce({
          id: 'candidate-1',
          status: 'resolved',
          manualResult: {
            decision: 'independent',
            notes: 'publish it',
          },
        }),
    };
    runtime.services.repos.candidate = candidateRepo as any;
    vi.mocked(candidateIngestionMock.applyResolution).mockResolvedValueOnce(undefined);
    const controller = new CandidateReviewController(
      candidateIngestionMock,
      governanceReviewMock,
      runtime,
    );

    const result = await controller.applyCandidateResolution('candidate-1', {
      authContext: {
        actorId: 'user-1',
      },
    } as any);

    expect(candidateIngestionMock.applyResolution).toHaveBeenCalledWith(
      'candidate-1',
      {
        decision: 'independent',
        notes: 'publish it',
      },
      'user-1',
    );
    expect(result).toMatchObject({
      candidateId: 'candidate-1',
      status: 'resolved',
      outcome: {
        decision: 'independent',
        notes: 'publish it',
      },
    });
  });

  it('routes knowledge review through the Nest light mainline runtime', async () => {
    vi.mocked(governanceReviewMock.approve).mockResolvedValueOnce({
      entryId: 'entry-1',
      lifecycleState: 'approved',
    });
    const controller = new CandidateReviewController(
      candidateIngestionMock,
      governanceReviewMock,
      createRuntime(),
    );

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

    expect(governanceReviewMock.approve).toHaveBeenCalledWith({
      entryId: 'entry-1',
      actorId: 'reviewer-1',
      note: 'ship it',
      evidence: undefined,
    });
    expect(result).toMatchObject({
      entry: {
        id: 'entry-1',
        lifecycleState: 'approved',
      },
    });
  });

  it('routes manual-result through the candidate-ingestion owner port', async () => {
    vi.mocked(candidateIngestionMock.submitManualResult).mockResolvedValueOnce(undefined);
    const controller = new CandidateReviewController(
      candidateIngestionMock,
      governanceReviewMock,
      createRuntime(),
    );

    const result = await controller.submitManualResult(
      'candidate-1',
      {
        decision: 'independent',
        notes: 'keep as standalone',
      } as any,
      {
        authContext: {
          actorId: 'reviewer-1',
        },
      } as any,
    );

    expect(candidateIngestionMock.submitManualResult).toHaveBeenCalledWith(
      'candidate-1',
      {
        decision: 'independent',
        notes: 'keep as standalone',
      },
      'reviewer-1',
    );
    expect(result).toMatchObject({
      candidateId: 'candidate-1',
      decision: 'independent',
      reviewedBy: 'reviewer-1',
      nextState: 'ready_for_review',
    });
  });
});
