import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { loadServiceConfig } from '../config/index.js';
import { registerRoutes } from './routes.js';

describe('distributed job-runtime ownership acceptance', () => {
  it('loads job-runtime as a dedicated remote-owned worker service', () => {
    const config = loadServiceConfig('job-runtime');

    expect(config.serviceName).toBe('job-runtime');
    expect(config.port).toBe(4006);
    expect(config.internalUrls.gateway).toBe('http://localhost:4000');
    expect(config.internalUrls.jobRuntime).toBe('http://localhost:4006');
  });

  it('keeps gateway and candidate-worker ownership separated by service config defaults', () => {
    const gateway = loadServiceConfig('gateway');
    const candidateWorker = loadServiceConfig('candidate-ingestion');

    expect(gateway.port).toBe(4000);
    expect(candidateWorker.port).toBe(4004);
    expect(gateway.internalUrls.jobRuntime).toBe(candidateWorker.internalUrls.jobRuntime);
    expect(gateway.internalUrls.candidateIngestion).toBe('http://localhost:4004');
  });

  it('serves schedule, status, and queue semantics from the dedicated job-runtime surface', async () => {
    const app = Fastify();
    registerRoutes(app, {
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
    registerRoutes(app, module);
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
});
