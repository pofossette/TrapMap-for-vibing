import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  CandidateIngestionPort,
  JobRuntimePort,
  KnowledgeReadPort,
  KnowledgeWritePort,
  ReviewPort,
} from '@trapmap/backend-core';
import { registerRoutes as registerCandidateRoutes } from '../candidate-ingestion/routes.js';
import { createInternalServiceClients } from './internal-client.js';
import { registerGatewayRoutes } from './routes.js';
import { registerRoutes as registerGovernanceRoutes } from '../governance-review/routes.js';
import { registerRoutes as registerJobRuntimeRoutes } from '../job-runtime/routes.js';
import { registerRoutes as registerKnowledgeReadRoutes } from '../knowledge-read/routes.js';
import { registerRoutes as registerKnowledgeWriteRoutes } from '../knowledge-write/routes.js';

const originalFetch = globalThis.fetch;

async function listen(app: FastifyInstance): Promise<string> {
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve server address');
  }
  return `http://127.0.0.1:${address.port}`;
}

function createIdentityApp(headersSeen: Array<Record<string, string | undefined>>) {
  const app = Fastify();
  app.post('/internal/auth/validate', async (request, reply) => {
    headersSeen.push({
      'x-request-id': request.headers['x-request-id'] as string | undefined,
      'x-trace-id': request.headers['x-trace-id'] as string | undefined,
      authorization: request.headers.authorization as string | undefined,
    });
    return reply.send({
      sessionId: 'session-1',
      userId: 'user-1',
      handle: 'alice',
      activeTeamId: null,
      securityLevel: 1,
    });
  });
  return app;
}

function createKnowledgeReadModule(): KnowledgeReadPort {
  return {
    getById: vi.fn(async () => ({
      id: 'entry-1',
      content: 'hello',
      lifecycleState: 'approved',
      ownerUserId: 'user-1',
      teamId: 'team-1',
    })),
    listMine: vi.fn(async () => []),
    search: vi.fn(async () => ({ results: [] })),
    getProjectionStatus: vi.fn(async () => ({
      phase: 'phase-2-boundary-closed',
      source: 'mixed-phase-2-read-side-contract',
      consistency: 'eventual',
      freshness: 'current',
      fallback: 'none',
      notes: 'phase 2 closes read-side ownership and direct-read allowance explicitly',
      surfaces: [
        {
          surface: 'knowledge-entry:getById',
          owner: 'knowledge-read',
          providedBy: 'knowledge-read',
          source: 'temporary-direct-backed-projection',
          authoritativeSource: 'knowledge-write authoritative PostgreSQL tables',
          consistency: 'strong',
          freshness: 'current',
          fallback: 'direct-authoritative-read',
          notes: 'temporary direct-backed entry projection',
          exitCriteria: 'replace with derived projection ownership',
        },
        {
          surface: 'retrieval-search',
          owner: 'knowledge-read',
          providedBy: 'knowledge-read',
          source: 'derived-search-index',
          authoritativeSource: 'knowledge-write lifecycle events and retrieval indexing artifacts',
          consistency: 'eventual',
          freshness: 'current',
          fallback: 'none',
          notes: 'retrieval is served from derived search state',
        },
      ],
    })),
  };
}

function createKnowledgeWriteModule(
  headersSeen: Array<Record<string, string | undefined>>,
): KnowledgeWritePort {
  return {
    submit: vi.fn(async () => ({ entryId: 'entry-1' })),
    updateEntry: vi.fn(async () => undefined),
    resubmit: vi.fn(async () => undefined),
    supersede: vi.fn(async () => undefined),
    createTrap: vi.fn(async () => ({ trapId: 'trap-1' })),
    approveReviewDecision: vi.fn(async (input) => {
      return { entryId: input.entryId, lifecycleState: 'approved' as const };
    }),
    rejectReviewDecision: vi.fn(async (input) => {
      return { entryId: input.entryId, lifecycleState: 'rejected' as const };
    }),
    applyMaintenanceDecision: vi.fn(async (input) => {
      return { entryId: input.entryId, action: input.action };
    }),
    applyDecayDecision: vi.fn(async (input) => {
      return { entryId: input.entryId, action: input.action };
    }),
    publishCandidateResult: vi.fn(async (input) => {
      return { candidateId: input.candidateId, entryId: 'entry-1' };
    }),
    listTraps: vi.fn(async () => []),
    getTrap: vi.fn(async () => null),
  };
}

function createCandidateModule(
  calls: string[],
  clients: ReturnType<typeof createInternalServiceClients>,
): CandidateIngestionPort {
  return {
    submit: vi.fn(async () => ({ candidateId: 'candidate-1' })),
    getById: vi.fn(async () => null),
    listByStatus: vi.fn(async () => []),
    applyResolution: vi.fn(async (candidateId, resolution, actorId) => {
      calls.push(`candidate-resolution:${candidateId}`);
      await clients.knowledgeWrite.publishCandidateResult(
        { candidateId, actorId, result: resolution },
        { headers: { 'x-request-id': 'req-1', 'x-trace-id': 'trace-1' } },
      );
    }),
    submitManualResult: vi.fn(async (candidateId, result, actorId) => {
      calls.push(`candidate-manual:${candidateId}`);
      await clients.knowledgeWrite.publishCandidateResult(
        { candidateId, actorId, result },
        { headers: { 'x-request-id': 'req-1', 'x-trace-id': 'trace-1' } },
      );
    }),
    publishCandidateResult: vi.fn(async (candidateId) => ({ candidateId, entryId: 'entry-1' })),
  };
}

