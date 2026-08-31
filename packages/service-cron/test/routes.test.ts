import { InvocationError, type RouteTestApp, buildRouteTestApp } from '@trapmap/backend-core';
import type { AdapterName } from '@trapmap/backend-core/testing/route-test-app.js';
import type { CronJob, CronJobStatusSnapshot } from '@trapmap/contracts';
import { describe, expect, it, vi } from 'vitest';

import { type CronRouteDeps, createCronRouteDefs } from '../src/routes.ts';

const ADAPTERS: readonly AdapterName[] = ['fastify', 'nest'];

const jobFixture: CronJob = {
  id: 'cron_1234567890abcdef',
  name: 'nightly purge',
  schedule: '0 3 * * *',
  timezone: 'UTC',
  taskType: 'purge-expired',
  payload: { days: 30 },
  enabled: true,
  nextRunAt: '2026-08-17T03:00:00.000Z',
  lastRunAt: null,
  lastStatus: null,
  lastError: null,
  runCount: 0,
  createdAt: '2026-08-16T00:00:00.000Z',
  updatedAt: '2026-08-16T00:00:00.000Z',
};

const snapshotFixture: CronJobStatusSnapshot = {
  id: 'cron_1234567890abcdef',
  enabled: true,
  nextRunAt: '2026-08-17T03:00:00.000Z',
  lastRunAt: null,
  lastStatus: null,
  lastError: null,
  runCount: 0,
};

function createModule(overrides: Partial<CronRouteDeps> = {}): CronRouteDeps {
  return {
    create: vi.fn(async () => jobFixture),
    list: vi.fn(async () => [jobFixture]),
    getById: vi.fn(async () => jobFixture),
    update: vi.fn(async () => jobFixture),
    pause: vi.fn(async () => jobFixture),
    resume: vi.fn(async () => jobFixture),
    delete: vi.fn(async () => true),
    trigger: vi.fn(async () => jobFixture),
    statusSnapshots: vi.fn(async () => [snapshotFixture]),
    scheduler: {
      isRunning: () => true,
      ownsWork: () => true,
    },
    ...overrides,
  };
}

async function buildApp(module: CronRouteDeps, adapter: AdapterName): Promise<RouteTestApp> {
  return buildRouteTestApp(createCronRouteDefs(module), module, adapter);
}

