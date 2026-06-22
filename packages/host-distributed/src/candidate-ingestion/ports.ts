import type { CandidateIngestionDeps } from '@trapmap/backend-core';
import { createInternalServiceClients } from '@trapmap/host-distributed/gateway/internal-client.js';
import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import type { ServicePortImplementations } from '@trapmap/host-distributed/shared/ports.js';
import { createRemoteKnowledgeWriteClient } from '@trapmap/host-distributed/shared/internal-knowledge-write-client.js';

export function createCandidateIngestionDeps(
  ports: ServicePortImplementations,
  config: ServiceConfig,
): CandidateIngestionDeps {
  const internalClients = createInternalServiceClients(config.internalUrls);

  return {
    candidateRepo: ports.repos.candidate,
    auditLog: ports.auditLog,
    knowledgeWrite: createRemoteKnowledgeWriteClient(internalClients),
    jobRuntime: {
      schedule: async (type, payload, options) =>
        String(await ports.queuePorts.task.enqueue(type, payload, options)),
    },
  };
}
