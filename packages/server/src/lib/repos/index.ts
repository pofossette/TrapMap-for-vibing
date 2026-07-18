/**
 * Unified repository factory for SkillShareer.
 *
 * Creates all repository instances and bundles them into a single
 * SkillShareerRepos object. Async because createUsageAnalyticsRepository
 * uses dynamic import and requires a PostgreSQL pool.
 *
 * When no pool is available (JSON mode), usageAnalytics uses an
 * InMemory fallback that returns empty/no-op results.
 *
 * Phase: 100-02 (Store Repository Pattern)
 */

import type { ArtifactReadProjection, KnowledgeOwnerPort } from '@trapmap/contracts';
import type { Pool } from 'pg';

import type { UsageAnalyticsRepository } from '@trapmap/server/lib/analytics/index.js';
import type { ConflictRepository } from '@trapmap/server/lib/conflict/repository.js';
import type { FeedbackRepository } from '@trapmap/server/lib/feedback/index.js';
import type { GraphIndexRepository } from '@trapmap/server/lib/graph-index/index.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';

import { createUsageAnalyticsRepository } from '@trapmap/server/lib/analytics/index.js';
import { createConflictRepository } from '@trapmap/server/lib/conflict/repository.js';
import { createFeedbackRepository } from '@trapmap/server/lib/feedback/index.js';
import { createGraphIndexRepository } from '@trapmap/server/lib/graph-index/index.js';

export type { FeedbackRepository } from '@trapmap/server/lib/feedback/index.js';

/**
 * Unified repository object containing all domain repositories.
 * Always populated in both JSON and PG modes.
 */
export interface SkillShareerRepos {
  knowledge: KnowledgeOwnerPort;
  artifact: ArtifactReadProjection;
  conflict: ConflictRepository;
  usageAnalytics: UsageAnalyticsRepository;
  feedback: FeedbackRepository;
  graphIndex: GraphIndexRepository;
}

/**
 * Create all repositories. Async because createUsageAnalyticsRepository
 * uses dynamic import and requires a PostgreSQL pool.
 *
 * When no pool is available (JSON mode), usageAnalytics uses an
 * InMemory fallback that returns empty/no-op results.
 */
export async function createAllRepos(config: {
  pool?: Pool;
  store: SkillShareerStore;
  artifactReadProjection: ArtifactReadProjection;
  knowledgeOwner: KnowledgeOwnerPort;
}): Promise<SkillShareerRepos> {
  const usageAnalytics = config.pool
    ? await createUsageAnalyticsRepository({ pool: config.pool })
    : createInMemoryUsageAnalyticsRepository();

  const repositories: SkillShareerRepos = {
    knowledge: config.knowledgeOwner,
    artifact: config.artifactReadProjection,
    conflict: createConflictRepository(config),
    usageAnalytics,
    feedback: createFeedbackRepository(config),
    graphIndex: createGraphIndexRepository(config),
  };
  return repositories;
}

export type { ArtifactReadProjection } from '@trapmap/contracts';

/**
 * InMemory UsageAnalyticsRepository for JSON mode (no pool).
 * All methods are no-ops or return empty results.
 */
const emptyUsageAnalytics: UsageAnalyticsRepository = {
  recordEvent: async () => undefined,
  recordEvents: async () => undefined,
  hasQueryId: async () => false,
  queryUsageTimeSeries: async () => [],
  queryHitRanking: async () => [],
  querySystemSummary: async () => ({
    totalEvents: 0,
    uniqueQueries: 0,
    uniqueTeams: 0,
    uniqueAccounts: 0,
  }),
  archiveOldEvents: async () => ({ archivedCount: 0 }),
};

function createInMemoryUsageAnalyticsRepository(): UsageAnalyticsRepository {
  return { ...emptyUsageAnalytics };
}
