import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import type {
  HealthCheck,
  HealthCheckRegistrar,
  HealthCheckResult,
  LifecycleContext,
  LifecycleHook,
  LifecycleLogger,
  LifecycleManager,
  LifecyclePhase,
} from '@trapmap/backend-core';

/**
 * NestJS implementation of the shared {@link LifecycleManager} and
 * {@link HealthCheckRegistrar} interfaces.
 *
 * Coordinates lifecycle phase transitions and health check execution.
 * Hooks are executed in priority order (lower values first) within each phase.
 *
 * Integrates with NestJS lifecycle:
 * - `onModuleInit` runs the `'init'` phase
 * - `onApplicationShutdown` runs the `'shutting-down'` phase
 */
@Injectable()
export class LifecycleManagerService
  implements LifecycleManager, HealthCheckRegistrar, OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(LifecycleManagerService.name);

  private readonly hooks = new Map<LifecyclePhase, LifecycleHook[]>();
  private readonly healthChecks = new Map<string, HealthCheck>();
  private currentPhase: LifecyclePhase = 'stopped';
  private ready = false;

  // ─── LifecycleManager ──────────────────────────────────────────────

  registerHook(hook: LifecycleHook): void {
    const hooks = this.hooks.get(hook.phase) ?? [];
    hooks.push(hook);
    this.hooks.set(hook.phase, hooks);
    this.logger.debug(
      `Registered lifecycle hook "${hook.name}" for phase "${hook.phase}" (priority: ${hook.priority})`,
    );
  }

  async runPhase(phase: LifecyclePhase, context?: Partial<LifecycleContext>): Promise<void> {
    const hooks = (this.hooks.get(phase) ?? []).sort((a, b) => a.priority - b.priority);

    this.logger.log(`Running lifecycle phase "${phase}" with ${hooks.length} hook(s)`);

    const shutdownHooks: Array<{
      name: string;
      execute: () => Promise<void>;
      priority?: number;
    }> = [];

    const phaseLogger: LifecycleLogger = {
      info: (msg) => this.logger.log(`[${phase}] ${msg}`),
      warn: (msg) => this.logger.warn(`[${phase}] ${msg}`),
      error: (msg) => this.logger.error(`[${phase}] ${msg}`),
    };

    const hookContext: LifecycleContext = {
      phase,
      logger: phaseLogger,
      registerShutdownHook: (hook) => {
        shutdownHooks.push(hook);
      },
      ...context,
    };

    for (const hook of hooks) {
      try {
        await hook.execute(hookContext);
      } catch (err) {
        this.logger.error(`Lifecycle hook "${hook.name}" failed during phase "${phase}": ${err}`);
        // Continue executing remaining hooks — don't fail the whole phase
      }
    }

    // If hooks during 'init' or 'ready' registered shutdown hooks, store them
    if (shutdownHooks.length > 0) {
      for (const h of shutdownHooks) {
        this.registerHook({
          name: h.name,
          phase: 'shutting-down',
          priority: h.priority ?? 999,
          execute: async () => {
            await h.execute();
          },
        });
      }
    }

    this.currentPhase = phase;
  }

  getCurrentPhase(): LifecyclePhase {
    return this.currentPhase;
  }

  // ─── HealthCheckRegistrar ──────────────────────────────────────────

  registerHealthCheck(check: HealthCheck): void {
    this.healthChecks.set(check.name, check);
    this.logger.debug(`Registered health check: "${check.name}"`);
  }

  async runHealthChecks(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];

    for (const [name, check] of this.healthChecks) {
      try {
        const result = await check.check();
        results.push({
          ...result,
          ...(check.critical !== undefined && result.critical === undefined
            ? { critical: check.critical }
            : {}),
        });
      } catch (err) {
        results.push({
          name,
          status: 'unknown',
          message: `Health check threw: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    return results;
  }

  // ─── NestJS lifecycle integration ──────────────────────────────────

  async onModuleInit(): Promise<void> {
    await this.runPhase('init');
    await this.runPhase('ready');
    this.ready = true;
  }

  async onApplicationShutdown(): Promise<void> {
    this.ready = false;
    await this.runPhase('shutting-down');
    await this.runPhase('stopped');
  }

  // ─── Readiness / liveness probes ────────────────────────────────────

  /** Whether the application has completed its startup phases. */
  isReady(): boolean {
    return this.ready;
  }

  /** Whether the process is alive (always true while responding). */
  isAlive(): boolean {
    return true;
  }
}
