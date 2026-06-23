import Fastify from 'fastify';

import {
  InvocationError,
  type CandidateIngestionPort,
  type JobRuntimePort,
  type KnowledgeWritePort,
  type ReviewPort,
} from '@trapmap/backend-core';
import { registerRoutes as registerCandidateRoutes } from '../candidate-ingestion/routes.js';
import { createInternalServiceClients } from '../gateway/internal-client.js';
import { registerGatewayRoutes } from '../gateway/routes.js';
import { registerRoutes as registerGovernanceRoutes } from '../governance-review/routes.js';
import { registerRoutes as registerJobRuntimeRoutes } from '../job-runtime/routes.js';
import { registerRoutes as registerKnowledgeWriteRoutes } from '../knowledge-write/routes.js';

type ServiceRole =
  | 'gateway'
  | 'identity-access'
  | 'knowledge-write'
  | 'candidate-ingestion'
  | 'governance-review'
  | 'job-runtime';

interface DiagnosticsState {
  hits: string[];
  headers: Array<Record<string, string | undefined>>;
  queueSnapshots: Array<Record<string, number>>;
  outboxSnapshots: Array<Record<string, number>>;
  reclaimCount: number;
}

interface JobRecord {
  status: 'pending' | 'running' | 'completed' | 'failed' | 'dead';
  result?: unknown;
  stale?: boolean;
}

interface OutboxRecord {
  id: string;
  eventName: string;
  status: 'pending' | 'processing' | 'failed' | 'completed';
  attempts: number;
  maxAttempts: number;
  retryable: boolean;
  staleProcessing?: boolean;
  lastError: string | null;
}