describe.each(ADAPTERS)('service-cron routes (%s adapter)', (adapter) => {
  it('lists cron jobs', async () => {
    const module = createModule();
    const app = await buildApp(module, adapter);

    const response = await app.inject({ method: 'GET', url: '/cron/jobs' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([jobFixture]);
    expect(module.list).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('creates a cron job with the trusted actor and contract defaults applied', async () => {
    const module = createModule();
    const app = await buildApp(module, adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/cron/jobs',
      headers: { 'x-trapmap-actor-id': 'admin-1' },
      payload: { name: 'purge', schedule: '0 3 * * *', taskType: 'purge-expired' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(jobFixture);
    expect(module.create).toHaveBeenCalledWith({
      name: 'purge',
      schedule: '0 3 * * *',
      timezone: 'UTC',
      taskType: 'purge-expired',
      payload: {},
      enabled: true,
    });

    await app.close();
  });

  it('rejects an unauthenticated cron job mutation before invoking the module', async () => {
    const module = createModule();
    const app = await buildApp(module, adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/cron/jobs',
      payload: { name: 'purge', schedule: '0 3 * * *', taskType: 'purge-expired' },
    });

    expect(response.statusCode).toBe(401);
    expect(module.create).not.toHaveBeenCalled();

    await app.close();
  });

  it('fetches a single cron job and 404s on an unknown id', async () => {
    const module = createModule();
    const app = await buildApp(module, adapter);

    const found = await app.inject({ method: 'GET', url: '/cron/jobs/cron_1234567890abcdef' });
    expect(found.statusCode).toBe(200);
    expect(found.json()).toEqual(jobFixture);
    expect(module.getById).toHaveBeenCalledWith('cron_1234567890abcdef');

    const missingModule = createModule({ getById: vi.fn(async () => null) });
    const missingApp = await buildApp(missingModule, adapter);
    const missing = await missingApp.inject({ method: 'GET', url: '/cron/jobs/cron_none00000000' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ kind: 'not-found' });

    await app.close();
    await missingApp.close();
  });

  it('updates a cron job and enforces the schedule/timezone super-refine contract', async () => {
    const module = createModule();
    const app = await buildApp(module, adapter);

    const ok = await app.inject({
      method: 'PATCH',
      url: '/cron/jobs/cron_1234567890abcdef',
      headers: { 'x-trapmap-actor-id': 'admin-1' },
      payload: { schedule: '0 4 * * *', timezone: 'UTC' },
    });
    expect(ok.statusCode).toBe(200);
    expect(module.update).toHaveBeenCalledWith('cron_1234567890abcdef', {
      schedule: '0 4 * * *',
      timezone: 'UTC',
    });

    const bad = await app.inject({
      method: 'PATCH',
      url: '/cron/jobs/cron_1234567890abcdef',
      headers: { 'x-trapmap-actor-id': 'admin-1' },
      payload: { schedule: '0 4 * * *' },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ kind: 'validation' });
    expect(module.update).toHaveBeenCalledTimes(1);

    const missingModule = createModule({ update: vi.fn(async () => null) });
    const missingApp = await buildApp(missingModule, adapter);
    const missing = await missingApp.inject({
      method: 'PATCH',
      url: '/cron/jobs/cron_none00000000',
      headers: { 'x-trapmap-actor-id': 'admin-1' },
      payload: { name: 'renamed' },
    });
    expect(missing.statusCode).toBe(404);

    await app.close();
    await missingApp.close();
  });

  it('deletes a cron job and 404s when it does not exist', async () => {
    const module = createModule();
    const app = await buildApp(module, adapter);

    const ok = await app.inject({
      method: 'DELETE',
      url: '/cron/jobs/cron_1234567890abcdef',
      headers: { 'x-trapmap-actor-id': 'admin-1' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ ok: true });

    const missingModule = createModule({ delete: vi.fn(async () => false) });
    const missingApp = await buildApp(missingModule, adapter);
    const missing = await missingApp.inject({
      method: 'DELETE',
      url: '/cron/jobs/cron_none00000000',
      headers: { 'x-trapmap-actor-id': 'admin-1' },
    });
    expect(missing.statusCode).toBe(404);

    await app.close();
    await missingApp.close();
  });

  it('triggers an immediate manual run through the module', async () => {
    const trigger = vi.fn(async () => ({
      ...jobFixture,
      lastRunAt: '2026-08-16T09:00:00.000Z',
      lastStatus: 'succeeded' as const,
    }));
    const app = await buildApp(createModule({ trigger }), adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/cron/jobs/cron_1234567890abcdef/trigger',
      headers: { 'x-trapmap-actor-id': 'admin-1' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ lastStatus: 'succeeded' });
    expect(trigger).toHaveBeenCalledWith('cron_1234567890abcdef');

    await app.close();
  });

  it('rejects a trigger for an unknown job with the invocation wire', async () => {
    const trigger = vi.fn(async () => {
      throw InvocationError.notFound('Cron job not found');
    });
    const app = await buildApp(createModule({ trigger }), adapter);

    const response = await app.inject({
      method: 'POST',
      url: '/cron/jobs/cron_none00000000/trigger',
      headers: { 'x-trapmap-actor-id': 'admin-1' },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: 'Cron job not found', kind: 'not-found' });

    await app.close();
  });

  it('reports status snapshots for the registry', async () => {
    const module = createModule();
    const app = await buildApp(module, adapter);

    const response = await app.inject({ method: 'GET', url: '/cron/status' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([snapshotFixture]);
    expect(module.statusSnapshots).toHaveBeenCalledTimes(1);

    await app.close();
  });

  it('exposes health, readiness, ownership and operator status', async () => {
    const module = createModule();
    const app = await buildApp(module, adapter);

    const health = await app.inject({ method: 'GET', url: '/internal/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ service: 'cron', owner: 'cron-scheduler' });

    const readiness = await app.inject({ method: 'GET', url: '/internal/readiness' });
    expect(readiness.statusCode).toBe(200);
    expect(readiness.json()).toMatchObject({ ready: true, service: 'cron' });

    const ownership = await app.inject({ method: 'GET', url: '/internal/ownership' });
    expect(ownership.statusCode).toBe(200);
    expect(ownership.json()).toMatchObject({ service: 'cron', delegateTo: 'job-runtime' });

    const operator = await app.inject({ method: 'GET', url: '/internal/operator-status' });
    expect(operator.statusCode).toBe(200);
    expect(operator.json()).toMatchObject({
      service: 'cron',
      scheduler: { running: true, ownsWork: true },
    });

    await app.close();
  });

  it('reports readiness degraded when the transport dependency is unreachable', async () => {
    const module = createModule({
      checkDependency: vi.fn(async () => ({ reachable: false, detail: 'transport down' })),
    });
    const app = await buildApp(module, adapter);

    const ready = await app.inject({ method: 'GET', url: '/internal/ready' });
    expect(ready.statusCode).toBe(503);
    expect(ready.json()).toMatchObject({ ready: false, service: 'cron' });

    const live = await app.inject({ method: 'GET', url: '/internal/live' });
    expect(live.statusCode).toBe(200);

    await app.close();
  });
});
