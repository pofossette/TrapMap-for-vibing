import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  CandidateIngestionPort,
  IdentityAccessPort,
  JobRuntimePort,
  KnowledgeReadPort,
  KnowledgeWritePort,
  ReviewPort,
} from '@trapmap/backend-core';
import { registerCandidateIngestionRoutes } from '@trapmap/service-candidate-ingestion';
import { registerGovernanceReviewRoutes } from '@trapmap/service-governance-review';
import { registerIdentityAccessRoutes } from '@trapmap/service-identity-access';
import { registerJobRuntimeRoutes } from '@trapmap/service-job-runtime';
import { registerKnowledgeReadRoutes } from '@trapmap/service-knowledge-read';
import { registerKnowledgeWriteRoutes } from '@trapmap/service-knowledge-write';
import { createInternalServiceClients } from './internal-client.js';
import { registerGatewayRoutes } from './routes.js';

const originalFetch = globalThis.fetch;

async function listen(app: FastifyInstance): Promise<string> {
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to resolve server address');
  }
  return `http://127.0.0.1:${address.port}`;
}

function createIdentityModule(): IdentityAccessPort {
  return {
    login: vi.fn(async () => ({ sessionToken: 'session-1', userId: 'user-1', handle: 'alice' })),
    logout: vi.fn(async () => undefined),
    validateSession: vi.fn(async () => ({
      sessionId: 'session-1',
      userId: 'user-1',
      handle: 'alice',
      activeTeamId: null,
      securityLevel: 1,
    })),
    selectTeam: vi.fn(async () => undefined),
    createTeam: vi.fn(async () => ({ teamId: 'team-1' })),
    listTeams: vi.fn(async () => []),
    addMember: vi.fn(async () => undefined),
    updateMember: vi.fn(async () => undefined),
    provisionAccessKey: vi.fn(async () => ({ keyId: 'key-1', token: 'token-1' })),
  };
}

