import type { FastifyInstance } from 'fastify';

import type { ServerConfig } from '../config.js';
import { accessKeyRoutes } from './access-keys.js';
import { adminBenchmarkRoutes } from './admin-benchmark.js';
import { adminBoundarySearchRoutes } from './admin-boundary-search.js';
import { authRoutes } from './auth.js';
import { decayRoutes } from './decay.js';
import { evidenceRoutes } from './evidence.js';
import { knowledgeRoutes } from './knowledge.js';
import { maintenanceRoutes } from './maintenance.js';
import { memberRoutes } from './members.js';
import { operationsRoutes } from './operations.js';
import { retrievalRoutes } from './retrieval.js';
import { teamRoutes } from './teams.js';
import { trapRoutes } from './traps.js';

export async function registerCapabilityRoutes(app: FastifyInstance, config: ServerConfig) {
  const capabilities = config.deployment.resolved.capabilities;

  if (!capabilities.exposesGateway) {
    return;
  }

  await app.register(retrievalRoutes);

  if (capabilities.routeSurface === 'minimal-agent') {
    return;
  }

  await app.register(authRoutes);
  await app.register(teamRoutes);
  await app.register(memberRoutes);
  await app.register(accessKeyRoutes);
  await app.register(trapRoutes);
  await app.register(knowledgeRoutes);

  if (!capabilities.supportsReviewGovernance) {
    return;
  }

  await app.register(evidenceRoutes);
  await app.register(operationsRoutes);
  await app.register(decayRoutes);
  await app.register(maintenanceRoutes);
  await app.register(adminBenchmarkRoutes);
  await app.register(adminBoundarySearchRoutes);
}
