/**
 * Internal service invocation configuration.
 *
 * Defines the configuration shape for how internal service ports
 * are resolved and connected at runtime. This is host-agnostic --
 * host assemblies use it to decide whether to wire modules in-process
 * or route them to remote services.
 */

// ---------------------------------------------------------------------------
// Invocation routing configuration
// ---------------------------------------------------------------------------

/**
 * Describes how a single internal port is wired.
 */
export interface InvocationRouteConfig {
  /** The port being configured. */
  portName: string;
  /** Routing strategy for this port. */
  strategy: 'in-process' | 'rpc' | 'event-driven';
  /** Target URL if strategy is 'rpc'. */
  targetUrl?: string;
  /** Timeout in milliseconds for this port's invocations. */
  timeoutMs?: number;
  /** Maximum retry attempts for transient failures. */
  maxRetries?: number;
  /** Whether invocations to this port are idempotent. */
  idempotent?: boolean;
  /** Idempotency key header or field name, if applicable. */
  idempotencyKeyField?: string;
}

/**
 * Full internal invocation configuration.
 * Host assemblies populate this based on deployment profile and topology.
 */
export interface InvocationConfig {
  routes: InvocationRouteConfig[];
  defaultTimeoutMs: number;
  defaultMaxRetries: number;
}

/**
 * Default invocation configuration for in-process (light host) wiring.
 * All ports are wired in-process with no retries.
 */
export const DEFAULT_IN_PROCESS_CONFIG: InvocationConfig = {
  routes: [],
  defaultTimeoutMs: 30_000,
  defaultMaxRetries: 0,
};

/**
 * Build an in-process invocation configuration for a set of port names.
 */
export function buildInProcessConfig(portNames: string[]): InvocationConfig {
  return {
    routes: portNames.map((portName) => ({
      portName,
      strategy: 'in-process' as const,
      idempotent: true,
    })),
    defaultTimeoutMs: 30_000,
    defaultMaxRetries: 0,
  };
}
