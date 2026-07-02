/**
 * Shared lifecycle hook abstractions.
 *
 * Host-agnostic interfaces for application startup, shutdown,
 * flush, and health-check registration. Concrete implementations
 * (Fastify hooks, NestJS lifecycle, test stubs) are provided by
 * host assemblies.
 */

// ---------------------------------------------------------------------------
// Lifecycle phases
// ---------------------------------------------------------------------------

/** Ordered phases of an application lifecycle. */
export type LifecyclePhase = 'init' | 'ready' | 'shutting-down' | 'stopped';

// ---------------------------------------------------------------------------
// Lifecycle context
// ---------------------------------------------------------------------------

/**
 * Minimal logger contract supplied to lifecycle hooks.
 * Matches the three-method subset used across host assemblies
 * without pulling in any logging library.
 */
export interface LifecycleLogger {
  info(msg: string, ctx?: Record<string, unknown>): void;
  warn(msg: string, ctx?: Record<string, unknown>): void;
  error(msg: string, ctx?: Record<string, unknown>): void;
}

/** Context object passed to every lifecycle hook execution. */
export interface LifecycleContext {
  /** The phase currently being executed. */
  phase: LifecyclePhase;

  /** Scoped logger for the hook's execution. */
  logger: LifecycleLogger;

  /**
   * Register a shutdown hook that will run during the
   * `'shutting-down'` phase. Useful for hooks executed during
   * `'init'` / `'ready'` that need to clean up resources later.
   */
  registerShutdownHook(hook: {
    name: string;
    execute: () => Promise<void>;
    priority?: number;
  }): void;
}

// ---------------------------------------------------------------------------
// Lifecycle hooks
// ---------------------------------------------------------------------------

/**
 * A single lifecycle hook that participates in one phase of the
 * application lifecycle.
 */
export interface LifecycleHook {
  /** Unique identifier for the hook. */
  name: string;

  /** Phase during which this hook executes. */
  phase: LifecyclePhase;

  /** Lower values execute first (like Fastify plugin ordering). */
  priority: number;

  /** Run the hook. */
  execute(context: LifecycleContext): Promise<void>;
}

// ---------------------------------------------------------------------------
// Lifecycle manager
// ---------------------------------------------------------------------------

/**
 * Coordinates registration and execution of lifecycle hooks
 * across phases.
 */
export interface LifecycleManager {
  /** Register a hook for later execution. */
  registerHook(hook: LifecycleHook): void;

  /**
   * Execute all hooks registered for `phase` in priority order.
   * Implementations may merge caller-supplied context fields with
   * their own defaults.
   */
  runPhase(phase: LifecyclePhase, context?: Partial<LifecycleContext>): Promise<void>;

  /** Return the most recently completed phase. */
  getCurrentPhase(): LifecyclePhase;
}

// ---------------------------------------------------------------------------
// Health checks
// ---------------------------------------------------------------------------

/** Result of a single health check probe. */
export interface HealthCheckResult {
  /** Identifier matching the check that produced this result. */
  name: string;

  /** Aggregated status. */
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

  /** Wall-clock latency of the check in milliseconds. */
  latencyMs?: number;

  /** Optional human-readable explanation. */
  message?: string;
}

/** A registered health-check probe. */
export interface HealthCheck {
  /** Unique identifier for the check. */
  name: string;

  /** Execute the probe and return a result. */
  check(): Promise<HealthCheckResult>;
}

/**
 * Registry and executor for health checks.
 */
export interface HealthCheckRegistrar {
  /** Register a health check probe. */
  registerHealthCheck(check: HealthCheck): void;

  /** Run all registered checks and return their results. */
  runHealthChecks(): Promise<HealthCheckResult[]>;
}
