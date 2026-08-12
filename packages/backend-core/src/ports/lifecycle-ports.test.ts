import { describe, expect, it } from 'vitest';

import type {
  HealthCheck,
  HealthCheckRegistrar,
  HealthCheckResult,
  LifecycleContext,
  LifecycleHook,
  LifecycleLogger,
  LifecycleManager,
  LifecyclePhase,
} from './lifecycle-ports.js';

// ---------------------------------------------------------------------------
// In-memory stub implementations that satisfy the port interfaces
// ---------------------------------------------------------------------------

class StubLogger implements LifecycleLogger {
  readonly entries: Array<{ level: string; msg: string; ctx?: Record<string, unknown> }> = [];

  info(msg: string, ctx?: Record<string, unknown>): void {
    this.entries.push({ level: 'info', msg, ctx });
  }

  warn(msg: string, ctx?: Record<string, unknown>): void {
    this.entries.push({ level: 'warn', msg, ctx });
  }

  error(msg: string, ctx?: Record<string, unknown>): void {
    this.entries.push({ level: 'error', msg, ctx });
  }
}

class StubLifecycleManager implements LifecycleManager {
  private hooks: LifecycleHook[] = [];
  private currentPhase: LifecyclePhase = 'stopped';
  readonly executionLog: Array<{ phase: LifecyclePhase; hookName: string }> = [];

  registerHook(hook: LifecycleHook): void {
    this.hooks.push(hook);
  }

  getCurrentPhase(): LifecyclePhase {
    return this.currentPhase;
  }

  async runPhase(
    phase: LifecyclePhase,
    contextOverrides?: Partial<LifecycleContext>,
  ): Promise<void> {
    const shutdownHooks: Array<{ name: string; execute: () => Promise<void>; priority: number }> =
      [];

    const logger: LifecycleLogger = contextOverrides?.logger ?? new StubLogger();

    const context: LifecycleContext = {
      phase,
      logger,
      registerShutdownHook(hook) {
        shutdownHooks.push({
          name: hook.name,
          execute: hook.execute,
          priority: hook.priority ?? 100,
        });
      },
      ...contextOverrides,
    };

    const phaseHooks = this.hooks
      .filter((h) => h.phase === phase)
      .sort((a, b) => a.priority - b.priority);

    for (const hook of phaseHooks) {
      await hook.execute(context);
      this.executionLog.push({ phase, hookName: hook.name });
    }

    this.currentPhase = phase;
  }
}

class StubHealthCheckRegistrar implements HealthCheckRegistrar {
  private checks: HealthCheck[] = [];

  registerHealthCheck(check: HealthCheck): void {
    this.checks.push(check);
  }

  async runHealthChecks(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];
    for (const check of this.checks) {
      results.push(await check.check());
    }
    return results;
  }
}

// ---------------------------------------------------------------------------
// Tests — LifecycleManager
// ---------------------------------------------------------------------------

