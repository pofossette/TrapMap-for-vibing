import 'reflect-metadata';

import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { CandidateIngestionPort, KnowledgeReadPort, ReviewPort } from '@trapmap/backend-core';
import { buildOwnerReviewQueueProjection } from '@trapmap/service-governance-review';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AllExceptionFilter } from '../runtime/exception.filter.js';
import type { HostLocalRuntime } from '../runtime/host-runtime.js';
import { RequestContextService } from '../runtime/request-context.service.js';
import { GatewayModule } from './gateway.module.js';

vi.mock('@trapmap/service-governance-review', async () => {
  const actual = await vi.importActual('@trapmap/service-governance-review');
  return {
    ...actual,
    buildOwnerReviewQueueProjection: vi.fn(),
  };
});

function createMockKnowledgeReadPort(): KnowledgeReadPort {
  return {
    getById: vi.fn(),
    listMine: vi.fn(),
    search: vi.fn(),
    getProjectionStatus: vi.fn(),
  };
}

function createMockCandidatePort(): CandidateIngestionPort {
  return {
    submit: vi.fn(),
    getById: vi.fn().mockResolvedValue(null),
    listByStatus: vi.fn(),
    applyResolution: vi.fn().mockResolvedValue(undefined),
    submitManualResult: vi.fn().mockResolvedValue(undefined),
    publishCandidateResult: vi.fn(),
  };
}

function createMockReviewPort(): ReviewPort {
  return {
    approve: vi.fn().mockResolvedValue({ entryId: 'entry-1', lifecycleState: 'approved' }),
    reject: vi.fn(),
    applyMaintenance: vi.fn(),
    applyDecay: vi.fn(),
    reviewArtifact: vi.fn(),
    submitFeedback: vi.fn(),
  };
}

function createMockRuntime(): HostLocalRuntime {
  return {
    services: {
      identity: {
        sessionRepo: {
          getByTokenHash: vi.fn(async () => ({
            subjectType: 'user',
            userId: 'user-1',
            activeTeamId: null,
          })),
        },
        userRepo: {
          getById: vi.fn(async () => ({ id: 'user-1', handle: 'alice' })),
        },
        membershipRepo: {
          listByUser: vi.fn(async () => []),
        },
        teamRepo: {
          getById: vi.fn(),
        },
      },
      runtimeDeployment: {
        capabilities: { supportsLocalSingleUserMode: true },
      },
      knowledgeOwner: {
        getById: vi.fn(async () => ({ id: 'entry-1', lifecycleState: 'approved' })),
        listByFilter: vi.fn(async () => []),
      },
      asyncTransport: {
        task: { enqueue: vi.fn(), requeue: vi.fn(), getStatusSnapshot: vi.fn() },
        events: {},
      },
      cronOwnerBundle: {},
      cronScheduler: {
        run: vi.fn(async () => undefined),
        stop: vi.fn(async () => undefined),
        isRunning: vi.fn(() => false),
        ownsWork: vi.fn(() => true),
      },
    },
  };
}

interface TestHarness {
  app: NestFastifyApplication;
  runtime: HostLocalRuntime;
  candidateIngestion: CandidateIngestionPort;
  governanceReview: ReviewPort;
}

async function createTestApp(): Promise<TestHarness> {
  const runtime = createMockRuntime();
  const candidateIngestion = createMockCandidatePort();
  const governanceReview = createMockReviewPort();

  const moduleRef = await Test.createTestingModule({
    imports: [
      GatewayModule.forRuntime(runtime, {
        knowledgeRead: createMockKnowledgeReadPort(),
        candidateIngestion,
        governanceReview,
      }),
    ],
    providers: [RequestContextService],
  }).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  const requestContext = moduleRef.get(RequestContextService);
  app.useGlobalFilters(new AllExceptionFilter(requestContext));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, runtime, candidateIngestion, governanceReview };
}

const authHeaders = { authorization: 'Bearer test-token' };

