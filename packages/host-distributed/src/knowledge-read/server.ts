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
import {
  createKnowledgeReadDeps,
  createKnowledgeReadServer,
} from '@trapmap/service-knowledge-read';
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
  attachRuntimeMetricsRoute(server.app);
  await attachRuntimeTelemetry(server.app, 'knowledge-read');
  return server;
}
