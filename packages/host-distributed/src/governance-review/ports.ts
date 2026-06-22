import type { GovernanceReviewDeps } from '@trapmap/backend-core';
import { createInternalServiceClients } from '@trapmap/host-distributed/gateway/internal-client.js';
import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import { createRemoteKnowledgeWriteClient } from '@trapmap/host-distributed/shared/internal-knowledge-write-client.js';
import type { ServicePortImplementations } from '@trapmap/host-distributed/shared/ports.js';

export function createGovernanceReviewDeps(
  ports: ServicePortImplementations,
  config: ServiceConfig,
): GovernanceReviewDeps {
  const internalClients = createInternalServiceClients(config.internalUrls);

  return {
    knowledgeWrite: createRemoteKnowledgeWriteClient(internalClients),
    feedbackRepo: ports.repos.feedback,
    auditLog: ports.auditLog,
  };
}