describe('gateway route defs handler behavior (migrated from candidate-review.controller)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(buildOwnerReviewQueueProjection).mockResolvedValue({ items: [], total: 0 });
  });

  it('routes apply-resolution as a read-modify-write through the candidate port', async () => {
    const { app, candidateIngestion } = await createTestApp();
    vi.mocked(candidateIngestion.getById as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        id: 'candidate-1',
        status: 'duplicate_detected',
        manualResult: { decision: 'independent', notes: 'publish it' },
      })
      .mockResolvedValueOnce({
        id: 'candidate-1',
        status: 'resolved',
        manualResult: { decision: 'independent', notes: 'publish it' },
      });

    const response = await app.getHttpAdapter().getInstance().inject({
      method: 'POST',
      url: '/v1/candidates/candidate-1/apply-resolution',
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(candidateIngestion.applyResolution).toHaveBeenCalledWith(
      'candidate-1',
      { decision: 'independent', notes: 'publish it' },
      'user-1',
    );
    expect(JSON.parse(response.payload)).toEqual({
      candidateId: 'candidate-1',
      status: 'resolved',
      outcome: { decision: 'independent', notes: 'publish it' },
    });

    await app.close();
  });

  it('returns a missing outcome when the candidate has no manual result', async () => {
    const { app, candidateIngestion } = await createTestApp();
    vi.mocked(candidateIngestion.getById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const response = await app.getHttpAdapter().getInstance().inject({
      method: 'POST',
      url: '/v1/candidates/candidate-1/apply-resolution',
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(candidateIngestion.applyResolution).not.toHaveBeenCalled();
    expect(JSON.parse(response.payload)).toEqual({
      candidateId: 'candidate-1',
      status: 'missing',
      outcome: null,
    });

    await app.close();
  });

  it('routes manual-result through the candidate port and shapes the response', async () => {
    const { app, candidateIngestion } = await createTestApp();

    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'POST',
        url: '/v1/candidates/candidate-1/manual-result',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        payload: JSON.stringify({ decision: 'independent', notes: 'keep as standalone' }),
      });

    expect(response.statusCode).toBe(200);
    expect(candidateIngestion.submitManualResult).toHaveBeenCalledWith(
      'candidate-1',
      { decision: 'independent', notes: 'keep as standalone' },
      'user-1',
    );
    expect(JSON.parse(response.payload)).toMatchObject({
      candidateId: 'candidate-1',
      decision: 'independent',
      reviewedBy: 'user-1',
      nextState: 'ready_for_review',
    });

    await app.close();
  });

  it('routes a review decision through the governance port and re-reads the entry', async () => {
    const { app, governanceReview, runtime } = await createTestApp();

    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'POST',
        url: '/v1/knowledge/review',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        payload: JSON.stringify({ entryId: 'entry-1', decision: 'approve', notes: 'ship it' }),
      });

    expect(response.statusCode).toBe(200);
    expect(governanceReview.approve).toHaveBeenCalledWith({
      entryId: 'entry-1',
      actorId: 'user-1',
      note: 'ship it',
    });
    expect(runtime.services.knowledgeOwner.getById).toHaveBeenCalledWith('entry-1');
    expect(JSON.parse(response.payload)).toEqual({
      entry: { id: 'entry-1', lifecycleState: 'approved' },
    });

    await app.close();
  });

  it('builds the review queue through the knowledge owner projection', async () => {
    const { app, runtime } = await createTestApp();

    const response = await app.getHttpAdapter().getInstance().inject({
      method: 'GET',
      url: '/v1/knowledge/review-queue',
      headers: authHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(buildOwnerReviewQueueProjection).toHaveBeenCalledWith(
      runtime.services.knowledgeOwner,
      expect.objectContaining({
        auth: expect.objectContaining({ actorId: 'user-1' }),
      }),
    );
    expect(JSON.parse(response.payload)).toEqual({ items: [], nextCursor: null, total: 0 });

    await app.close();
  });
});
