import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import { createInternalServiceClients } from '@trapmap/host-distributed/gateway/internal-client.js';
import { createRemoteKnowledgeWriteClient } from '@trapmap/host-distributed/shared/internal-knowledge-write-client.js';
import type { GovernanceReviewDeps } from '@trapmap/service-governance-review';
import {
  createGovernanceReviewDeps as createServiceGovernanceReviewDeps,
  type GovernanceReviewPgOwnerBundle,
} from '@trapmap/service-governance-review';

export function createGovernanceReviewDeps(
  owner: GovernanceReviewPgOwnerBundle,
  config: ServiceConfig,
): GovernanceReviewDeps {
  const internalClients = createInternalServiceClients(config.internalUrls);

  return createServiceGovernanceReviewDeps({
    knowledgeWrite: createRemoteKnowledgeWriteClient(internalClients, {
      transport: config.internalTransports.knowledgeWrite,
    }),
    feedbackRepo: owner.feedbackRepo,
    auditLog: ports.auditLog,
  });
}
