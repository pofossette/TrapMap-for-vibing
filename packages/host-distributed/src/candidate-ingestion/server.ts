import { randomUUID } from 'node:crypto';
import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import { createInternalServiceClients } from '@trapmap/host-distributed/gateway/internal-client.js';
import type { ServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { createRemoteKnowledgeWriteClient } from '@trapmap/host-distributed/shared/internal-knowledge-write-client.js';
import { createRemoteJobRuntimeClient } from '@trapmap/host-distributed/shared/internal-job-runtime-client.js';
import { attachRuntimeMetricsRoute } from '@trapmap/host-distributed/shared/observability.js';
import {
  createCandidateProcessingRuntime,
  createCandidateIngestionDeps,
  createCandidateIngestionPgOwnerBundle,
  createCandidateIngestionServer,
} from '@trapmap/service-candidate-ingestion';
import type { TaskHandler, TaskQueuePort } from '@trapmap/backend-core';
import { createIdentityAccessPgDeps } from '@trapmap/service-identity-access';
import { createCandidateCorpusPgReadPort } from '@trapmap/service-knowledge-read';
import { createPostgresTaskTransport, type AsyncTaskTransport } from '@trapmap/runtime-infra';
import { attachRuntimeTelemetry } from '../shared/telemetry.js';

export interface CandidateIngestionServer {
  app: Awaited<ReturnType<typeof createCandidateIngestionServer>>['app'];
  start(): Promise<void>;
  close(): Promise<void>;
}

function createTaskQueuePort(
  transport: AsyncTaskTransport,
): Pick<TaskQueuePort, 'enqueue' | 'createConsumer'> {
  return {
    enqueue: (type, payload, options) => transport.enqueue(type, payload, options),
    async createConsumer(params) {
      if (!transport.createConsumer) {
        throw new Error('Candidate task transport does not support consumers');
      }
      return transport.createConsumer({
        ownsWork: params.ownsWork,
        handlers: params.handlers.map((handler) => ({
          type: handler.type,
          handle: (task, signal) =>
            handler.handle(
              {
                id: task.id,
                type: task.type,
                payload: task.payload,
                attempt: task.attempts,
              },
              signal,
            ),
          ...(handler.onDead ? { onDead: (task) => handler.onDead?.(task) } : {}),
        })) as TaskHandler<unknown>[],
      });
    },
  };
}

export async function createServer(
  config: ServiceConfig,
  db: ServiceDatabase,
): Promise<CandidateIngestionServer> {
  const identity = createIdentityAccessPgDeps(db.pool, { systemAdminKey: config.systemAdminKey });
  const candidateIngestion = createCandidateIngestionPgOwnerBundle(db.pool);
  const internalClients = createInternalServiceClients(config.internalUrls);
  const deps = createCandidateIngestionDeps({
    candidateRepo: candidateIngestion.candidateRepo,
    auditLog: identity.auditLog,
    knowledgeWrite: createRemoteKnowledgeWriteClient(internalClients, {
      transport: config.internalTransports.knowledgeWrite,
    }),
    jobRuntime: createRemoteJobRuntimeClient(internalClients),
  });
  const server = await createCandidateIngestionServer(config, deps);
  const taskTransport = createPostgresTaskTransport(db.pool);
  const processing = createCandidateProcessingRuntime({
    candidateRepo: candidateIngestion.candidateRepo,
    corpus: createCandidateCorpusPgReadPort(db.pool),
    now: () => new Date().toISOString(),
    createId: randomUUID,
    queue: createTaskQueuePort(taskTransport),
  });
  attachRuntimeMetricsRoute(server.app);
  await attachRuntimeTelemetry(server.app, 'candidate-ingestion');
  return {
    app: server.app,
    async start() {
      await processing.start();
      await server.start();
    },
    async close() {
      await processing.close();
      await server.close();
    },
  };
}
