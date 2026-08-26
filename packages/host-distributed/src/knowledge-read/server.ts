import { registerFastifyRoutes } from '@trapmap/backend-core';
/**
 * Host adapter for the knowledge-read service (Phase 3 convergence).
 *
 * Mirrors the other per-service host adapters: `createServer(config, db)`
 * builds the knowledge-read server from the shared dB pool and exposed deps,
 * attaching metrics + telemetry. The legacy bootstrap logic that lived in
 * `index.ts` moved here so the distributed profile can wire it as a node.
 */
import type { ServiceConfig } from '@trapmap/host-distributed/config/index.js';
import type { ServiceDatabase } from '@trapmap/host-distributed/shared/database.js';
import { attachRuntimeMetricsRoute } from '@trapmap/host-distributed/shared/observability.js';
import { createDeterministicFallbackVector } from '@trapmap/lib';
import {
  createKnowledgeReadDeps,
  createKnowledgeReadServer,
} from '@trapmap/service-knowledge-read';
import {
  createExperienceGeneRouteDefs,
  createPgExperienceGeneSearchPort,
} from '@trapmap/service-knowledge-read';
import { createExperienceGeneOtelMetrics } from '../gateway/internal-observability.js';
import { attachRuntimeTelemetry } from '../shared/telemetry.js';
import { createConvergedKnowledgeReadQueries } from './converged-retrieval.js';
import { createPgKnowledgeReadProjection } from './ports.js';

export async function createKnowledgeReadServerAdapter(
  config: ServiceConfig,
  db: ServiceDatabase,
): ReturnType<typeof createKnowledgeReadServer> {
  const deps = createKnowledgeReadDeps({
    knowledgeRepo: createPgKnowledgeReadProjection(db.pool),
    ...createConvergedKnowledgeReadQueries(db.pool),
  });
  const server = await createKnowledgeReadServer(config, deps);
  registerFastifyRoutes(
    server.app,
    createExperienceGeneRouteDefs({
      mode: config.experienceGenesMode,
      searchGenes: createPgExperienceGeneSearchPort({
        pool: db.pool,
        embed: async (seed) => createDeterministicFallbackVector(seed),
        metrics: createExperienceGeneOtelMetrics(),
        mode: config.experienceGenesMode,
      }).searchGenes,
    }),
    {},
  );
  attachRuntimeMetricsRoute(server.app);
  await attachRuntimeTelemetry(server.app, 'knowledge-read');
  return server;
}
