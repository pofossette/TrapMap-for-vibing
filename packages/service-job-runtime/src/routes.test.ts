import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import { InvocationError, type JobRuntimePort } from '@trapmap/backend-core';
import { registerJobRuntimeRoutes } from './routes.js';

function createModule(overrides: Partial<JobRuntimePort> = {}): JobRuntimePort {
  return {
    schedule: vi.fn(async () => 'job-1'),
    getStatus: vi.fn(async (jobId) => ({ status: 'running', result: { jobId } })),
    getQueueStatus: vi.fn(async () => ({ pending: 1, running: 2, dead: 0 })),
    ...overrides,
  };
}

async function buildApp(module: JobRuntimePort) {
  const app = Fastify();
  registerJobRuntimeRoutes(app, module);
  await app.ready();
  return app;
}

describe('service-job-runtime routes', () => {
  it('preserves schedule payload and option passthrough', async () => {
    const module = createModule();
    const app = await buildApp(module);

    const response = await app.inject({
      method: 'POST',
      url: '/internal/jobs',
      payload: {
        type: 'knowledge.index-follow-up',
        payload: { entryId: 'entry-1' },
        delayMs: 250,
        priority: 5,
        maxAttempts: 4,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ jobId: 'job-1' });
    expect(module.schedule).toHaveBeenCalledWith(
      'knowledge.index-follow-up',
      { entryId: 'entry-1' },
      {
        delayMs: 250,
        priority: 5,
        maxAttempts: 4,
      },
    );

    await app.close();
  });

  it('preserves job status path param and queue status response shape', async () => {
    const module = createModule();
    const app = await buildApp(module);

    const status = await app.inject({
      method: 'GET',
      url: '/internal/jobs/job-42',
    });
    const queue = await app.inject({
      method: 'GET',
      url: '/internal/jobs/queue',
    });

    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual({ status: 'running', result: { jobId: 'job-42' } });
    expect(module.getStatus).toHaveBeenCalledWith('job-42');
    expect(queue.statusCode).toBe(200);
    expect(queue.json()).toEqual({ pending: 1, running: 2, dead: 0 });

    await app.close();
  });

  it('maps invocation errors onto the existing HTTP status contract', async () => {
    const app = await buildApp(
      createModule({
        schedule: vi.fn(async () => {
          throw InvocationError.validation('invalid job');
        }),
        getStatus: vi.fn(async () => {
          throw InvocationError.notFound('missing job');
        }),
        getQueueStatus: vi.fn(async () => {
          throw InvocationError.unavailable('queue unavailable');
        }),
      }),
    );

    const schedule = await app.inject({
      method: 'POST',
      url: '/internal/jobs',
      payload: { type: 'bad-job', payload: {} },
    });
    const status = await app.inject({
      method: 'GET',
      url: '/internal/jobs/missing',
    });
    const queue = await app.inject({
      method: 'GET',
      url: '/internal/jobs/queue',
    });

    expect(schedule.statusCode).toBe(400);
    expect(schedule.json()).toEqual({ error: 'invalid job', kind: 'validation' });
    expect(status.statusCode).toBe(404);
    expect(status.json()).toEqual({ error: 'missing job', kind: 'not-found' });
    expect(queue.statusCode).toBe(503);
    expect(queue.json()).toEqual({ error: 'queue unavailable', kind: 'unavailable' });

    await app.close();
  });
});
