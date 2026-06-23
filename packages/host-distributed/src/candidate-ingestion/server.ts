import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import { createInternalServiceClients } from '@trapmap/host-distributed/gateway/internal-client.js';
import type { ServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { createRemoteKnowledgeWriteClient } from '@trapmap/host-distributed/shared/internal-knowledge-write-client.js';
import { createServicePorts } from '@trapmap/host-distributed/shared/ports.js';
import {
  createCandidateIngestionDeps,
  createCandidateIngestionServer,
} from '@trapmap/service-candidate-ingestion';

export interface CandidateIngestionServer {
  app: Awaited<ReturnType<typeof createCandidateIngestionServer>>['app'];
  start(): Promise<void>;
  close(): Promise<void>;
}

export async function createServer(
  config: ServiceConfig,
  db: ServiceDatabase,
): Promise<CandidateIngestionServer> {
  const ports = createServicePorts(db.pool);
  const internalClients = createInternalServiceClients(config.internalUrls);
  const deps = createCandidateIngestionDeps({
    candidateRepo: ports.repos.candidate,
    auditLog: ports.auditLog,
    knowledgeWrite: createRemoteKnowledgeWriteClient(internalClients),
    jobRuntime: {
      schedule: async (type, payload, options) =>
        String(await ports.queuePorts.task.enqueue(type, payload, options)),
    },
  });
  return createCandidateIngestionServer(config, deps);
}
