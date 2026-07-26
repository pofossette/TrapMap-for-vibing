/**
 * Bootstrap graph reconciliation — reconcile graph indexes on startup.
 *
 * Runs AFTER repositories are initialized so that store is available
 * for graph index operations.
 */

import type { FastifyInstance } from 'fastify';

import { reconcileGraphIndexesFromOwners } from '@trapmap/server/lib/indexing/reconcile.js';

export async function bootstrapGraphReconciliation(app: FastifyInstance): Promise<void> {
  try {
    const syncProjection =
      app.skillShareer.config.graphDb.enabled && app.skillShareer.config.graphDb.syncOnWrite;
    if (!app.skillShareer.knowledgeOwner || !app.skillShareer.artifactReadProjection) {
      throw new Error('Graph reconciliation requires knowledge and artifact owner projections');
    }
    const result = await reconcileGraphIndexesFromOwners({
      knowledgeOwner: app.skillShareer.knowledgeOwner,
      artifactReadProjection: app.skillShareer.artifactReadProjection,
      graphIndex: app.skillShareer.graphIndex,
      graphQueryBackend: app.skillShareer.graphQueryBackend,
      syncProjection,
    });
    app.log.info(
      { removed: result.documentsRemoved, rebuilt: result.documentsRebuilt },
      'Graph index reconciliation complete',
    );
  } catch (error) {
    app.log.error({ error }, 'Graph index reconciliation failed');
  }
}
