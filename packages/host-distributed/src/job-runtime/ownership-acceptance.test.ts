import { registerJobRuntimeRoutes } from '@trapmap/service-job-runtime';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { loadServiceConfig } from '../config/index.js';

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('distributed job-runtime ownership acceptance', () => {
  it('loads distributed job-runtime with docker-dns internal defaults', () => {
    process.env.TRAPMAP_DEPLOYMENT_PROFILE = 'distributed';

    const config = loadServiceConfig('job-runtime');

    expect(config.serviceName).toBe('job-runtime');
    expect(config.port).toBe(4006);
    expect(config.internalUrls.gateway).toBe('http://gateway:4000');
    expect(config.internalUrls.identityAccess).toBe('http://identity-access:4001');
    expect(config.internalUrls.knowledgeRead).toBe('http://knowledge-read:4002');
    expect(config.internalUrls.knowledgeWrite).toBe('http://knowledge-write:4003');
    expect(config.internalUrls.candidateIngestion).toBe('http://candidate-worker:4004');
    expect(config.internalUrls.governanceReview).toBe('http://governance-worker:4005');
    expect(config.internalUrls.review).toBe('http://governance-worker:4005');
    expect(config.internalUrls.jobRuntime).toBe('http://outbox-worker:4006');
  });

  it('keeps localhost defaults outside distributed profile', () => {
    delete process.env.TRAPMAP_DEPLOYMENT_PROFILE;

    const config = loadServiceConfig('job-runtime');

    expect(config.internalUrls.gateway).toBe('http://localhost:4000');
    expect(config.internalUrls.jobRuntime).toBe('http://localhost:4006');
  });

  it('keeps gateway and candidate-worker ownership separated by service config defaults', () => {
    process.env.TRAPMAP_DEPLOYMENT_PROFILE = 'distributed';

    const gateway = loadServiceConfig('gateway');
    const candidateWorker = loadServiceConfig('candidate-ingestion');

    expect(gateway.port).toBe(4000);
    expect(candidateWorker.port).toBe(4004);
    expect(gateway.internalUrls.jobRuntime).toBe(candidateWorker.internalUrls.jobRuntime);
    expect(gateway.internalUrls.candidateIngestion).toBe('http://candidate-worker:4004');
  });

  it('lets explicit internal urls override distributed defaults', () => {
    process.env.TRAPMAP_DEPLOYMENT_PROFILE = 'distributed';
    process.env.TRAPMAP_KNOWLEDGE_WRITE_URL = 'http://custom-knowledge-write:4403';
    process.env.TRAPMAP_JOB_RUNTIME_URL = 'http://custom-job-runtime:4406';

    const config = loadServiceConfig('gateway');

    expect(config.internalUrls.knowledgeWrite).toBe('http://custom-knowledge-write:4403');
    expect(config.internalUrls.jobRuntime).toBe('http://custom-job-runtime:4406');
  });

  it('defaults knowledge-write internal transport to http and allows rpc override', () => {
    process.env.TRAPMAP_DEPLOYMENT_PROFILE = 'distributed';

    const defaultConfig = loadServiceConfig('governance-review');
    expect(defaultConfig.internalTransports.knowledgeWrite).toBe('http');

    process.env.TRAPMAP_KNOWLEDGE_WRITE_TRANSPORT = 'rpc';
    const rpcConfig = loadServiceConfig('governance-review');
    expect(rpcConfig.internalTransports.knowledgeWrite).toBe('rpc');
  });

  it('accepts service-specific pool budget env overrides for distributed operators', () => {
    process.env.TRAPMAP_DEPLOYMENT_PROFILE = 'distributed';
    process.env.TRAPMAP_SERVICE_POOL_SIZE = '11';
    process.env.TRAPMAP_JOB_RUNTIME_POOL_SIZE = '17';

    const gatewayConfig = loadServiceConfig('gateway');
    const jobRuntimeConfig = loadServiceConfig('job-runtime');

    expect(gatewayConfig.poolSize).toBe(11);
    expect(jobRuntimeConfig.poolSize).toBe(17);
  });

  it('serves schedule, status, and queue semantics from the dedicated job-runtime surface', async () => {
    const app = Fastify();
    registerJobRuntimeRoutes(app, {
      async schedule(type) {
        return `job-for-${type}`;
      },
      async getStatus(jobId) {
        return { status: 'running', result: { owner: 'job-runtime', jobId } };
      },
      async getQueueStatus() {
        return { pending: 1, running: 1, dead: 0 };
      },
    });
    await app.ready();

    const schedule = await app.inject({
      method: 'POST',
      url: '/internal/jobs',
      payload: { type: 'knowledge.index-follow-up', payload: { entryId: 'entry-1' } },
    });
    const status = await app.inject({
      method: 'GET',
      url: '/internal/jobs/job-for-knowledge.index-follow-up',
    });
    const queue = await app.inject({
      method: 'GET',
      url: '/internal/jobs/queue',
    });

    expect(schedule.statusCode).toBe(201);
    expect(schedule.json()).toEqual({ jobId: 'job-for-knowledge.index-follow-up' });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual({
      status: 'running',
      result: { owner: 'job-runtime', jobId: 'job-for-knowledge.index-follow-up' },
    });
    expect(queue.statusCode).toBe(200);
    expect(queue.json()).toEqual({ pending: 1, running: 1, dead: 0 });

    await app.close();
  });

  it('provides focused stale-running reclaim evidence for distributed recovery semantics', async () => {
    const jobs = new Map<
      string,
      {
        status: 'pending' | 'running' | 'completed' | 'failed' | 'dead';
        stale?: boolean;
      }
    >();

    const module = {
      async schedule(type: string) {
        const jobId = type === 'stale-reclaim-demo' ? 'job-stale' : 'job-live';
        jobs.set(jobId, {
          status: 'running',
          ...(type === 'stale-reclaim-demo' ? { stale: true } : {}),
        });
        return jobId;
      },
      async getStatus(jobId: string) {
        const job = jobs.get(jobId);
        return {
          status: job?.status ?? 'failed',
          ...(job?.stale ? { result: { stale: true } } : { result: { stale: false } }),
        };
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
        return { pending, running, dead };
      },
    };

    const app = Fastify();
    registerJobRuntimeRoutes(app, module);
    app.post('/__test/reclaim', async () => {
      for (const job of jobs.values()) {
        if (job.stale && job.status === 'running') {
          job.status = 'pending';
        }
      }
      return module.getQueueStatus();
    });
    await app.ready();

    await app.inject({
      method: 'POST',
      url: '/internal/jobs',
      payload: { type: 'knowledge.index-follow-up', payload: { entryId: 'entry-1' } },
    });
    await app.inject({
      method: 'POST',
      url: '/internal/jobs',
      payload: { type: 'stale-reclaim-demo', payload: { entryId: 'entry-stale' } },
    });
    const before = await app.inject({
      method: 'GET',
      url: '/internal/jobs/queue',
    });
    const reclaim = await app.inject({
      method: 'POST',
      url: '/__test/reclaim',
    });
    const after = await app.inject({
      method: 'GET',
      url: '/internal/jobs/queue',
    });

    expect(before.json()).toEqual({ pending: 0, running: 2, dead: 0 });
    expect(reclaim.json()).toEqual({ pending: 1, running: 1, dead: 0 });
    expect(after.json()).toEqual({ pending: 1, running: 1, dead: 0 });

    await app.close();
  });

  it('makes retryable, dead-letter, and stale-processing recovery operator-visible on the existing runtime surface', async () => {
    const operatorSnapshot = {
      queue: {
        pending: 1,
        running: 1,
        dead: 1,
        staleRunning: 1,
        reclaimCount: 2,
        recentDeadLetters: [
          {
            id: 'task-dead-1',
            type: 'knowledge.index-follow-up',
            status: 'dead',
            attemptCount: 3,
            maxAttempts: 3,
            dedupeKey: 'entry-1',
            runAfter: '2026-06-23T00:00:00.000Z',
            startedAt: '2026-06-23T00:00:05.000Z',
            completedAt: null,
            lastError: 'permanent projection failure',
            ageSeconds: 45,
            createdAt: '2026-06-23T00:00:00.000Z',
            updatedAt: '2026-06-23T00:00:45.000Z',
          },
        ],
      },
      outbox: {
        pending: 1,
        processing: 0,
        failed: 1,
        staleProcessing: 1,
        reclaimCount: 3,
        recentFailures: [
          {
            id: 'evt-failed-1',
            aggregateType: 'knowledge-entry',
            aggregateId: 'entry-1',
            eventName: 'knowledge.index-follow-up',
            status: 'failed',
            attempts: 3,
            workerId: null,
            startedAt: '2026-06-23T00:00:07.000Z',
            heartbeatAt: null,
            leaseUntil: null,
            createdAt: '2026-06-23T00:00:00.000Z',
            availableAt: '2026-06-23T00:00:00.000Z',
            publishedAt: null,
            lastError: 'permanent projection failure',
            ageSeconds: 45,
          },
        ],
      },
    };

    const app = Fastify();
    app.get('/__test/operator-status', async () => operatorSnapshot);
    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/__test/operator-status',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      queue: expect.objectContaining({
        staleRunning: 1,
        reclaimCount: 2,
        recentDeadLetters: [
          expect.objectContaining({
            status: 'dead',
            attemptCount: 3,
            lastError: 'permanent projection failure',
          }),
        ],
      }),
      outbox: expect.objectContaining({
        pending: 1,
        failed: 1,
        staleProcessing: 1,
        reclaimCount: 3,
        recentFailures: [
          expect.objectContaining({
            status: 'failed',
            attempts: 3,
            lastError: 'permanent projection failure',
          }),
        ],
      }),
    });

    await app.close();
  });
});