function createGovernanceModule(
  calls: string[],
  clients: ReturnType<typeof createInternalServiceClients>,
): ReviewPort {
  return {
    approve: vi.fn(async (input) => {
      calls.push(`review-approve:${input.entryId}`);
      return clients.knowledgeWrite
        .approveReviewDecision(input, {
          headers: { 'x-request-id': 'req-1', 'x-trace-id': 'trace-1' },
        })
        .then((response) => response.body as { entryId: string; lifecycleState: 'approved' });
    }),
    reject: vi.fn(async (input) => {
      calls.push(`review-reject:${input.entryId}`);
      return clients.knowledgeWrite
        .rejectReviewDecision(input, {
          headers: { 'x-request-id': 'req-1', 'x-trace-id': 'trace-1' },
        })
        .then((response) => response.body as { entryId: string; lifecycleState: 'rejected' });
    }),
    applyMaintenance: vi.fn(async (input) => {
      calls.push(`review-maintenance:${input.entryId}`);
      return clients.knowledgeWrite
        .applyMaintenanceDecision(input, {
          headers: { 'x-request-id': 'req-1', 'x-trace-id': 'trace-1' },
        })
        .then((response) => response.body as { entryId: string; action: string });
    }),
    applyDecay: vi.fn(async (input) => {
      calls.push(`review-decay:${input.entryId}`);
      return clients.knowledgeWrite
        .applyDecayDecision(input, {
          headers: { 'x-request-id': 'req-1', 'x-trace-id': 'trace-1' },
        })
        .then((response) => response.body as { entryId: string; action: string });
    }),
    reviewArtifact: vi.fn(async () => undefined),
    submitFeedback: vi.fn(async () => ({ feedbackId: 'feedback-1' })),
  };
}

