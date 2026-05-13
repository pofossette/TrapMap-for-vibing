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

import type { Pool } from 'pg';

import type { UsageAnalyticsRepository } from '../analytics/index.js';
import type { ArtifactRepository } from '../artifacts/index.js';
import type { AuditRepository } from '../audit/index.js';
import type { AccessKeyRepository, SessionRepository } from '../auth/index.js';
import type { CandidateRepository } from '../candidates/index.js';
import type { DuplicateRepository } from '../duplicates/index.js';
import type { FeedbackRepository } from '../feedback/index.js';
import type { GraphIndexRepository } from '../graph-index/index.js';
import type { KnowledgeRepository } from '../knowledge/index.js';
import type { LineageRepository } from '../lineage/index.js';
import type { SkillShareerStore } from '../store.js';
import type { MembershipRepository, TeamRepository } from '../teams/index.js';
import type { UserRepository } from '../users/index.js';

import { createUsageAnalyticsRepository } from '../analytics/index.js';
import { createArtifactRepository } from '../artifacts/index.js';
import { createAuditRepository } from '../audit/index.js';
import { createAccessKeyRepository, createSessionRepository } from '../auth/index.js';
import { createCandidateRepository } from '../candidates/index.js';
import { createDuplicateRepository } from '../duplicates/index.js';
import { createFeedbackRepository } from '../feedback/index.js';
import { createGraphIndexRepository } from '../graph-index/index.js';
import { createKnowledgeRepository } from '../knowledge/index.js';
import { createLineageRepository } from '../lineage/index.js';
import { createMembershipRepository, createTeamRepository } from '../teams/index.js';
import { createUserRepository } from '../users/index.js';

/**
 * Unified repository object containing all domain repositories.
 * Always populated in both JSON and PG modes.
 */
export interface SkillShareerRepos {
  knowledge: KnowledgeRepository;
  artifact: ArtifactRepository;
  session: SessionRepository;
  accessKey: AccessKeyRepository;
  team: TeamRepository;
  membership: MembershipRepository;
  user: UserRepository;
  candidate: CandidateRepository;
  usageAnalytics: UsageAnalyticsRepository;
  feedback: FeedbackRepository;
  audit: AuditRepository;
  duplicate: DuplicateRepository;
  lineage: LineageRepository;
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
}): Promise<SkillShareerRepos> {
  let usageAnalytics: UsageAnalyticsRepository;
  if (config.pool) {
    usageAnalytics = await createUsageAnalyticsRepository({ pool: config.pool });
  } else {
    // InMemory fallback for JSON mode — no-op for writes, empty results for queries.
    usageAnalytics = createInMemoryUsageAnalyticsRepository();
  }

  const duplicate = createDuplicateRepository(config);

  return {
    knowledge: createKnowledgeRepository(config),
    artifact: createArtifactRepository(config),
    session: createSessionRepository(config),
    accessKey: createAccessKeyRepository(config),
    team: createTeamRepository(config),
    membership: createMembershipRepository(config),
    user: createUserRepository(config),
    candidate: createCandidateRepository({ ...config, duplicateRepo: duplicate }),
    usageAnalytics,
    feedback: createFeedbackRepository(config),
    audit: createAuditRepository(config),
    duplicate,
    lineage: createLineageRepository(config),
    graphIndex: createGraphIndexRepository(config),
  };
}

/**
 * InMemory UsageAnalyticsRepository for JSON mode (no pool).
 * All methods are no-ops or return empty results.
 */
function createInMemoryUsageAnalyticsRepository(): UsageAnalyticsRepository {
  return {
    async recordEvent() {
      /* no-op in JSON mode */
    },
    async recordEvents() {
      /* no-op in JSON mode */
    },
    async queryUsageTimeSeries() {
      return [];
    },
    async queryHitRanking() {
      return [];
    },
    async querySystemSummary() {
      return {
        totalEvents: 0,
        uniqueQueries: 0,
        uniqueTeams: 0,
        uniqueAccounts: 0,
      };
    },
    async archiveOldEvents() {
      return { archivedCount: 0 };
    },
  };
}
