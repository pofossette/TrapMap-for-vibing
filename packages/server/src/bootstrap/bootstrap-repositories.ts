/**
 * Bootstrap repositories — run migrations, create all repos, ensure vector index.
 *
 * This must run BEFORE any other startup step that depends on repositories
 * (candidate recovery, task workers, lifecycle subscribers).
 */

import type { FastifyInstance } from 'fastify';

import { createUsageAnalyticsRepository } from '@trapmap/server/lib/analytics/index.js';
import { createArtifactRepository } from '@trapmap/server/lib/artifacts/index.js';
import {
  createAccessKeyRepository,
  createSessionRepository,
} from '@trapmap/server/lib/auth/index.js';
import { createGraphQueryRuntimeState } from '@trapmap/server/lib/graph-query/config.js';
import { createFailOpenGraphQueryBackend } from '@trapmap/server/lib/graph-query/health.js';
import { createMemoryGraphQueryBackend } from '@trapmap/server/lib/graph-query/memory-backend.js';
import { createNeo4jGraphQueryBackend } from '@trapmap/server/lib/graph-query/neo4j-backend.js';
import { artifactGraphIndexAdapter } from '@trapmap/server/lib/indexing/adapters/artifact-graph.js';
import { createCapsuleIndexAdapter } from '@trapmap/server/lib/indexing/adapters/capsule-index.js';
import { registerArtifactAdapters } from '@trapmap/server/lib/indexing/artifact-pipeline.js';
import { createKnowledgeRepository } from '@trapmap/server/lib/knowledge/index.js';
import { runMigrations } from '@trapmap/server/lib/persistence/migration-runner.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import { createAllRepos } from '@trapmap/server/lib/repos/index.js';
import { ensureCapsuleVectorIndex } from '@trapmap/server/lib/retrieval/capsules/repositories/pg-capsule-vector.js';
import { ensureVectorIndex } from '@trapmap/server/lib/retrieval/recall/db-search.js';
import { createGraphChannel } from '@trapmap/server/lib/retrieval/recall/graph-assisted.js';
import {
  createMembershipRepository,
  createTeamRepository,
} from '@trapmap/server/lib/teams/index.js';
import { createUserRepository } from '@trapmap/server/lib/users/index.js';

export async function bootstrapRepositories(app: FastifyInstance): Promise<void> {
  const store = app.skillShareer.store;

  if (store instanceof PostgresStore) {
    const pool = store.getPool();

    // Run Drizzle migrations before any repository access
    try {
      await runMigrations(pool);
      app.log.info('Database migrations applied');
    } catch (error) {
      app.log.error({ error }, 'Failed to apply database migrations');
      throw error;
    }

    // Legacy flat repo properties — compatibility-only, prefer `repos.*` for new code
    app.skillShareer.knowledgeRepo = createKnowledgeRepository({ pool, store });
    app.skillShareer.artifactRepo = createArtifactRepository({ pool, store });
    app.skillShareer.sessionRepo = createSessionRepository({ pool, store });
    app.skillShareer.accessKeyRepo = createAccessKeyRepository({ pool, store });
    app.skillShareer.userRepo = createUserRepository({ pool, store });
    app.skillShareer.teamRepo = createTeamRepository({ pool, store });
    app.skillShareer.membershipRepo = createMembershipRepository({ pool, store });
    app.skillShareer.usageAnalyticsRepo = await createUsageAnalyticsRepository({ pool });

    // Ensure HNSW vector index exists for O(log n) similarity search
    try {
      await ensureVectorIndex(pool);
      app.log.info('Vector HNSW index ensured');
    } catch (error) {
      app.log.error({ error }, 'Failed to ensure vector index');
    }

    // Ensure capsule HNSW vector index exists for capsule semantic recall
    try {
      await ensureCapsuleVectorIndex(pool);
      app.log.info('Capsule vector HNSW index ensured');
    } catch (error) {
      app.log.error({ error }, 'Failed to ensure capsule vector index');
    }

    registerArtifactAdapters([artifactGraphIndexAdapter, createCapsuleIndexAdapter({ pool })]);
  } else {
    registerArtifactAdapters([artifactGraphIndexAdapter]);
  }

  // Create unified repos object (both JSON and PG modes)
  if (store instanceof PostgresStore) {
    const pool = store.getPool();
    app.skillShareer.repos = await createAllRepos({ store, pool });
  } else {
    app.skillShareer.repos = await createAllRepos({ store });
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
    const health = await graphBackend.healthcheck();

    if (!health.ok && !app.skillShareer.config.graphDb.failOpen) {
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