function createJobRuntimeModule(calls: string[]): JobRuntimePort {
  return {
    schedule: vi.fn(async (type) => {
      calls.push(`job-schedule:${type}`);
      return 'job-1';
    }),
    getStatus: vi.fn(async (jobId) => {
      calls.push(`job-status:${jobId}`);
      return { status: 'running' as const, result: { owner: 'job-runtime' } };
    }),
    getQueueStatus: vi.fn(async () => {
      calls.push('job-queue');
      return { pending: 1, running: 1, dead: 0 };
    }),
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe('distributed gateway acceptance', () => {
  it('proves candidate and review writes traverse real internal HTTP hops to their remote owners', async () => {
    const identityHeaders: Array<Record<string, string | undefined>> = [];
    const knowledgeWriteHeaders: Array<Record<string, string | undefined>> = [];
    const candidateCalls: string[] = [];
    const governanceCalls: string[] = [];

    const identityApp = createIdentityApp(identityHeaders);
    const knowledgeReadApp = Fastify();
    registerKnowledgeReadRoutes(knowledgeReadApp, createKnowledgeReadModule());

    const knowledgeWriteApp = Fastify();
    knowledgeWriteApp.addHook('onRequest', async (request) => {
      knowledgeWriteHeaders.push({
        'x-request-id': request.headers['x-request-id'] as string | undefined,
        'x-trace-id': request.headers['x-trace-id'] as string | undefined,
      });
    });
    registerKnowledgeWriteRoutes(
      knowledgeWriteApp,
      createKnowledgeWriteModule(knowledgeWriteHeaders),
    );

    const identityUrl = await listen(identityApp);
    const knowledgeReadUrl = await listen(knowledgeReadApp);
    const knowledgeWriteUrl = await listen(knowledgeWriteApp);

    const internalClients = createInternalServiceClients({
      gateway: 'http://127.0.0.1:0',
      identityAccess: identityUrl,
      knowledgeRead: knowledgeReadUrl,
      knowledgeWrite: knowledgeWriteUrl,
      candidateIngestion: 'http://127.0.0.1:0',
      review: 'http://127.0.0.1:0',
      governanceReview: 'http://127.0.0.1:0',
      jobRuntime: 'http://127.0.0.1:0',
    });

    const candidateApp = Fastify();
    registerCandidateRoutes(candidateApp, createCandidateModule(candidateCalls, internalClients));
    const governanceApp = Fastify();
    registerGovernanceRoutes(
      governanceApp,
      createGovernanceModule(governanceCalls, internalClients),
    );

    const candidateUrl = await listen(candidateApp);
    const governanceUrl = await listen(governanceApp);

    const gatewayClients = createInternalServiceClients({
      gateway: 'http://127.0.0.1:0',
      identityAccess: identityUrl,
      knowledgeRead: knowledgeReadUrl,
      knowledgeWrite: knowledgeWriteUrl,
      candidateIngestion: candidateUrl,
      review: governanceUrl,
      governanceReview: governanceUrl,
      jobRuntime: 'http://127.0.0.1:0',
    });

    const gatewayApp = Fastify();
    registerGatewayRoutes(gatewayApp, gatewayClients);
    await gatewayApp.ready();

    const resolution = await gatewayApp.inject({
      method: 'POST',
      url: '/v1/candidates/candidate-1/resolution',
      headers: {
        authorization: 'Bearer session',
        'x-request-id': 'req-1',
        'x-trace-id': 'trace-1',
      },
      payload: { resolution: { decision: 'merge' }, actorId: 'user-1' },
    });
    const approve = await gatewayApp.inject({
      method: 'POST',
      url: '/v1/knowledge/review',
      headers: {
        authorization: 'Bearer session',
        'x-request-id': 'req-1',
        'x-trace-id': 'trace-1',
      },
      payload: { entryId: 'entry-1', actorId: 'user-1', decision: 'approve', note: 'ship it' },
    });

    expect(resolution.statusCode).toBe(200);
    expect(approve.statusCode).toBe(200);
    expect(candidateCalls).toContain('candidate-resolution:candidate-1');
    expect(governanceCalls).toContain('review-approve:entry-1');
    expect(identityHeaders[0]).toMatchObject({
      authorization: undefined,
    });
    expect(knowledgeWriteHeaders).toContainEqual({
      'x-request-id': 'req-1',
      'x-trace-id': 'trace-1',
    });

    await gatewayApp.close();
    await governanceApp.close();
    await candidateApp.close();
    await knowledgeWriteApp.close();
    await knowledgeReadApp.close();
    await identityApp.close();
  });

  it('preserves gateway error semantics for remote-owner failures', async () => {
    const identityApp = createIdentityApp([]);
    const reviewApp = Fastify();
    reviewApp.post('/internal/review/approve', async (_request, reply) => {
      return reply.status(409).send({ error: 'already-reviewed', kind: 'conflict' });
    });

    const identityUrl = await listen(identityApp);
    const reviewUrl = await listen(reviewApp);

    const gatewayApp = Fastify();
    registerGatewayRoutes(
      gatewayApp,
      createInternalServiceClients({
        gateway: 'http://127.0.0.1:0',
        identityAccess: identityUrl,
        knowledgeRead: 'http://127.0.0.1:1',
        knowledgeWrite: 'http://127.0.0.1:1',
        candidateIngestion: 'http://127.0.0.1:1',
        review: reviewUrl,
        governanceReview: reviewUrl,
        jobRuntime: 'http://127.0.0.1:1',
      }),
    );
    await gatewayApp.ready();

    const response = await gatewayApp.inject({
      method: 'POST',
      url: '/v1/knowledge/review',
      headers: { authorization: 'Bearer session' },
      payload: { entryId: 'entry-1', actorId: 'user-1', decision: 'approve' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: 'already-reviewed', kind: 'conflict' });

    await gatewayApp.close();
    await reviewApp.close();
    await identityApp.close();
  });

  it('exposes distributed job-runtime ownership through real HTTP scheduling and status hops', async () => {
    const identityApp = createIdentityApp([]);
    const jobCalls: string[] = [];
    const jobApp = Fastify();
    registerJobRuntimeRoutes(jobApp, createJobRuntimeModule(jobCalls));

    const identityUrl = await listen(identityApp);
    const jobUrl = await listen(jobApp);

    const gatewayApp = Fastify();
    registerGatewayRoutes(
      gatewayApp,
      createInternalServiceClients({
        gateway: 'http://127.0.0.1:0',
        identityAccess: identityUrl,
        knowledgeRead: 'http://127.0.0.1:1',
        knowledgeWrite: 'http://127.0.0.1:1',
        candidateIngestion: 'http://127.0.0.1:1',
        review: 'http://127.0.0.1:1',
        governanceReview: 'http://127.0.0.1:1',
        jobRuntime: jobUrl,
      }),
    );
    await gatewayApp.ready();

    const schedule = await gatewayApp.inject({
      method: 'POST',
      url: '/v1/jobs',
      headers: { authorization: 'Bearer session' },
      payload: { type: 'knowledge.index-follow-up', payload: { entryId: 'entry-1' }, priority: 5 },
    });
    const status = await gatewayApp.inject({
      method: 'GET',
      url: '/v1/jobs/job-1',
      headers: { authorization: 'Bearer session' },
    });
    const queue = await gatewayApp.inject({
      method: 'GET',
      url: '/v1/jobs/queue',
      headers: { authorization: 'Bearer session' },
    });

    expect(schedule.statusCode).toBe(201);
    expect(status.statusCode).toBe(200);
    expect(queue.statusCode).toBe(200);
    expect(jobCalls).toEqual([
      'job-schedule:knowledge.index-follow-up',
      'job-status:job-1',
      'job-queue',
    ]);

    await gatewayApp.close();
    await jobApp.close();
    await identityApp.close();
  });
});
