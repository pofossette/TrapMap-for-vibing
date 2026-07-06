/**
 * Runtime barrel -- re-exports public API from runtime module files.
 *
 * Covers deployment profiles, metrics, resilience, request context,
 * HTTP/route surface, runtime contract, service unit, runtime metadata,
 * runtime ownership, and service topology.
 */

// Deployment profiles
export type {
  DeploymentProfile,
  DeploymentProfileSource,
  DeploymentRouteSurface,
  DeploymentAsyncOwnershipExpectation,
  DeploymentStoragePosture,
  DeploymentAuthTeamExpectation,
  DeploymentCapabilities,
  DeploymentProfileCompatibility,
  ResolvedRuntimeDeployment,
} from './deployment-profile.js';
export {
  resolveRuntimeDeployment,
  resolveDeploymentProfileCompatibility,
} from './deployment-profile.js';

// Metrics
export type {
  RuntimeFailureKind,
  RuntimeMetricsCounter,
  RuntimeMetricsSnapshot,
} from './metrics.js';
export {
  incrementMetric,
  setGaugeMetric,
  observeHistogramMetric,
  recordRuntimeExecution,
  recordRuntimeRetry,
  recordRuntimeReclaim,
  recordRuntimeBacklog,
  recordHttpRequestMetric,
  recordDatabaseMetric,
  recordQueueMetric,
  getRuntimeMetricsSnapshot,
  getAverageLatencyMs,
  getAverageQueueBacklog,
  getAverageOutboxBacklog,
  getAverageStaleWorkers,
  renderPrometheusMetrics,
  resetRuntimeMetrics,
} from './metrics.js';

// Resilience
export type {
  ResilienceFailureKind,
  ResilienceFailureMode,
  ResiliencePolicy,
  ResilienceContext,
  ResilienceResult,
  ExecuteWithResilienceOptions,
} from './resilience-v2.js';
export { executeWithResilience } from './resilience-v2.js';

// Request context
export type { RequestContext } from './request-context.js';
export { getOrCreateRequestContext } from './request-context.js';

// HTTP surface
export { registerRuntimeRoutes, handleRuntimeError } from './http-surface.js';

// HTTP request hooks (observability: trace propagation + request logging)
export type { HttpRequestHooksArgs } from './http-hooks.js';
export { registerHttpRequestHooks } from './http-hooks.js';

// Route surface
export type {
  RouteAudience,
  RouteFamilyKind,
  UnsupportedRouteDescriptor,
  RouteFamilyDescriptor,
} from './route-surface.js';
export {
  flattenDocumentedRoutes,
  buildRouteSurfaceSummary,
  getUnsupportedRouteDescriptors,
} from './route-surface.js';

// Runtime contract
export type {
  RuntimeMode,
  AsyncWorkerKind,
  RuntimeWorkerHandle,
  RuntimeWorkerSnapshot,
} from './runtime-contract.js';
export {
  shouldBootApiRuntime,
  shouldBootTaskWorker,
  shouldBootOutboxWorker,
  shouldOwnAsyncWork,
  snapshotRuntimeWorker,
} from './runtime-contract.js';

// Service unit
export type { ServiceUnit, ServiceUnitProfile } from './service-unit.js';
export { resolveServiceUnit, getServiceUnitProfile } from './service-unit.js';

// Runtime metadata
export type { RuntimeDependencyState, RuntimeStatusSnapshot } from './runtime-metadata.js';
export { buildRuntimeStatusSnapshot } from './runtime-metadata.js';

// Runtime ownership
export type { ResolveAsyncWorkerStateOptions } from './runtime-ownership.js';
export { resolveAsyncWorkerState } from './runtime-ownership.js';

// Service topology
export type {
  TopologyServiceName,
  TopologySurface,
  TopologyRuntimeBoundary,
  TopologyOwnershipMode,
  TopologyServiceDescriptor,
  ServiceTopologySnapshot,
} from './service-topology.js';
export { buildServiceTopologySnapshot } from './service-topology.js';

// Telemetry adapters
export { createMetricsPortAdapter } from './metrics-port-adapter.js';
export { createLoggingPortAdapter, type PinoLikeLogger } from './logging-port-adapter.js';
export {
  createTracingPortAdapter,
  type TracingPortAdapterOptions,
} from './tracing-port-adapter.js';
export type { LoggingPort, MetricsPort, SpanHandle, TracingPort } from './telemetry-ports.js';
