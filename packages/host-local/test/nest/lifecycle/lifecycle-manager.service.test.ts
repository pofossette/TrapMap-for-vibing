import type { HealthCheck, HealthCheckResult, LifecycleHook } from '@trapmap/backend-core';
import { beforeEach, describe, expect, it } from 'vitest';
import { LifecycleManagerService } from '../../../src/nest/lifecycle/lifecycle-manager.service.js';

describe('LifecycleManagerService', () => {
  let manager: LifecycleManagerService;

  beforeEach(() => {
    manager = new LifecycleManagerService();
  });

  describe('hook ordering', () => {
    it('should execute hooks in priority order (lower first)', async () => {
      const order: string[] = [];

      const hookA: LifecycleHook = {
        name: 'hook-a-high-priority',
        phase: 'init',
        priority: 10,
        execute: async () => {
          order.push('a');
        },
      };

      const hookB: LifecycleHook = {
        name: 'hook-b-low-priority',
        phase: 'init',
        priority: 1,
        execute: async () => {
          order.push('b');
        },
      };

      const hookC: LifecycleHook = {
        name: 'hook-c-medium-priority',
        phase: 'init',
        priority: 5,
        execute: async () => {
          order.push('c');
        },
      };

      manager.registerHook(hookA);
      manager.registerHook(hookB);
      manager.registerHook(hookC);

      await manager.runPhase('init');

      expect(order).toEqual(['b', 'c', 'a']);
    });

    it('should only run hooks for the requested phase', async () => {
      const ran: string[] = [];

      manager.registerHook({
        name: 'init-hook',
        phase: 'init',
        priority: 1,
        execute: async () => {
          ran.push('init');
        },
      });

      manager.registerHook({
        name: 'ready-hook',
        phase: 'ready',
        priority: 1,
        execute: async () => {
          ran.push('ready');
        },
      });

      await manager.runPhase('init');

      expect(ran).toEqual(['init']);
    });

    it('should continue executing remaining hooks if one throws', async () => {
      const ran: string[] = [];

      manager.registerHook({
        name: 'failing-hook',
        phase: 'init',
        priority: 1,
        execute: async () => {
          throw new Error('boom');
        },
      });

      manager.registerHook({
        name: 'recovery-hook',
        phase: 'init',
        priority: 2,
        execute: async () => {
          ran.push('recovery');
        },
      });

      await manager.runPhase('init');

      expect(ran).toEqual(['recovery']);
    });

    it('should register shutdown hooks from init phase hooks', async () => {
      const shutdownRan: string[] = [];

      manager.registerHook({
        name: 'init-hook-with-cleanup',
        phase: 'init',
        priority: 1,
        execute: async (ctx) => {
          ctx.registerShutdownHook({
            name: 'my-cleanup',
            execute: async () => {
              shutdownRan.push('cleaned');
            },
          });
        },
      });

      await manager.runPhase('init');
      await manager.runPhase('ready');
      await manager.runPhase('shutting-down');

      expect(shutdownRan).toEqual(['cleaned']);
    });

    it('should track current phase', async () => {
      expect(manager.getCurrentPhase()).toBe('stopped');

      await manager.runPhase('init');
      expect(manager.getCurrentPhase()).toBe('init');

      await manager.runPhase('ready');
      expect(manager.getCurrentPhase()).toBe('ready');
    });
  });

  describe('readiness tracking', () => {
    it('should report not ready initially', () => {
      expect(manager.isReady()).toBe(false);
    });

    it('should report ready after onModuleInit completes', async () => {
      await manager.onModuleInit();
      expect(manager.isReady()).toBe(true);
    });

    it('should report not ready after onApplicationShutdown', async () => {
      await manager.onModuleInit();
      expect(manager.isReady()).toBe(true);

      await manager.onApplicationShutdown();
      expect(manager.isReady()).toBe(false);
    });

    it('should report isAlive as true', () => {
      expect(manager.isAlive()).toBe(true);
    });
  });

  describe('health check aggregation', () => {
    it('should run all registered health checks and aggregate results', async () => {
      const dbCheck: HealthCheck = {
        name: 'database',
        check: async (): Promise<HealthCheckResult> => ({
          name: 'database',
          status: 'healthy',
          latencyMs: 5,
        }),
      };

      const cacheCheck: HealthCheck = {
        name: 'cache',
        check: async (): Promise<HealthCheckResult> => ({
          name: 'cache',
          status: 'degraded',
          latencyMs: 150,
          message: 'High latency',
        }),
      };

      manager.registerHealthCheck(dbCheck);
      manager.registerHealthCheck(cacheCheck);

      const results = await manager.runHealthChecks();

      expect(results).toHaveLength(2);
      expect(results.find((r) => r.name === 'database')?.status).toBe('healthy');
      expect(results.find((r) => r.name === 'cache')?.status).toBe('degraded');
    });

    it('should return unknown status when a health check throws', async () => {
      manager.registerHealthCheck({
        name: 'broken-check',
        check: async () => {
          throw new Error('connection refused');
        },
      });

      const results = await manager.runHealthChecks();

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('broken-check');
      expect(results[0].status).toBe('unknown');
      expect(results[0].message).toContain('connection refused');
    });

    it('should return empty array when no health checks are registered', async () => {
      const results = await manager.runHealthChecks();
      expect(results).toEqual([]);
    });
  });
});