function env(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function urls() {
  return {
    gateway: env('TRAPMAP_GATEWAY_URL'),
    identityAccess: env('TRAPMAP_IDENTITY_ACCESS_URL'),
    knowledgeRead: env('TRAPMAP_KNOWLEDGE_READ_URL'),
    knowledgeWrite: env('TRAPMAP_KNOWLEDGE_WRITE_URL'),
    candidateIngestion: env('TRAPMAP_CANDIDATE_INGESTION_URL'),
    review: env('TRAPMAP_GOVERNANCE_REVIEW_URL'),
    governanceReview: env('TRAPMAP_GOVERNANCE_REVIEW_URL'),
    jobRuntime: env('TRAPMAP_JOB_RUNTIME_URL'),
  };
}

function createDiagnosticsRoutes(app: ReturnType<typeof Fastify>, state: DiagnosticsState) {
  app.get('/__diagnostics', async () => state);
  app.post('/__diagnostics/reclaim-stale', async () => {
    state.reclaimCount += 1;
    return { ok: true, reclaimCount: state.reclaimCount };
  });
}

function createIdentityService(state: DiagnosticsState) {
  const app = Fastify();
  app.post('/internal/auth/validate', async (request, reply) => {
    state.hits.push('identity:validate');
    state.headers.push({
      authorization: request.headers.authorization as string | undefined,
      'x-request-id': request.headers['x-request-id'] as string | undefined,
      'x-trace-id': request.headers['x-trace-id'] as string | undefined,
    });
    return reply.send({
      sessionId: 'session-1',
      userId: 'user-1',
      handle: 'alice',
      activeTeamId: null,
      securityLevel: 1,
    });
  });
  app.get('/internal/health', async () => ({ status: 'ok', service: 'identity-access' }));
  createDiagnosticsRoutes(app, state);
  return app;
}

function createKnowledgeWriteModule(state: DiagnosticsState): KnowledgeWritePort {
  return {
    submit: async () => ({ entryId: 'entry-1' }),
    updateEntry: async () => undefined,
    resubmit: async () => undefined,
    supersede: async () => undefined,
    createTrap: async () => ({ trapId: 'trap-1' }),
    approveReviewDecision: async (input) => {
      state.hits.push(`knowledge-write:approve:${input.entryId}`);
      return { entryId: input.entryId, lifecycleState: 'approved' };
    },
    rejectReviewDecision: async (input) => {
      state.hits.push(`knowledge-write:reject:${input.entryId}`);
      return { entryId: input.entryId, lifecycleState: 'rejected' };
    },
    applyMaintenanceDecision: async (input) => {
      state.hits.push(`knowledge-write:maintenance:${input.entryId}`);
      return { entryId: input.entryId, action: input.action };
    },
    applyDecayDecision: async (input) => {
      state.hits.push(`knowledge-write:decay:${input.entryId}`);
      return { entryId: input.entryId, action: input.action };
    },
    publishCandidateResult: async (input) => {
      state.hits.push(`knowledge-write:candidate:${input.candidateId}`);
      return { candidateId: input.candidateId, entryId: 'entry-1' };
    },
    listTraps: async () => [],
    getTrap: async () => null,
  };
}

function createKnowledgeWriteService(state: DiagnosticsState) {
  const app = Fastify();
  app.addHook('onRequest', async (request) => {
    if (
      request.url.startsWith('/internal/knowledge') ||
      request.url.startsWith('/internal/candidates/publish')
    ) {
      state.headers.push({
        'x-request-id': request.headers['x-request-id'] as string | undefined,
        'x-trace-id': request.headers['x-trace-id'] as string | undefined,
      });
    }
  });
  registerKnowledgeWriteRoutes(app, createKnowledgeWriteModule(state));
  createDiagnosticsRoutes(app, state);
  return app;
}

function createCandidateModule(
  state: DiagnosticsState,
  clients: ReturnType<typeof createInternalServiceClients>,
): CandidateIngestionPort {
  return {
    submit: async () => ({ candidateId: 'candidate-1' }),
    getById: async () => null,
    listByStatus: async () => [],
    applyResolution: async (candidateId, resolution, actorId) => {
      state.hits.push(`candidate:resolution:${candidateId}`);
      await clients.knowledgeWrite.publishCandidateResult(
        { candidateId, actorId, result: resolution },
        { headers: { 'x-request-id': 'req-closeout', 'x-trace-id': 'trace-closeout' } },
      );
    },
    submitManualResult: async (candidateId, result, actorId) => {
      state.hits.push(`candidate:manual:${candidateId}`);
      await clients.knowledgeWrite.publishCandidateResult(
        { candidateId, actorId, result },
        { headers: { 'x-request-id': 'req-closeout', 'x-trace-id': 'trace-closeout' } },
      );
    },
    publishCandidateResult: async (candidateId) => ({ candidateId, entryId: 'entry-1' }),
  };
}

function createCandidateService(state: DiagnosticsState) {
  const app = Fastify();
  const clients = createInternalServiceClients(urls());
  registerCandidateRoutes(app, createCandidateModule(state, clients));
  createDiagnosticsRoutes(app, state);
  return app;
}

function errorForEntry(entryId: string): InvocationError | null {
  if (entryId === 'missing-entry') return InvocationError.notFound('missing-entry');
  if (entryId === 'conflict-entry') return InvocationError.conflict('already-reviewed');
  if (entryId === 'forbidden-entry') return InvocationError.forbidden('denied');
  if (entryId === 'unavailable-entry') return InvocationError.unavailable('review-unavailable');
  if (entryId === 'timeout-entry') return InvocationError.timeout('review-timeout');
  return null;
}

function createGovernanceModule(
  state: DiagnosticsState,
  clients: ReturnType<typeof createInternalServiceClients>,
): ReviewPort {
  return {
    approve: async (input) => {
      state.hits.push(`review:approve:${input.entryId}`);
      const error = errorForEntry(input.entryId);
      if (error) {
        throw error;
      }
      const response = await clients.knowledgeWrite.approveReviewDecision(input, {
        headers: { 'x-request-id': 'req-closeout', 'x-trace-id': 'trace-closeout' },
      });
      return response.body as { entryId: string; lifecycleState: 'approved' };
    },
    reject: async (input) => {
      state.hits.push(`review:reject:${input.entryId}`);
      const response = await clients.knowledgeWrite.rejectReviewDecision(input, {
        headers: { 'x-request-id': 'req-closeout', 'x-trace-id': 'trace-closeout' },
      });
      return response.body as { entryId: string; lifecycleState: 'rejected' };
    },
    applyMaintenance: async (input) => {
      state.hits.push(`review:maintenance:${input.entryId}`);
      const response = await clients.knowledgeWrite.applyMaintenanceDecision(input, {
        headers: { 'x-request-id': 'req-closeout', 'x-trace-id': 'trace-closeout' },
      });
      return response.body as { entryId: string; action: string };
    },
    applyDecay: async (input) => {
      state.hits.push(`review:decay:${input.entryId}`);
      const response = await clients.knowledgeWrite.applyDecayDecision(input, {
        headers: { 'x-request-id': 'req-closeout', 'x-trace-id': 'trace-closeout' },
      });
      return response.body as { entryId: string; action: string };
    },
    reviewArtifact: async () => undefined,
    submitFeedback: async () => ({ feedbackId: 'feedback-1' }),
  };
}

function createGovernanceService(state: DiagnosticsState) {
  const app = Fastify();
  const clients = createInternalServiceClients(urls());
  registerGovernanceRoutes(app, createGovernanceModule(state, clients));
  createDiagnosticsRoutes(app, state);
  return app;
}

function createJobRuntimeService(state: DiagnosticsState) {
  const app = Fastify();
  const jobs = new Map<string, JobRecord>();
  const outbox = new Map<string, OutboxRecord>();
  let nextId = 1;
  let nextEventId = 1;

  async function getOutboxSnapshot() {
    let pending = 0;
    let processing = 0;
    let failed = 0;
    let staleProcessing = 0;
    for (const event of outbox.values()) {
      if (event.status === 'pending') pending += 1;
      if (event.status === 'processing') processing += 1;
      if (event.status === 'failed') failed += 1;
      if (event.status === 'processing' && event.staleProcessing) staleProcessing += 1;
    }
    const snapshot = {
      pending,
      processing,
      failed,
      staleProcessing,
    };
    state.hits.push(
      `outbox:status:${snapshot.pending}:${snapshot.processing}:${snapshot.failed}:${snapshot.staleProcessing}`,
    );
    return snapshot;
  }

  function addOutboxRecord(input: Omit<OutboxRecord, 'id'>) {
    const record: OutboxRecord = {
      id: `evt-${nextEventId++}`,
      ...input,
    };
    outbox.set(record.id, record);
    return record;
  }

  const module: JobRuntimePort = {
    async schedule(type) {
      const jobId = `job-${nextId++}`;
      if (type === 'stale-reclaim-demo') {
        jobs.set(jobId, {
          status: 'running',
          result: { owner: 'job-runtime', stale: true },
          stale: true,
        });
      } else {
        jobs.set(jobId, { status: 'running', result: { owner: 'job-runtime', type } });
      }
      state.hits.push(`job:schedule:${type}`);
      const snapshot = await module.getQueueStatus();
      state.queueSnapshots.push(snapshot);
      return jobId;
    },
    async getStatus(jobId) {
      state.hits.push(`job:status:${jobId}`);
      return jobs.get(jobId) ?? { status: 'failed', error: 'unknown-job' };
    },
    async getQueueStatus() {
      let pending = 0;
      let running = 0;
      let dead = 0;
      for (const job of jobs.values()) {
        if (job.status === 'pending') pending += 1;
        if (job.status === 'running') running += 1;
        if (job.status === 'dead') dead += 1;
      }
      const snapshot = { pending, running, dead };
      state.hits.push(`job:queue:${pending}:${running}:${dead}`);
      return snapshot;
    },
  };

  registerJobRuntimeRoutes(app, module);
  app.post('/__diagnostics/reclaim-stale', async () => {
    for (const job of jobs.values()) {
      if (job.stale && job.status === 'running') {
        job.status = 'pending';
        job.result = { owner: 'job-runtime', reclaimed: true };
      }
    }
    state.reclaimCount += 1;
    const snapshot = await module.getQueueStatus();
    state.queueSnapshots.push(snapshot);
    return { ok: true, reclaimCount: state.reclaimCount, snapshot };
  });
  app.post('/__diagnostics/outbox/run-retryable-failure', async () => {
    const event = addOutboxRecord({
      eventName: 'knowledge.index-follow-up',
      status: 'pending',
      attempts: 0,
      maxAttempts: 3,
      retryable: true,
      lastError: null,
    });
    state.outboxSnapshots.push(await getOutboxSnapshot());
    event.status = 'processing';
    state.outboxSnapshots.push(await getOutboxSnapshot());
    event.status = 'pending';
    event.attempts = 1;
    event.lastError = 'retryable transport failure';
    state.outboxSnapshots.push(await getOutboxSnapshot());
    return { ok: true, eventId: event.id, snapshot: await getOutboxSnapshot() };
  });
  app.post('/__diagnostics/outbox/run-dead-letter', async () => {
    const event = addOutboxRecord({
      eventName: 'knowledge.index-follow-up',
      status: 'pending',
      attempts: 2,
      maxAttempts: 3,
      retryable: false,
      lastError: null,
    });
    state.outboxSnapshots.push(await getOutboxSnapshot());
    event.status = 'processing';
    state.outboxSnapshots.push(await getOutboxSnapshot());
    event.status = 'failed';
    event.attempts = 3;
    event.lastError = 'permanent projection failure';
    state.outboxSnapshots.push(await getOutboxSnapshot());
    return { ok: true, eventId: event.id, snapshot: await getOutboxSnapshot() };
  });
  app.post('/__diagnostics/outbox/reclaim-stale-processing', async () => {
    const event = addOutboxRecord({
      eventName: 'knowledge.index-follow-up',
      status: 'processing',
      attempts: 1,
      maxAttempts: 3,
      retryable: true,
      staleProcessing: true,
      lastError: 'worker heartbeat expired',
    });
    state.outboxSnapshots.push(await getOutboxSnapshot());
    event.status = 'pending';
    event.staleProcessing = false;
    state.reclaimCount += 1;
    state.outboxSnapshots.push(await getOutboxSnapshot());
    return {
      ok: true,
      eventId: event.id,
      reclaimCount: state.reclaimCount,
      snapshot: await getOutboxSnapshot(),
    };
  });
  app.get('/__diagnostics', async () => state);
  return app;
}

function createGatewayService(_state: DiagnosticsState) {
  const app = Fastify();
  registerGatewayRoutes(app, createInternalServiceClients(urls()));
  return app;
}

async function main() {
  const role = env('TRAPMAP_TEST_SERVICE_ROLE') as ServiceRole;
  const port = Number.parseInt(env('TRAPMAP_SERVICE_PORT'), 10);
  const state: DiagnosticsState = {
    hits: [],
    headers: [],
    queueSnapshots: [],
    outboxSnapshots: [],
    reclaimCount: 0,
  };

  const app =
    role === 'identity-access'
      ? createIdentityService(state)
      : role === 'knowledge-write'
        ? createKnowledgeWriteService(state)
        : role === 'candidate-ingestion'
          ? createCandidateService(state)
          : role === 'governance-review'
            ? createGovernanceService(state)
            : role === 'job-runtime'
              ? createJobRuntimeService(state)
              : createGatewayService(state);

  await app.listen({ port, host: '127.0.0.1' });

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
