import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import { createInternalServiceClients } from '@trapmap/host-distributed/gateway/internal-client.js';
import { createRemoteKnowledgeWriteClient } from '@trapmap/host-distributed/shared/internal-knowledge-write-client.js';
import {
  createGovernanceConflictWorkflow,
  type GovernanceReviewServiceDeps,
} from '@trapmap/service-governance-review';
import {
  createGovernanceReviewDeps as createServiceGovernanceReviewDeps,
  type GovernanceReviewPgOwnerBundle,
} from '@trapmap/service-governance-review';
import type { IdentityAccessPortDeps } from '@trapmap/service-identity-access';

import { createDistributedGovernanceConflictReadPort } from './conflict-read.js';

export function createGovernanceReviewDeps(
  owner: GovernanceReviewPgOwnerBundle,
  config: ServiceConfig,
  identity: Pick<IdentityAccessPortDeps, 'auditLog'>,
): GovernanceReviewServiceDeps {
  const internalClients = createInternalServiceClients(config.internalUrls);
  const conflictWorkflow = createGovernanceConflictWorkflow({
    read: createDistributedGovernanceConflictReadPort(internalClients),
    projection: owner.conflictProjection,
  });

  return createServiceGovernanceReviewDeps({
    knowledgeWrite: createRemoteKnowledgeWriteClient(internalClients, {
      transport: config.internalTransports.knowledgeWrite,
    }),
    feedbackRepo: owner.feedbackRepo,
    auditLog: identity.auditLog,
    conflictWorkflow,
    governanceRetrievalProjection: owner.retrievalProjection,
  });
}