function createIdentityApp(headersSeen: Array<Record<string, string | undefined>>) {
  const app = Fastify();
  app.addHook('onRequest', async (request) => {
    headersSeen.push({
      'x-request-id': request.headers['x-request-id'] as string | undefined,
      'x-trace-id': request.headers['x-trace-id'] as string | undefined,
      authorization: request.headers.authorization as string | undefined,
    });
  });
  registerIdentityAccessRoutes(app, createIdentityModule());
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
  _headersSeen: Array<Record<string, string | undefined>>,
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
          headers: {
            'x-request-id': 'req-1',
            'x-trace-id': 'trace-1',
            'x-trapmap-actor-id': input.actorId,
          },
        })
        .then((response) => response.body as { entryId: string; lifecycleState: 'approved' });
    }),
    reject: vi.fn(async (input) => {
      calls.push(`review-reject:${input.entryId}`);
      return clients.knowledgeWrite
        .rejectReviewDecision(input, {
          headers: {
            'x-request-id': 'req-1',
            'x-trace-id': 'trace-1',
            'x-trapmap-actor-id': input.actorId,
          },
        })
        .then((response) => response.body as { entryId: string; lifecycleState: 'rejected' });
    }),
    applyMaintenance: vi.fn(async (input) => {
      calls.push(`review-maintenance:${input.entryId}`);
      return clients.knowledgeWrite
        .applyMaintenanceDecision(input, {
          headers: {
            'x-request-id': 'req-1',
            'x-trace-id': 'trace-1',
            'x-trapmap-actor-id': input.actorId,
          },
        })
        .then((response) => response.body as { entryId: string; action: string });
    }),
    applyDecay: vi.fn(async (input) => {
      calls.push(`review-decay:${input.entryId}`);
      return clients.knowledgeWrite
        .applyDecayDecision(input, {
          headers: {
            'x-request-id': 'req-1',
            'x-trace-id': 'trace-1',
            'x-trapmap-actor-id': input.actorId,
          },
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
    registerCandidateIngestionRoutes(
      candidateApp,
      createCandidateModule(candidateCalls, internalClients),
    );
    const governanceApp = Fastify();
    registerGovernanceReviewRoutes(
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

  it('proves gateway read and retrieval surfaces traverse knowledge-read over real internal HTTP hops', async () => {
    const identityApp = createIdentityApp([]);
    const knowledgeReadHeaders: Array<Record<string, string | undefined>> = [];
    const knowledgeReadModule = createKnowledgeReadModule();
    vi.mocked(knowledgeReadModule.listMine).mockResolvedValueOnce([
      {
        id: 'entry-1',
        content: 'hello',
        lifecycleState: 'approved',
        ownerUserId: 'user-1',
        teamId: 'team-1',
      },
    ]);
    vi.mocked(knowledgeReadModule.search).mockResolvedValueOnce({
      results: [{ entryId: 'entry-1', score: 0.99, snippet: 'hello' }],
      totalEstimate: 1,
      channel: 'derived-index',
    });

    const knowledgeReadApp = Fastify();
    knowledgeReadApp.addHook('onRequest', async (request) => {
      knowledgeReadHeaders.push({
        'x-request-id': request.headers['x-request-id'] as string | undefined,
        'x-trace-id': request.headers['x-trace-id'] as string | undefined,
        authorization: request.headers.authorization as string | undefined,
      });
    });
    registerKnowledgeReadRoutes(knowledgeReadApp, knowledgeReadModule);

    const identityUrl = await listen(identityApp);
    const knowledgeReadUrl = await listen(knowledgeReadApp);

    const gatewayApp = Fastify();
    registerGatewayRoutes(
      gatewayApp,
      createInternalServiceClients({
        gateway: 'http://127.0.0.1:0',
        identityAccess: identityUrl,
        knowledgeRead: knowledgeReadUrl,
        knowledgeWrite: 'http://127.0.0.1:1',
        candidateIngestion: 'http://127.0.0.1:1',
        review: 'http://127.0.0.1:1',
        governanceReview: 'http://127.0.0.1:1',
        jobRuntime: 'http://127.0.0.1:1',
      }),
    );
    await gatewayApp.ready();

    const listMine = await gatewayApp.inject({
      method: 'GET',
      url: '/v1/knowledge/mine?userId=user-1&teamId=team-1',
      headers: {
        authorization: 'Bearer session',
        'x-request-id': 'req-read-1',
        'x-trace-id': 'trace-read-1',
      },
    });
    const getById = await gatewayApp.inject({
      method: 'GET',
      url: '/v1/knowledge/entry-1',
      headers: {
        authorization: 'Bearer session',
        'x-request-id': 'req-read-2',
        'x-trace-id': 'trace-read-2',
      },
    });
    const search = await gatewayApp.inject({
      method: 'POST',
      url: '/v1/retrieval/search',
      headers: {
        authorization: 'Bearer session',
        'x-request-id': 'req-read-3',
        'x-trace-id': 'trace-read-3',
      },
      payload: { query: 'hello', teamId: 'team-1', limit: 3 },
    });

    expect(listMine.statusCode).toBe(200);
    expect(getById.statusCode).toBe(200);
    expect(search.statusCode).toBe(200);
    expect(knowledgeReadModule.listMine).toHaveBeenCalledWith('user-1', 'team-1');
    expect(knowledgeReadModule.getById).toHaveBeenCalledWith('entry-1');
    expect(knowledgeReadModule.search).toHaveBeenCalledWith({
      query: 'hello',
      teamId: 'team-1',
      limit: 3,
    });
    expect(knowledgeReadHeaders).toEqual([
      { 'x-request-id': undefined, 'x-trace-id': undefined, authorization: undefined },
      { 'x-request-id': undefined, 'x-trace-id': undefined, authorization: undefined },
      { 'x-request-id': undefined, 'x-trace-id': undefined, authorization: undefined },
    ]);

    await gatewayApp.close();
    await knowledgeReadApp.close();
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

  it('exposes governance-review and knowledge-write ownership declarations through real HTTP', async () => {
    const identityApp = createIdentityApp([]);
    const knowledgeWriteApp = Fastify();
    registerKnowledgeWriteRoutes(knowledgeWriteApp, createKnowledgeWriteModule([]));
    const governanceApp = Fastify();
    registerGovernanceReviewRoutes(
      governanceApp,
      createGovernanceModule(
        [],
        createInternalServiceClients({
          gateway: 'http://127.0.0.1:0',
          identityAccess: 'http://127.0.0.1:0',
          knowledgeRead: 'http://127.0.0.1:0',
          knowledgeWrite: 'http://127.0.0.1:0',
          candidateIngestion: 'http://127.0.0.1:0',
          review: 'http://127.0.0.1:0',
          governanceReview: 'http://127.0.0.1:0',
          jobRuntime: 'http://127.0.0.1:0',
        }),
      ),
    );

    const knowledgeWriteUrl = await listen(knowledgeWriteApp);
    const governanceUrl = await listen(governanceApp);

    const governanceOwnership = await fetch(`${governanceUrl}/internal/ownership`);
    const knowledgeWriteOwnership = await fetch(`${knowledgeWriteUrl}/internal/ownership`);
    const governanceReadiness = await fetch(`${governanceUrl}/internal/readiness`);
    const knowledgeWriteReadiness = await fetch(`${knowledgeWriteUrl}/internal/readiness`);

    expect(governanceOwnership.status).toBe(200);
    expect(knowledgeWriteOwnership.status).toBe(200);
    expect(governanceReadiness.status).toBe(200);
    expect(knowledgeWriteReadiness.status).toBe(200);

    const governanceOwnerBody = (await governanceOwnership.json()) as {
      service: string;
      doesNotOwn: string[];
      delegateTo: string;
    };
    expect(governanceOwnerBody.service).toBe('governance-review');
    expect(governanceOwnerBody.doesNotOwn).toContain('knowledge-aggregate-final-mutation');
    expect(governanceOwnerBody.delegateTo).toBe('knowledge-write');

    const kwOwnerBody = (await knowledgeWriteOwnership.json()) as {
      service: string;
      dataOwner: string[];
      acceptsDelegationFrom: string[];
    };
    expect(kwOwnerBody.service).toBe('knowledge-write');
    expect(kwOwnerBody.dataOwner).toContain('knowledge-aggregate');
    expect(kwOwnerBody.acceptsDelegationFrom).toContain('governance-review');

    const governanceReadyBody = (await governanceReadiness.json()) as {
      ready: boolean;
      finalAggregateMutation: string;
      followUpDisposition: string;
    };
    expect(governanceReadyBody.ready).toBe(true);
    expect(governanceReadyBody.finalAggregateMutation).toBe('delegated-to-knowledge-write');
    expect(governanceReadyBody.followUpDisposition).toBe('outbox-queue-workflow-async');

    const kwReadyBody = (await knowledgeWriteReadiness.json()) as {
      ready: boolean;
      aggregateMutationAuthority: boolean;
      followUpDisposition: string;
    };
    expect(kwReadyBody.ready).toBe(true);
    expect(kwReadyBody.aggregateMutationAuthority).toBe(true);
    expect(kwReadyBody.followUpDisposition).toBe('outbox-queue-workflow-async');

    await knowledgeWriteApp.close();
    await governanceApp.close();
    await identityApp.close();
  });

  it('proves idempotent retry of governance delegation replays the same command without duplicate aggregate mutation', async () => {
    const identityApp = createIdentityApp([]);
    const knowledgeWriteHeaders: Array<Record<string, string | undefined>> = [];
    const knowledgeWriteModule = createKnowledgeWriteModule(knowledgeWriteHeaders);
    const approveReviewDecision = knowledgeWriteModule.approveReviewDecision;

    const knowledgeWriteApp = Fastify();
    knowledgeWriteApp.addHook('onRequest', async (request) => {
      knowledgeWriteHeaders.push({
        'x-request-id': request.headers['x-request-id'] as string | undefined,
        'x-trace-id': request.headers['x-trace-id'] as string | undefined,
      });
    });
    registerKnowledgeWriteRoutes(knowledgeWriteApp, knowledgeWriteModule);

    const identityUrl = await listen(identityApp);
    const knowledgeWriteUrl = await listen(knowledgeWriteApp);

    const internalClients = createInternalServiceClients({
      gateway: 'http://127.0.0.1:0',
      identityAccess: identityUrl,
      knowledgeRead: 'http://127.0.0.1:0',
      knowledgeWrite: knowledgeWriteUrl,
      candidateIngestion: 'http://127.0.0.1:0',
      review: 'http://127.0.0.1:0',
      governanceReview: 'http://127.0.0.1:0',
      jobRuntime: 'http://127.0.0.1:0',
    });

    const governanceApp = Fastify();
    registerGovernanceReviewRoutes(governanceApp, createGovernanceModule([], internalClients));
    const governanceUrl = await listen(governanceApp);

    const gatewayClients = createInternalServiceClients({
      gateway: 'http://127.0.0.1:0',
      identityAccess: identityUrl,
      knowledgeRead: 'http://127.0.0.1:0',
      knowledgeWrite: knowledgeWriteUrl,
      candidateIngestion: 'http://127.0.0.1:0',
      review: governanceUrl,
      governanceReview: governanceUrl,
      jobRuntime: 'http://127.0.0.1:0',
    });
    const gatewayApp = Fastify();
    registerGatewayRoutes(gatewayApp, gatewayClients);
    await gatewayApp.ready();

    const firstAttempt = await gatewayApp.inject({
      method: 'POST',
      url: '/v1/knowledge/review',
      headers: {
        authorization: 'Bearer session',
        'x-request-id': 'req-idempotent',
        'x-trace-id': 'trace-idempotent',
      },
      payload: { entryId: 'entry-1', actorId: 'user-1', decision: 'approve', note: 'ship it' },
    });
    const secondAttempt = await gatewayApp.inject({
      method: 'POST',
      url: '/v1/knowledge/review',
      headers: {
        authorization: 'Bearer session',
        'x-request-id': 'req-idempotent',
        'x-trace-id': 'trace-idempotent',
      },
      payload: { entryId: 'entry-1', actorId: 'user-1', decision: 'approve', note: 'ship it' },
    });

    expect(firstAttempt.statusCode).toBe(200);
    expect(secondAttempt.statusCode).toBe(200);

    expect(approveReviewDecision).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = (approveReviewDecision as ReturnType<typeof vi.fn>).mock.calls;
    expect(firstCall[0]).toEqual(secondCall[0]);
    expect(firstCall[0]).toEqual({
      entryId: 'entry-1',
      actorId: 'user-1',
      note: 'ship it',
    });

    await gatewayApp.close();
    await governanceApp.close();
    await knowledgeWriteApp.close();
    await identityApp.close();
  });
});
