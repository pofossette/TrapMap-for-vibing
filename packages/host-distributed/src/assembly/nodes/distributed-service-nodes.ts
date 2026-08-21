/**
 * Distributed-host service/transport nodes (Phase 3 assembly convergence).
 *
 * One node per distributed service. Each applies the exact per-service server
 * factory that the legacy `start<X>Service()` starters used (via the host
 * adapter `server.ts`), consuming the provided `serviceConfig` and
 * `serviceDatabase` from the shared nodes. The node exposes the assembled
 * server handle under {@link SERVICE_SERVER_SERVICE}; boot does not bind the
 * server — the caller (starter) calls `server.start()` exactly as before, so
 * runtime semantics are unchanged.
 *
 * Placement follows the Phase 2 lesson: these host-distributed-owned pilot
 * nodes belong in the host package, not `packages/assembly` (the assembly
 * zone cannot import hosts).
 */
import { defineNode } from '@trapmap/assembly';
import type { CapabilityNode } from '@trapmap/assembly';

import { createServer as createCandidateIngestionServer } from '../../candidate-ingestion/server.js';
import type { ServiceConfig } from '../../config/index.js';
import { createServer as createCronServer } from '../../cron-scheduler/server.js';
import { createServer as createGatewayServer } from '../../gateway/server.js';
import { createServer as createGovernanceReviewServer } from '../../governance-review/server.js';
import { createServer as createIdentityAccessServer } from '../../identity-access/server.js';
import { createServer as createJobRuntimeServer } from '../../job-runtime/server.js';
import { createKnowledgeReadServerAdapter } from '../../knowledge-read/server.js';
import { createServer as createKnowledgeWriteServer } from '../../knowledge-write/server.js';
import { SERVICE_CONFIG_SERVICE } from './service-config.js';
import { SERVICE_DATABASE_SERVICE } from './service-database.js';

/** Context service token under which the assembled server handle is provided. */
export const SERVICE_SERVER_SERVICE = 'serviceServer';

function requireConfig(ctx: Parameters<CapabilityNode['apply']>[0]): ServiceConfig {
  const config = ctx.get(SERVICE_CONFIG_SERVICE);
  return config;
}

function requireDatabase(): never {
  throw new Error('service node requires serviceDatabase to be provided');
}

/** Gateway: exposes the gateway transport (no own database). */
export const gatewayServiceNode: CapabilityNode = defineNode({
  id: 'gateway-service',
  provides: SERVICE_SERVER_SERVICE,
  inject: [SERVICE_CONFIG_SERVICE],
  topology: 'embedded',
  apply: async (ctx) => {
    const config = requireConfig(ctx);
    ctx.provide(SERVICE_SERVER_SERVICE, await createGatewayServer(config));
  },
});

/** identity-access: pg + identity owner + fastify surface. */
export const identityAccessServiceNode: CapabilityNode = defineNode({
  id: 'identity-access-service',
  provides: SERVICE_SERVER_SERVICE,
  inject: [SERVICE_CONFIG_SERVICE, SERVICE_DATABASE_SERVICE],
  topology: 'embedded',
  apply: async (ctx) => {
    const config = requireConfig(ctx);
    const db = ctx.get(SERVICE_DATABASE_SERVICE);
    if (!db) requireDatabase();
    ctx.provide(SERVICE_SERVER_SERVICE, await createIdentityAccessServer(config, db));
  },
});

/** knowledge-read: pg + retrieval + fastify surface. */
export const knowledgeReadServiceNode: CapabilityNode = defineNode({
  id: 'knowledge-read-service',
  provides: SERVICE_SERVER_SERVICE,
  inject: [SERVICE_CONFIG_SERVICE, SERVICE_DATABASE_SERVICE],
  topology: 'embedded',
  apply: async (ctx) => {
    const config = requireConfig(ctx);
    const db = ctx.get(SERVICE_DATABASE_SERVICE);
    if (!db) requireDatabase();
    ctx.provide(SERVICE_SERVER_SERVICE, await createKnowledgeReadServerAdapter(config, db));
  },
});

