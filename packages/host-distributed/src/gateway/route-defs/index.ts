import type { RouteDef } from '@trapmap/backend-core';
import type { InternalServiceClients } from '../internal-client/index.js';
import { createCandidateRoutes } from './candidate.js';
import { createCronRoutes } from './cron.js';
import { createGovernanceRoutes } from './governance.js';
import { createIdentityRoutes } from './identity.js';
import { createJobRoutes } from './job.js';
import { createKnowledgeRoutes } from './knowledge.js';

export function createGatewayRouteDefs(_clients: InternalServiceClients): RouteDef[] {
  return [
    ...createKnowledgeRoutes(),
    ...createIdentityRoutes(),
    ...createCandidateRoutes(),
    ...createGovernanceRoutes(),
    ...createJobRoutes(),
    ...createCronRoutes(),
  ];
}

// Re-export shared helpers for backward compatibility
export * from './shared.js';
