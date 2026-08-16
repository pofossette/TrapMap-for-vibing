import { describe, expect, it, vi } from 'vitest';

import type { CronServiceDeps, CronServiceModule, CronScheduler } from '@trapmap/service-cron';
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
  it('registers the cron service module through the Nest adapter and exposes the scheduler token', () => {
    const scheduler = createScheduler();
    const module = createServiceModule(scheduler);

    const dynamicModule = CronModule.forTesting(module);

    expect(dynamicModule.controllers).toHaveLength(1);
    const providers = dynamicModule.providers as Array<{ provide: unknown; useValue?: unknown }>;
    expect(providers).toContainEqual(expect.objectContaining({ provide: CRON_PORT }));
    expect(providers).toContainEqual(
      expect.objectContaining({ provide: CRON_SCHEDULER, useValue: scheduler }),
    );
    expect(dynamicModule.exports).toContain(CRON_PORT);
    expect(dynamicModule.exports).toContain(CRON_SCHEDULER);
  });

  it('builds the deps from the host runtime when wiring for the monolith', () => {
    const scheduler = createScheduler();
    const bundle = { list: vi.fn() };
    const runtime = {
      services: {
        asyncTransport: { task: { enqueue: vi.fn() }, events: {} },
        cronOwnerBundle: bundle,
        cronScheduler: scheduler,
      },
    } as HostLocalRuntime;

    const dynamicModule = CronModule.forRuntime(runtime);

    const providers = dynamicModule.providers as Array<{ provide: unknown; useValue?: unknown }>;
    const port = providers.find((provider) => provider.provide === CRON_PORT)
      ?.useValue as CronServiceModule;
    expect(port).toBeDefined();
    expect(port.scheduler).toBe(scheduler);
  });

  it('rejects a monolith runtime without the async task transport', () => {
    const runtime = {
      services: {
        asyncTransport: undefined,
        cronOwnerBundle: {},
        cronScheduler: createScheduler(),
      },
    } as HostLocalRuntime;

    expect(() => CronModule.forRuntime(runtime)).toThrow(/async task transport/);
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
