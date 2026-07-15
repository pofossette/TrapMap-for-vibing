/**
 * Bootstrap repositories — create all repos and ensure vector index.
 *
 * This must run BEFORE any other startup step that depends on repositories
 * (candidate recovery, task workers, lifecycle subscribers).
 */

import type { FastifyInstance } from 'fastify';

import { createUsageAnalyticsRepository } from '@trapmap/server/lib/analytics/index.js';
import {
  createFailOpenGraphQueryBackend,
  createGraphQueryRuntimeState,
  createMemoryGraphQueryBackend,
  createNeo4jGraphQueryBackend,
} from '@trapmap/server/lib/graph-query/index.js';
import { artifactGraphIndexAdapter } from '@trapmap/server/lib/indexing/adapters/artifact-graph.js';
import { createCapsuleIndexAdapter } from '@trapmap/server/lib/indexing/adapters/capsule-index.js';
import { registerArtifactAdapters } from '@trapmap/server/lib/indexing/artifact-pipeline.js';
import { createKnowledgeRepository } from '@trapmap/server/lib/knowledge/index.js';
import { createAllRepos } from '@trapmap/server/lib/repos/index.js';
import { ensureCapsuleVectorIndex } from '@trapmap/server/lib/retrieval/capsules/repositories/pg-capsule-vector.js';
import { ensureVectorIndex } from '@trapmap/server/lib/retrieval/recall/db-search.js';
import { createGraphChannel } from '@trapmap/server/lib/retrieval/recall/graph-assisted.js';
import { executeWithResilience } from '@trapmap/server/lib/runtime/index.js';
import { getStorePool } from '@trapmap/server/lib/store.js';

export async function bootstrapRepositories(app: FastifyInstance): Promise<void> {
  const store = app.skillShareer.store;
  const pool = getStorePool(store);

  const startupContext = {
    logger: app.log,
    route: 'startup:bootstrap-repositories',
  } as const;

  if (pool) {
    // Legacy flat repo properties — compatibility-only, prefer `repos.*` for new code
    app.skillShareer.knowledgeRepo = createKnowledgeRepository({ pool, store });
    app.skillShareer.usageAnalyticsRepo = await createUsageAnalyticsRepository({ pool });

    // Ensure HNSW vector index exists for O(log n) similarity search
    const vectorIndexResult = await executeWithResilience({
      policy: {
        dependencyName: 'vector-index-bootstrap',
        timeoutMs: 10_000,
        maxAttempts: 1,
        backoffMs: () => 0,
        failureMode: 'fail-open',
      },
      context: startupContext,
      operation: async (_signal) => {
        await ensureVectorIndex(pool);
        return 'ok';
      },
      fallbackValue: 'degraded',
    });
    if (vectorIndexResult.ok && !vectorIndexResult.degraded) {
      app.log.info('Vector HNSW index ensured');
    }

    // Ensure capsule HNSW vector index exists for capsule semantic recall
    const capsuleIndexResult = await executeWithResilience({
      policy: {
        dependencyName: 'capsule-vector-index-bootstrap',
        timeoutMs: 10_000,
        maxAttempts: 1,
        backoffMs: () => 0,
        failureMode: 'fail-open',
      },
      context: startupContext,
      operation: async (_signal) => {
        return (await ensureCapsuleVectorIndex(pool)) ? 'ok' : 'skipped';
      },
      fallbackValue: 'degraded',
    });
    if (
      capsuleIndexResult.ok &&
      !capsuleIndexResult.degraded &&
      capsuleIndexResult.value === 'ok'
    ) {
      app.log.info('Capsule vector HNSW index ensured');
    }

    registerArtifactAdapters([artifactGraphIndexAdapter, createCapsuleIndexAdapter({ pool })]);
  } else {
    registerArtifactAdapters([artifactGraphIndexAdapter]);
  }

  // Create unified repos object (both JSON and PG modes)
  if (pool) {
    app.skillShareer.repos = await createAllRepos({
      store,
      pool,
      artifactReadProjection: app.skillShareer.artifactReadProjection,
    });
  } else {
    app.skillShareer.repos = await createAllRepos({
      store,
      artifactReadProjection: app.skillShareer.artifactReadProjection,
    });
  }

  const memoryBackend = createMemoryGraphQueryBackend(app.skillShareer.repos.graphIndex);
  app.skillShareer.graphQueryBackend = memoryBackend;

  if (app.skillShareer.config.graphDb.enabled) {
    const primaryBackend = await createNeo4jGraphQueryBackend({
      config: {
        database: app.skillShareer.config.graphDb.database,
        password: app.skillShareer.config.graphDb.password!,
        uri: app.skillShareer.config.graphDb.uri!,
        username: app.skillShareer.config.graphDb.username!,
      },
      graphIndexRepo: app.skillShareer.repos.graphIndex,
    });
    const graphBackend = createFailOpenGraphQueryBackend({
      primary: primaryBackend,
      fallback: memoryBackend,
      failOpen: app.skillShareer.config.graphDb.failOpen,
      logger: app.log,
    });
    const healthResult = await executeWithResilience({
      policy: {
        dependencyName: 'graph-backend-healthcheck',
        timeoutMs: 10_000,
        maxAttempts: 1,
        backoffMs: () => 0,
        failureMode: app.skillShareer.config.graphDb.failOpen ? 'fail-open' : 'fail-closed',
      },
      context: startupContext,
      operation: async (_signal) => graphBackend.healthcheck(),
      isSuccessfulResult: (health) => health.ok,
      fallbackValue: {
        ok: false,
        mode: 'enabled-fallback',
        detail: 'Graph backend healthcheck degraded to fallback',
      },
    });
    const health =
      healthResult.value ??
      ({ ok: false, mode: 'enabled-fallback', detail: 'Unknown healthcheck failure' } as const);

    if (!healthResult.ok && !app.skillShareer.config.graphDb.failOpen) {
      throw new Error(health.detail ?? 'Graph query backend healthcheck failed');
    }

    app.skillShareer.graphQueryBackend = graphBackend;
    app.skillShareer.graphQuery = createGraphQueryRuntimeState(app.skillShareer.config.graphDb, {
      ...(health.detail !== undefined ? { detail: health.detail } : {}),
      fallbackActive: health.mode === 'enabled-fallback',
    });
  }

  app.log.info(
    {
      backendKind: app.skillShareer.graphQuery.backendKind,
      failOpen: app.skillShareer.graphQuery.failOpen,
      graphQueryMode: app.skillShareer.graphQuery.mode,
      syncOnWrite: app.skillShareer.config.graphDb.syncOnWrite,
      ...(app.skillShareer.graphQuery.detail ? { detail: app.skillShareer.graphQuery.detail } : {}),
    },
    'Graph query backend initialized',
  );

  // Register graph channel now that repos are available
  app.skillShareer.channelRegistry.register(createGraphChannel(app.skillShareer.graphQueryBackend));
}