describe('LifecycleManager', () => {
  it('starts in the "stopped" phase', () => {
    const manager: LifecycleManager = new StubLifecycleManager();
    expect(manager.getCurrentPhase()).toBe('stopped');
  });

  it('transitions phase after runPhase completes', async () => {
    const manager: LifecycleManager = new StubLifecycleManager();
    await manager.runPhase('init');
    expect(manager.getCurrentPhase()).toBe('init');

    await manager.runPhase('ready');
    expect(manager.getCurrentPhase()).toBe('ready');
  });

  it('runs hooks in priority order (lower first)', async () => {
    const manager = new StubLifecycleManager();
    const order: string[] = [];

    manager.registerHook({
      name: 'high-priority',
      phase: 'init',
      priority: 10,
      async execute() {
        order.push('high-priority');
      },
    });
    manager.registerHook({
      name: 'low-priority',
      phase: 'init',
      priority: 90,
      async execute() {
        order.push('low-priority');
      },
    });
    manager.registerHook({
      name: 'mid-priority',
      phase: 'init',
      priority: 50,
      async execute() {
        order.push('mid-priority');
      },
    });

    await manager.runPhase('init');
    expect(order).toEqual(['high-priority', 'mid-priority', 'low-priority']);
  });

  it('only executes hooks matching the requested phase', async () => {
    const manager = new StubLifecycleManager();

    manager.registerHook({
      name: 'init-hook',
      phase: 'init',
      priority: 10,
      async execute() {},
    });
    manager.registerHook({
      name: 'ready-hook',
      phase: 'ready',
      priority: 10,
      async execute() {},
    });

    await manager.runPhase('init');

    const stub = manager as StubLifecycleManager;
    expect(stub.executionLog).toHaveLength(1);
    expect(stub.executionLog[0].hookName).toBe('init-hook');
  });

  it('provides context to hook execute calls', async () => {
    const manager = new StubLifecycleManager();
    let capturedPhase: LifecyclePhase | undefined;

    manager.registerHook({
      name: 'phase-reader',
      phase: 'ready',
      priority: 10,
      async execute(ctx) {
        capturedPhase = ctx.phase;
        ctx.logger.info('executing', { phase: ctx.phase });
      },
    });

    await manager.runPhase('ready');
    expect(capturedPhase).toBe('ready');
  });

  it('allows hooks to register shutdown hooks via context', async () => {
    const manager = new StubLifecycleManager();
    const shutdownNames: string[] = [];

    manager.registerHook({
      name: 'init-with-shutdown',
      phase: 'init',
      priority: 10,
      async execute(ctx) {
        ctx.registerShutdownHook({
          name: 'cleanup-db',
          async execute() {
            shutdownNames.push('cleanup-db');
          },
          priority: 10,
        });
      },
    });

    await manager.runPhase('init');

    // The stub LifecycleManager collects shutdown hooks but doesn't auto-run them.
    // This test verifies the registerShutdownHook call doesn't throw and is callable.
    // A real implementation would run them during 'shutting-down'.
    expect(shutdownNames).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests — HealthCheckRegistrar
// ---------------------------------------------------------------------------

describe('HealthCheckRegistrar', () => {
  it('runs a single registered health check', async () => {
    const registrar: HealthCheckRegistrar = new StubHealthCheckRegistrar();

    registrar.registerHealthCheck({
      name: 'db',
      async check(): Promise<HealthCheckResult> {
        return { name: 'db', status: 'healthy', latencyMs: 5 };
      },
    });

    const results = await registrar.runHealthChecks();
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ name: 'db', status: 'healthy', latencyMs: 5 });
  });

  it('aggregates results from multiple checks', async () => {
    const registrar: HealthCheckRegistrar = new StubHealthCheckRegistrar();

    registrar.registerHealthCheck({
      name: 'db',
      async check() {
        return { name: 'db', status: 'healthy', latencyMs: 3 };
      },
    });
    registrar.registerHealthCheck({
      name: 'cache',
      async check() {
        return { name: 'cache', status: 'degraded', latencyMs: 200, message: 'slow responses' };
      },
    });
    registrar.registerHealthCheck({
      name: 'queue',
      async check() {
        return { name: 'queue', status: 'unhealthy', message: 'connection refused' };
      },
    });

    const results = await registrar.runHealthChecks();
    expect(results).toHaveLength(3);

    expect(results[0].status).toBe('healthy');
    expect(results[1].status).toBe('degraded');
    expect(results[1].message).toBe('slow responses');
    expect(results[2].status).toBe('unhealthy');
  });

  it('returns empty array when no checks are registered', async () => {
    const registrar: HealthCheckRegistrar = new StubHealthCheckRegistrar();
    const results = await registrar.runHealthChecks();
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests — type-level compile checks (verify the stubs satisfy the interfaces)
// ---------------------------------------------------------------------------

describe('type-safety', () => {
  it('StubLifecycleManager satisfies LifecycleManager', () => {
    const manager: LifecycleManager = new StubLifecycleManager();
    expect(typeof manager.registerHook).toBe('function');
    expect(typeof manager.runPhase).toBe('function');
    expect(typeof manager.getCurrentPhase).toBe('function');
  });

  it('StubHealthCheckRegistrar satisfies HealthCheckRegistrar', () => {
    const registrar: HealthCheckRegistrar = new StubHealthCheckRegistrar();
    expect(typeof registrar.registerHealthCheck).toBe('function');
    expect(typeof registrar.runHealthChecks).toBe('function');
  });
});