/** knowledge-write: pg + write owner bundle + fastify surface. */
export const knowledgeWriteServiceNode: CapabilityNode = defineNode({
  id: 'knowledge-write-service',
  provides: SERVICE_SERVER_SERVICE,
  inject: [SERVICE_CONFIG_SERVICE, SERVICE_DATABASE_SERVICE],
  topology: 'embedded',
  apply: async (ctx) => {
    const config = requireConfig(ctx);
    const db = ctx.get(SERVICE_DATABASE_SERVICE);
    if (!db) requireDatabase();
    ctx.provide(SERVICE_SERVER_SERVICE, await createKnowledgeWriteServer(config, db));
  },
});

/** candidate-ingestion: pg + processing runtime + fastify surface. */
export const candidateIngestionServiceNode: CapabilityNode = defineNode({
  id: 'candidate-ingestion-service',
  provides: SERVICE_SERVER_SERVICE,
  inject: [SERVICE_CONFIG_SERVICE, SERVICE_DATABASE_SERVICE],
  topology: 'embedded',
  apply: async (ctx) => {
    const config = requireConfig(ctx);
    const db = ctx.get(SERVICE_DATABASE_SERVICE);
    if (!db) requireDatabase();
    ctx.provide(SERVICE_SERVER_SERVICE, await createCandidateIngestionServer(config, db));
  },
});

/** governance-review: pg + governance owner + fastify surface. */
export const governanceReviewServiceNode: CapabilityNode = defineNode({
  id: 'governance-review-service',
  provides: SERVICE_SERVER_SERVICE,
  inject: [SERVICE_CONFIG_SERVICE, SERVICE_DATABASE_SERVICE],
  topology: 'embedded',
  apply: async (ctx) => {
    const config = requireConfig(ctx);
    const db = ctx.get(SERVICE_DATABASE_SERVICE);
    if (!db) requireDatabase();
    ctx.provide(SERVICE_SERVER_SERVICE, await createGovernanceReviewServer(config, db));
  },
});

/** job-runtime: pg + task/outbox handlers (worker container) + fastify surface. */
export const jobRuntimeServiceNode: CapabilityNode = defineNode({
  id: 'job-runtime-service',
  provides: SERVICE_SERVER_SERVICE,
  inject: [SERVICE_CONFIG_SERVICE, SERVICE_DATABASE_SERVICE],
  topology: 'embedded',
  children: [
    'candidate-processing',
    'governance-feedback',
    'conflict-detection',
    'outbox-dispatch',
  ],
  apply: async (ctx) => {
    const config = requireConfig(ctx);
    const db = ctx.get(SERVICE_DATABASE_SERVICE);
    if (!db) requireDatabase();
    ctx.provide(SERVICE_SERVER_SERVICE, await createJobRuntimeServer(config, db));
  },
});

/** cron-scheduler: pg + cron owner + scheduler + fastify surface. */
export const cronServiceNode: CapabilityNode = defineNode({
  id: 'cron-service',
  provides: SERVICE_SERVER_SERVICE,
  inject: [SERVICE_CONFIG_SERVICE, SERVICE_DATABASE_SERVICE],
  topology: 'embedded',
  apply: async (ctx) => {
    const config = requireConfig(ctx);
    const db = ctx.get(SERVICE_DATABASE_SERVICE);
    if (!db) requireDatabase();
    ctx.provide(SERVICE_SERVER_SERVICE, await createCronServer(config, db));
  },
});

/** job-runtime worker sub-node declarations (D7 worker children). */
export const candidateProcessingWorkerNode: CapabilityNode = defineNode({
  id: 'candidate-processing',
  provides: 'candidateProcessingWorker',
  topology: 'embedded',
  apply(_ctx) {
    // Worker behavior is embedded in the job-runtime server (ownsWork: true);
    // this just declares the sub-node in the assembly topology (D7 container shape).
  },
});

export const governanceFeedbackWorkerNode: CapabilityNode = defineNode({
  id: 'governance-feedback',
  provides: 'governanceFeedbackWorker',
  topology: 'embedded',
  apply(_ctx) {},
});

export const conflictDetectionWorkerNode: CapabilityNode = defineNode({
  id: 'conflict-detection',
  provides: 'conflictDetectionWorker',
  topology: 'embedded',
  apply(_ctx) {},
});

export const outboxDispatchWorkerNode: CapabilityNode = defineNode({
  id: 'outbox-dispatch',
  provides: 'outboxDispatchWorker',
  topology: 'embedded',
  apply(_ctx) {},
});
