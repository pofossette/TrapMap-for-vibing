import { describe, expect, it, vi } from 'vitest';

import type { CronScheduler, CronServiceDeps, CronServiceModule } from '@trapmap/service-cron';
import type { HostLocalRuntime } from '../runtime/host-runtime.js';
import { CronSchedulerProvider } from './cron-scheduler.provider.js';
import { CronModule } from './cron.module.js';
import { CRON_PORT, CRON_SCHEDULER } from './cron.tokens.js';

function createScheduler(): CronScheduler {
  let running = false;
  return {
    run: vi.fn(async () => {
      running = true;
    }),
    stop: vi.fn(async () => {
      running = false;
    }),
    isRunning: vi.fn(() => running),
    ownsWork: vi.fn(() => true),
  };
}

function createServiceModule(scheduler: CronScheduler): CronServiceModule {
  return {
    create: vi.fn(),
    list: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    delete: vi.fn(),
    trigger: vi.fn(),
    statusSnapshots: vi.fn(),
    scheduler,
  };
}

describe('host-local cron module', () => {
  it('registers the cron port and scheduler tokens without mounting business routes', () => {
    const scheduler = createScheduler();
    const module = createServiceModule(scheduler);

    const dynamicModule = CronModule.forTesting(module);

    expect(dynamicModule.controllers).toEqual([]);
    const providers = dynamicModule.providers as Array<{ provide: unknown; useValue?: unknown }>;
    expect(providers).toContainEqual(expect.objectContaining({ provide: CRON_PORT }));
    expect(providers).toContainEqual(
      expect.objectContaining({ provide: CRON_SCHEDULER, useValue: scheduler }),
    );
    expect(dynamicModule.exports).toContain(CRON_PORT);
    expect(dynamicModule.exports).toContain(CRON_SCHEDULER);
  });

  it('derives the cron deps from the host runtime', () => {
    const scheduler = createScheduler();
    const bundle = { list: vi.fn() };
    const enqueue = vi.fn(async () => undefined);
    const runtime = {
      services: {
        asyncTransport: { task: { enqueue }, events: {} },
        cronOwnerBundle: bundle,
        cronScheduler: scheduler,
      },
    } as HostLocalRuntime;

    const deps = CronModule.cronDepsForRuntime(runtime);

    expect(deps.bundle).toBe(bundle);
    expect(deps.scheduler).toBe(scheduler);
    expect(deps.transport.task.enqueue).toBe(enqueue);
  });

  it('rejects a monolith runtime without the async task transport', () => {
    const runtime = {
      services: {
        asyncTransport: undefined,
        cronOwnerBundle: {},
        cronScheduler: createScheduler(),
      },
    } as HostLocalRuntime;

    expect(() => CronModule.cronDepsForRuntime(runtime)).toThrow(/async task transport/);
  });
});

describe('host-local cron scheduler provider', () => {
  it('starts the scheduler on module init and stops it on destroy', async () => {
    const scheduler = createScheduler();
    const provider = new CronSchedulerProvider(scheduler);

    await provider.onModuleInit();
    expect(scheduler.run).toHaveBeenCalledTimes(1);

    await provider.onModuleDestroy();
    expect(scheduler.stop).toHaveBeenCalledTimes(1);
  });

  it('skips start when the scheduler is already running', async () => {
    const scheduler = createScheduler();
    vi.mocked(scheduler.isRunning).mockReturnValue(true);
    const provider = new CronSchedulerProvider(scheduler);

    await provider.onModuleInit();
    expect(scheduler.run).not.toHaveBeenCalled();
  });
});

describe('host-local cron module deps factory', () => {
  it('composes the service module from injected deps', () => {
    const scheduler = createScheduler();
    const enqueue = vi.fn(async () => undefined);
    const dynamicModule = CronModule.forDeps({
      bundle: {},
      transport: { task: { enqueue } },
      scheduler,
    } as CronServiceDeps);

    const providers = dynamicModule.providers as Array<{ provide: unknown; useValue?: unknown }>;
    const port = providers.find((provider) => provider.provide === CRON_PORT)
      ?.useValue as CronServiceModule;
    expect(port.scheduler).toBe(scheduler);
  });
});
