import type { HealthStatus, DependencyStatus } from '@trapmap/contracts';

import type { RuntimeStatusSnapshot } from './runtime-metadata.js';

const startedAt = new Date().toISOString();

/**
 * Pure mapping function: takes the existing RuntimeStatusSnapshot and produces
 * the shared HealthStatus contract shape.  All backward-compatible fields from
 * the snapshot are preserved (spread after the contract fields so they are
 * additive, not destructive).
 */
export function toHealthStatus(snapshot: RuntimeStatusSnapshot): HealthStatus {
  const timestamp = new Date().toISOString();
  const uptime = snapshot.uptimeSeconds;

  return {
    status: deriveOverallStatus(snapshot),
    timestamp,
    startedAt,
    uptime,
    readiness: snapshot.readiness,
    liveness: snapshot.liveness,
    dependencies: buildDependencyStatuses(snapshot),
    deployment: {
      profile: snapshot.deployment.deploymentProfile,
      ...(snapshot.deployment.preset ? { preset: snapshot.deployment.preset } : {}),
    },
  };
}

/** Module-level constant for the /live endpoint. */
export const livenessTimestamp = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function deriveOverallStatus(snapshot: RuntimeStatusSnapshot): HealthStatus['status'] {
  if (snapshot.readiness === 'not-ready') {
    return 'unhealthy';
  }
  if (snapshot.readiness === 'degraded') {
    return 'degraded';
  }
  return 'ok';
}

function mapAsyncWorkerState(name: string, state: string | undefined): DependencyStatus {
  if (state === 'running') {
    return { name, status: 'healthy' };
  }
  if (state === 'remote' || state === 'not-configured') {
    return { name, status: 'unknown' };
  }
  // 'degraded' or any other value
  return { name, status: 'degraded' };
}

function mapGraphQueryState(
  state: RuntimeStatusSnapshot['dependencies']['graphQuery'],
): DependencyStatus {
  if (state === 'healthy') {
    return { name: 'graph-query', status: 'healthy' };
  }
  if (state === 'fallback') {
    return { name: 'graph-query', status: 'degraded' };
  }
  if (state === 'failed') {
    return { name: 'graph-query', status: 'unhealthy' };
  }
  // 'disabled'
  return { name: 'graph-query', status: 'unknown' };
}

function buildDependencyStatuses(snapshot: RuntimeStatusSnapshot): DependencyStatus[] {
  const deps = snapshot.dependencies;

  const database: DependencyStatus = {
    name: 'database',
    status: deps.database === 'postgres' ? 'healthy' : 'unknown',
    message: deps.database,
  };

  const queueWorker = mapAsyncWorkerState('queue-worker', deps.queueWorker);
  const outboxWorker = mapAsyncWorkerState('outbox-worker', deps.outboxWorker);
  const graphQuery = mapGraphQueryState(deps.graphQuery);

  return [database, queueWorker, outboxWorker, graphQuery];
}
