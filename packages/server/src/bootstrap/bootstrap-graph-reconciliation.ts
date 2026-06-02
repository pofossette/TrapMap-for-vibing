/**
 * Bootstrap graph reconciliation — reconcile graph indexes on startup.
 *
 * Runs AFTER repositories are initialized so that store is available
 * for graph index operations.
 */

import type { FastifyInstance } from 'fastify';

import { reconcileGraphIndexes } from '@trapmap/server/lib/indexing/reconcile.js';

export async function bootstrapGraphReconciliation(app: FastifyInstance): Promise<void> {
  try {
    const result = await reconcileGraphIndexes({
      store: app.skillShareer.store,
      graphIndexRepo: app.skillShareer.repos.graphIndex,
      graphQueryBackend: app.skillShareer.graphQueryBackend,
      syncProjection:
        app.skillShareer.config.graphDb.enabled && app.skillShareer.config.graphDb.syncOnWrite,
    });
    app.log.info(
      { removed: result.documentsRemoved, rebuilt: result.documentsRebuilt },
      'Graph index reconciliation complete',
    );
  } catch (error) {
    app.log.error({ error }, 'Graph index reconciliation failed');
  }
}
