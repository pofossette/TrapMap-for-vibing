/**
 * Gateway-level tunables (centralized literals with env overrides).
 *
 * Parsing style mirrors `config/service-config.ts`: `Number.parseInt` with a
 * fallback to the previous hard-coded default, so behavior is unchanged when
 * the env var is unset or invalid.
 */

import { DEFAULT_CONSUL_TIMEOUT_MS, DEFAULT_DISCOVERY_CACHE_TTL_MS } from '@trapmap/backend-core';

const DEFAULT_GATEWAY_INTERNAL_TIMEOUT_MS = 10_000;
const DEFAULT_GATEWAY_HEALTH_PROBE_TIMEOUT_MS = 800;

/**
 * Default per-hop timeout for internal service calls (`callInternalServiceOnce`).
 *
 * Applies when neither an explicit per-call `timeoutMs` nor a per-service
 * `TRAPMAP_<SVC>_TIMEOUT_MS` budget resolves. Previously hard-coded as
 * `DEFAULT_INTERNAL_TIMEOUT_MS = 10_000` in `internal-client/types.ts`.
 */
export function resolveGatewayDefaultTimeoutMs(env: Record<string, string | undefined>): number {
  const parsed = Number.parseInt(env.TRAPMAP_GATEWAY_DEFAULT_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GATEWAY_INTERNAL_TIMEOUT_MS;
}

/**
 * Abort timeout for the gateway `/health` dependency probes (knowledge-read-go
 * and go-accelerator). Previously hard-coded as `800`ms in `routes.ts`.
 */
export function resolveGatewayHealthProbeTimeoutMs(
  env: Record<string, string | undefined>,
): number {
  const parsed = Number.parseInt(env.TRAPMAP_GATEWAY_HEALTH_PROBE_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GATEWAY_HEALTH_PROBE_TIMEOUT_MS;
}

/**
 * TTL for the `DynamicDiscovery` cache wrapping the Consul adapter
 * (`discovery-factory.ts`). Previously hard-coded as `cacheTTLMs: 30_000`;
 * unset/invalid env falls back to the shared backend-core default.
 */
export function resolveDiscoveryCacheTtlMs(env: Record<string, string | undefined>): number {
  const parsed = Number.parseInt(env.TRAPMAP_DISCOVERY_CACHE_TTL_MS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DISCOVERY_CACHE_TTL_MS;
}

/**
 * Request timeout for Consul HTTP API calls (`ConsulDiscoveryAdapter`).
 * Previously unset (adapter default); unset/invalid env falls back to the
 * shared backend-core default.
 */
export function resolveConsulHttpTimeoutMs(env: Record<string, string | undefined>): number {
  const parsed = Number.parseInt(env.CONSUL_HTTP_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CONSUL_TIMEOUT_MS;
}
