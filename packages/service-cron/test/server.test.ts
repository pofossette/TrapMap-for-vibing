import { describe, expect, it, vi } from 'vitest';

import type { CronServiceDeps } from '../src/deps.js';
import { createCronOwnerBundle } from '../src/pg-ports.js';
import { createCronScheduler } from '../src/scheduler.js';
import { createCronServer } from '../src/server.js';

const emptyPool = {
  query: vi.fn(async () => ({ rows: [] })),
};

describe('cron server composition', () => {
  it('composes the owner bundle, scheduler and routes into one server', async () => {
    const bundle = createCronOwnerBundle(emptyPool);
    const scheduler = createCronScheduler({
      bundle,
      transport: { task: { enqueue: vi.fn(async () => 'task_1') } },
    });
    const deps: CronServiceDeps = {
      bundle,
      scheduler,
      transport: { task: { enqueue: vi.fn(async () => 'task_1') } },
    };

    const server = await createCronServer({ host: '127.0.0.1', port: 0, logLevel: 'silent' }, deps);

    const jobs = await server.app.inject({ method: 'GET', url: '/cron/jobs' });
    expect(jobs.statusCode).toBe(200);
    expect(jobs.json()).toEqual([]);

    const health = await server.app.inject({ method: 'GET', url: '/internal/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ service: 'cron' });

    await server.close();
  });
});
