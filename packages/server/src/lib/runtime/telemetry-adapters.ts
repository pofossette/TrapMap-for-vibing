/**
 * Telemetry adapters barrel -- assembles MetricsPort, TracingPort, and
 * LoggingPort adapters backed by the server's existing infrastructure.
 */

import type { RequestContext } from './request-context.js';
import type { LoggingPort, MetricsPort, TracingPort } from './telemetry-ports.js';

import { type PinoLikeLogger, createLoggingPortAdapter } from './logging-port-adapter.js';
import { createMetricsPortAdapter } from './metrics-port-adapter.js';
import {
  type TracingPortAdapterOptions,
  createTracingPortAdapter,
} from './tracing-port-adapter.js';

export { createMetricsPortAdapter } from './metrics-port-adapter.js';
export {
  createTracingPortAdapter,
  type TracingPortAdapterOptions,
} from './tracing-port-adapter.js';
export { createLoggingPortAdapter, type PinoLikeLogger } from './logging-port-adapter.js';

export interface TelemetryAdapters {
  metrics: MetricsPort;
  tracing: TracingPort;
  logging: LoggingPort;
}

/**
 * Create a complete set of telemetry adapters for the Fastify server.
 *
 * @param logger - The Fastify instance's pino logger (`app.log`).
 * @param requestContextAccessor - Optional callback that returns the current
 *   request context, used by the tracing adapter to extract trace IDs.
 * @param tracingOptions - Optional tracing adapter options (Phase 2B).
 */
export function createTelemetryAdapters(
  logger: PinoLikeLogger,
  requestContextAccessor?: () => RequestContext | undefined,
  tracingOptions?: TracingPortAdapterOptions,
): TelemetryAdapters {
  return {
    metrics: createMetricsPortAdapter(),
    tracing: createTracingPortAdapter(requestContextAccessor, tracingOptions),
    logging: createLoggingPortAdapter(logger),
  };
}
