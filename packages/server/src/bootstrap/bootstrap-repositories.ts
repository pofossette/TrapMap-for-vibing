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
import { createKnowledgeRepository } from '@trapmap/server/lib/knowledge/index.js';
import { runMigrations } from '@trapmap/server/lib/persistence/migration-runner.js';
import { PostgresStore } from '@trapmap/server/lib/persistence/postgres-store.js';
import { createAllRepos } from '@trapmap/server/lib/repos/index.js';
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
  }

  // Create unified repos object (both JSON and PG modes)
  if (store instanceof PostgresStore) {
    const pool = store.getPool();
    app.skillShareer.repos = await createAllRepos({ store, pool });
  } else {
    app.skillShareer.repos = await createAllRepos({ store });
  }

  // Register graph channel now that repos are available
  app.skillShareer.channelRegistry.register(createGraphChannel(app.skillShareer.repos.graphIndex));
}
