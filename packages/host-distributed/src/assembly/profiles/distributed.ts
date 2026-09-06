/**
 * Distributed-host profile builder (Phase 3 assembly convergence, design D3).
 *
 * {@link distributedAssembly} composes the host-distributed nodes for a
 * single service process into an {@link AssemblyBuilder}. Each case embeds
 * the service's own pg/config/database + server node in-process, per the
 * distributed deployment shape.
 *
 * Design note (deviation, behavior-preserving): the legacy starters each
 * wired `loadServiceConfig → createServiceDatabase → <createDeps> →
 * create<X>Server(config, db)` inline. Phase 3 relocates that shared sequence
 * into the node layer here (config/database nodes + per-service server nodes),
 * so `start<X>Service()` becomes a thin caller of
 * {@link startDistributedService}. The per-service `server.ts` host adapters
 * are reused verbatim (they already attach metrics + runtime telemetry), which
 * keeps runtime semantics identical to the pre-convergence paths.
 */

import type { Assembly, CapabilityNode } from '@trapmap/assembly';
import { createAssembly, judgmentContracts } from '@trapmap/assembly';

import {
  ALL_SERVICES,
  loadServiceConfig,
  type ServiceConfig,
  type ServiceName,
} from '../../config/index.js';
import type { DistributedServiceHandle } from '../../runner.js';
import {
  candidateIngestionServiceNode,
  candidateProcessingWorkerNode,
  conflictDetectionWorkerNode,
  cronServiceNode,
  gatewayServiceNode,
  governanceFeedbackWorkerNode,
  governanceReviewServiceNode,
  identityAccessServiceNode,
  jobRuntimeServiceNode,
  knowledgeReadServiceNode,
  knowledgeWriteServiceNode,
  outboxDispatchWorkerNode,
  SERVICE_SERVER_SERVICE,
} from '../nodes/distributed-service-nodes.js';
import {
  candidateIngestionJudgmentNodes,
  governanceReviewJudgmentNodes,
  knowledgeReadJudgmentNodes,
  knowledgeWriteJudgmentNodes,
} from '../nodes/judgment-nodes.js';
import { SERVICE_CONFIG_SERVICE, serviceConfigNode } from '../nodes/service-config.js';
import { SERVICE_DATABASE_SERVICE, serviceDatabaseNode } from '../nodes/service-database.js';

/** Worker sub-nodes attached to the job-runtime container (D7). */
const JOB_RUNTIME_WORKER_CHILDREN: readonly CapabilityNode[] = [
  candidateProcessingWorkerNode,
  governanceFeedbackWorkerNode,
  conflictDetectionWorkerNode,
  outboxDispatchWorkerNode,
];

export interface DistributedAssemblyOptions {
  /** Prebuilt config override (defaults to {@link loadServiceConfig} when absent). */
  config?: ServiceConfig;
}

/** Service node per distributed service name (design D3 mapping). */
const SERVICE_NODE: Record<ServiceName, CapabilityNode> = {
  gateway: gatewayServiceNode,
  'identity-access': identityAccessServiceNode,
  'knowledge-read': knowledgeReadServiceNode,
  'knowledge-write': knowledgeWriteServiceNode,
  'candidate-ingestion': candidateIngestionServiceNode,
  'governance-review': governanceReviewServiceNode,
  'job-runtime': jobRuntimeServiceNode,
  'cron-scheduler': cronServiceNode,
};

/** Services that own their own PostgreSQL pool (gateway delegates upstream). */
const DB_BACKED_SERVICES: ReadonlySet<ServiceName> = new Set(
  ALL_SERVICES.filter((name) => name !== 'gateway'),
);

/** Judgment nodes owned by each distributed service process (D8). */
function judgmentNodesFor(serviceName: ServiceName): readonly CapabilityNode[] {
  switch (serviceName) {
    case 'knowledge-read':
      return knowledgeReadJudgmentNodes;
    case 'candidate-ingestion':
      return candidateIngestionJudgmentNodes;
    case 'governance-review':
      return governanceReviewJudgmentNodes;
    case 'knowledge-write':
      return knowledgeWriteJudgmentNodes;
    default:
      return [];
  }
}

/**
 * Build an assembly for the named distributed service. Call `.build()` to run
 * startup checks, then `.boot()` to mount the nodes.
 */
export function distributedAssembly(
  serviceName: ServiceName,
  options: DistributedAssemblyOptions = {},
): ReturnType<typeof createAssembly> {
  const builder = createAssembly({ contracts: judgmentContracts }).add(serviceConfigNode, {
    serviceName,
    ...(options.config !== undefined ? { config: options.config } : {}),
  });
  if (DB_BACKED_SERVICES.has(serviceName)) {
    builder.add(serviceDatabaseNode);
  }
  builder.add(SERVICE_NODE[serviceName]);
  for (const node of judgmentNodesFor(serviceName)) {
    // Same as host-local: rule-node schemas are all-defaulted, apply ignores config.
    builder.add(node, {});
  }
  if (serviceName === 'job-runtime') {
    for (const worker of JOB_RUNTIME_WORKER_CHILDREN) {
      builder.add(worker);
    }
  }
  return builder;
}

/** Build (startup-check) the assembly for the named service. */
export function buildDistributedAssembly(
  serviceName: ServiceName,
  options: DistributedAssemblyOptions = {},
): Assembly {
  return distributedAssembly(serviceName, options).build();
}

/**
 * Boot the named distributed service and return a {@link DistributedServiceHandle}.
 *
 * This is the shared closure that every `start<X>Service()` thin caller uses,
 * preserving the legacy boot sequence (config → db → server start) and the
 * returned handle shape.
 */
export async function startDistributedService(
  serviceName: ServiceName,
  options: DistributedAssemblyOptions = {},
): Promise<DistributedServiceHandle> {
  const running = await distributedAssembly(serviceName, options).build().boot();
  // Server/config/database nodes are async (server creation binds ports,
  // database creation connects pools) and cordis does not await providing
  // fibers, so their tokens land after boot() resolves. Wait for them with
  // a bound instead of racing ctx.get() (same pattern as host-local main).
  const deadline = Date.now() + 30_000;
  const waitFor = async <T>(token: string): Promise<T | undefined> => {
    let value: T | undefined = running.ctx.get(token);
    while (value === undefined && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      value = running.ctx.get(token);
    }
    return value;
  };
  const config = await waitFor<ServiceConfig>(SERVICE_CONFIG_SERVICE);
  const server = await waitFor<{ start(): Promise<void>; close(): Promise<void> }>(
    SERVICE_SERVER_SERVICE,
  );
  if (!config || !server) {
    await running.dispose().catch(() => undefined);
    throw new Error(
      `Distributed assembly boot did not produce config/server (service=${serviceName})`,
    );
  }
  await startServer({ server });

  const db = DB_BACKED_SERVICES.has(serviceName)
    ? await waitFor<NonNullable<DistributedServiceHandle['db']>>(SERVICE_DATABASE_SERVICE)
    : running.ctx.get(SERVICE_DATABASE_SERVICE);
  if (DB_BACKED_SERVICES.has(serviceName) && !db) {
    await running.dispose().catch(() => undefined);
    throw new Error(
      `Distributed assembly boot did not produce a database (service=${serviceName})`,
    );
  }
  const result: DistributedServiceHandle = db ? { config, db, server } : { config, server };
  return result;
}

async function startServer(handle: { server: { start(): Promise<void> } }): Promise<void> {
  await handle.server.start();
}
