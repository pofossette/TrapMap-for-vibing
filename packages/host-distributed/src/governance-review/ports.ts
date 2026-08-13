import type { ArtifactReadProjection, KnowledgeOwnerPort } from '@trapmap/contracts';
import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import { createInternalServiceClients } from '@trapmap/host-distributed/gateway/internal-client.js';
import { createRemoteJobRuntimeClient } from '@trapmap/host-distributed/shared/internal-job-runtime-client.js';
import { createRemoteKnowledgeWriteClient } from '@trapmap/host-distributed/shared/internal-knowledge-write-client.js';
import {
  type GovernanceReviewServiceDeps,
  createGovernanceAsyncCommandModule,
  createGovernanceConflictWorkflow,
  createGovernanceReviewAdminModule,
} from '@trapmap/service-governance-review';
import {
  type GovernanceReviewPgOwnerBundle,
  createGovernanceReviewDeps as createServiceGovernanceReviewDeps,
} from '@trapmap/service-governance-review';
import type { IdentityAccessPortDeps } from '@trapmap/service-identity-access';

import { toInvocationError } from '../shared/invocation-error.js';
import { createDistributedGovernanceConflictReadPort } from './conflict-read.js';

export function createDistributedGovernanceKnowledgeReadPort(
  clients: Pick<ReturnType<typeof createInternalServiceClients>, 'knowledgeRead'>,
): Pick<KnowledgeOwnerPort, 'getById'> {
  return {
    async getById(entryId) {
      const response = await clients.knowledgeRead.getById(entryId);
      if (response.status === 404) return null;
      if (response.status < 200 || response.status >= 300) {
        throw toInvocationError(response.body, 'knowledge-read entry projection failed');
      }
      return response.body as Awaited<ReturnType<KnowledgeOwnerPort['getById']>>;
    },
  };
}

export function createDistributedGovernanceArtifactReadProjection(
  clients: Pick<ReturnType<typeof createInternalServiceClients>, 'knowledgeWrite'>,
): Pick<ArtifactReadProjection, 'getById'> {
  return {
    async getById(artifactId) {
      const response = await clients.knowledgeWrite.getArtifactById(artifactId);
      if (response.status === 404) return null;
      if (response.status < 200 || response.status >= 300) {
        throw toInvocationError(response.body, 'knowledge-write artifact projection failed');
      }
      return response.body as Awaited<ReturnType<ArtifactReadProjection['getById']>>;
    },
  };
}

export function createGovernanceReviewDeps(
  owner: GovernanceReviewPgOwnerBundle,
  config: ServiceConfig,
  identity: Pick<IdentityAccessPortDeps, 'auditLog'>,
): GovernanceReviewServiceDeps {
  const internalClients = createInternalServiceClients(config.internalUrls);
  const knowledgeRead = createDistributedGovernanceKnowledgeReadPort(internalClients);
  const artifactReadProjection = createDistributedGovernanceArtifactReadProjection(internalClients);
  const knowledgeWrite = createRemoteKnowledgeWriteClient(internalClients, {
    transport: config.internalTransports.knowledgeWrite,
  });
  const jobRuntime = createRemoteJobRuntimeClient(internalClients);
  const asyncCommands = createGovernanceAsyncCommandModule({
    feedbackRepo: owner.feedbackRepo,
    auditLog: identity.auditLog,
  });
  const admin = createGovernanceReviewAdminModule({
    feedbackRepo: owner.feedbackRepo,
    knowledgeRead,
    artifactReadProjection,
    knowledgeWrite,
    jobRuntime,
    auditLog: identity.auditLog,
  });
  const conflictWorkflow = createGovernanceConflictWorkflow({
    read: createDistributedGovernanceConflictReadPort(internalClients),
    projection: owner.conflictProjection,
  });

  return createServiceGovernanceReviewDeps({
    knowledgeWrite,
    feedbackRepo: owner.feedbackRepo,
    auditLog: identity.auditLog,
    asyncCommands,
    admin,
    conflictWorkflow,
    governanceRetrievalProjection: owner.retrievalProjection,
  });
}
