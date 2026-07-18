import { describe, expect, it } from 'vitest';

import { buildPostgresTestServer as buildServer } from '../../../../scripts/testing/server-test-composition.js';
import { getArtifactAdapters } from '@trapmap/server/lib/indexing/artifact-pipeline.js';
import { bootstrapLifecycle } from './bootstrap-lifecycle.js';

const DATABASE_URL = process.env.TRAPMAP_DATABASE_URL || process.env.DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

describe('startup sequence', () => {
  it('fm-agent: bootstrapLifecycle registers audit subscribers for all lifecycle events', () => {
    const registeredEvents: string[] = [];
    const mockEventBus = {
      onDomainEvent: (event: string) => {
        registeredEvents.push(event);
      },
      on: () => {},
    };

    const mockApp = {
      skillShareer: {
        eventBus: mockEventBus,
        store: {} as any,
        adapterRegistry: {} as any,
      },
      log: { info: () => {}, error: () => {} },
      decorate: () => {},
    } as any;

    bootstrapLifecycle(mockApp);

    expect(registeredEvents).toContain('knowledge.resubmitted');
    expect(registeredEvents).toContain('knowledge.re-review');
  });

  it('registers the same lifecycle ownership contract for event bus and outbox processing', () => {
    const registrations = new Map<string, number>();
    const mockEventBus = {
      onDomainEvent: (event: string) => {
        registrations.set(event, (registrations.get(event) ?? 0) + 1);
      },
      on: () => {},
    };

    const mockApp = {
      skillShareer: {
        eventBus: mockEventBus,
        store: {} as any,
        adapterRegistry: {} as any,
        graphQueryBackend: {} as any,
      },
      log: { info: () => {}, error: () => {} },
      decorate: () => {},
    } as any;

    bootstrapLifecycle(mockApp);

    expect(registrations.get('knowledge.approved')).toBe(3);
    expect(registrations.get('knowledge.deactivated')).toBe(2);
    expect(registrations.get('knowledge.resubmitted')).toBe(2);
  });

  it('registers shared artifact adapters during startup', async () => {
    const server = await buildServer();
    await server.ready();

    const adapters = getArtifactAdapters();
    expect(adapters.length).toBeGreaterThanOrEqual(1);

    await server.close();
  });

  it('supports api-only runtime mode without owning workers locally', async () => {
    const server = await buildServer({ runtimeMode: 'api' });
    await server.ready();

    expect((server as any).taskWorker?.ownsWork?.() ?? false).toBe(false);
    expect((server as any).outboxWorker?.ownsWork?.() ?? false).toBe(false);

    await server.close();
  });

  it('supports task-worker-only runtime mode', async () => {
    const server = await buildServer({ runtimeMode: 'task-worker' });
    await server.ready();
    expect(server).toBeTruthy();

    await server.close();
  });

  it('supports outbox-worker-only runtime mode', async () => {
    const server = await buildServer({ runtimeMode: 'outbox-worker' });
    await server.ready();
    expect(server).toBeTruthy();

    await server.close();
  });

  it('supports combined runtime mode', async () => {
    const server = await buildServer({ runtimeMode: 'combined' });
    await server.ready();
    expect(server).toBeTruthy();

    await server.close();
  });

  it('supports deployment preset driven runtime resolution', async () => {
    const server = await buildServer({
      config: {
        deployment: { profile: 'distributed', preset: 'candidate-worker' },
      } as any,
    });
    await server.ready();

    expect(server.skillShareer.runtimeMode).toBe('task-worker');
    expect(server.skillShareer.serviceUnit).toBe('candidate-ingestion');
    expect(server.skillShareer.runtimeDeployment).toMatchObject({
      deploymentProfile: 'distributed',
      preset: 'candidate-worker',
      capabilities: {
        routeSurface: 'worker-status',
      },
    });

    await server.close();
  });

  it('supports knowledge-governance service unit booted as api plus worker combination', async () => {
    const server = await buildServer({
      runtimeMode: 'combined',
      serviceUnit: 'knowledge-governance',
    });
    await server.ready();

    expect(server.skillShareer.serviceUnit).toBe('knowledge-governance');
    expect((server as any).taskWorker?.ownsWork?.() ?? false).toBe(true);
    expect((server as any).outboxWorker?.ownsWork?.() ?? false).toBe(true);

    await server.close();
  });

  it('freezes services after runtime-mode-aware startup', async () => {
    const server = await buildServer({ runtimeMode: 'api' });
    await server.ready();
    expect(Object.isFrozen(server.skillShareer)).toBe(true);
    await server.close();
  });
});

describeIfDb('startup sequence with postgres runtime modes', () => {
  it('task-worker-only mode owns task work in postgres deployments', async () => {
    const server = await buildServer({
      runtimeMode: 'task-worker',
      config: { databaseUrl: DATABASE_URL! } as any,
    });
    await server.ready();
    expect((server as any).taskWorker?.ownsWork?.() ?? false).toBe(true);
    expect((server as any).outboxWorker?.ownsWork?.() ?? false).toBe(false);
    await server.close();
  });

  it('outbox-worker-only mode owns outbox work in postgres deployments', async () => {
    const server = await buildServer({
      runtimeMode: 'outbox-worker',
      config: { databaseUrl: DATABASE_URL! } as any,
    });
    await server.ready();
    expect((server as any).taskWorker?.ownsWork?.() ?? false).toBe(false);
    expect((server as any).outboxWorker?.ownsWork?.() ?? false).toBe(true);
    await server.close();
  });

  it('knowledge-governance service unit owns shared jobs and outbox work in postgres deployments', async () => {
    const workerServer = await buildServer({
      runtimeMode: 'task-worker',
      serviceUnit: 'knowledge-governance',
      config: { databaseUrl: DATABASE_URL! } as any,
    });
    await workerServer.ready();
    expect((workerServer as any).taskWorker?.ownsWork?.() ?? false).toBe(true);
    expect((workerServer as any).outboxWorker?.ownsWork?.() ?? false).toBe(false);
    await workerServer.close();

    const outboxServer = await buildServer({
      runtimeMode: 'outbox-worker',
      serviceUnit: 'knowledge-governance',
      config: { databaseUrl: DATABASE_URL! } as any,
    });
    await outboxServer.ready();
    expect((outboxServer as any).taskWorker?.ownsWork?.() ?? false).toBe(false);
    expect((outboxServer as any).outboxWorker?.ownsWork?.() ?? false).toBe(true);
    await outboxServer.close();
  });
});
