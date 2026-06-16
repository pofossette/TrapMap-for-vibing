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

import type { UsageAnalyticsRepository } from '@trapmap/server/lib/analytics/index.js';
import type { ArtifactRepository } from '@trapmap/server/lib/artifacts/index.js';
import type { AuditRepository } from '@trapmap/server/lib/audit/index.js';
import type { AccessKeyRepository, SessionRepository } from '@trapmap/server/lib/auth/index.js';
import type { CandidateRepository } from '@trapmap/server/lib/candidates/index.js';
import type { ConflictRepository } from '@trapmap/server/lib/conflict/repository.js';
import type { DuplicateRepository } from '@trapmap/server/lib/duplicates/index.js';
import type { FeedbackRepository } from '@trapmap/server/lib/feedback/index.js';
import type { GraphIndexRepository } from '@trapmap/server/lib/graph-index/index.js';
import type { KnowledgeRepository } from '@trapmap/server/lib/knowledge/index.js';
import type { LineageRepository } from '@trapmap/server/lib/lineage/index.js';
import type { SkillShareerStore } from '@trapmap/server/lib/store.js';
import type { MembershipRepository, TeamRepository } from '@trapmap/server/lib/teams/index.js';
import type { UserRepository } from '@trapmap/server/lib/users/index.js';

import { createUsageAnalyticsRepository } from '@trapmap/server/lib/analytics/index.js';
import { createArtifactRepository } from '@trapmap/server/lib/artifacts/index.js';
import { createAuditRepository } from '@trapmap/server/lib/audit/index.js';
import {
  createAccessKeyRepository,
  createSessionRepository,
} from '@trapmap/server/lib/auth/index.js';
import { createCandidateRepository } from '@trapmap/server/lib/candidates/index.js';
import { createConflictRepository } from '@trapmap/server/lib/conflict/repository.js';
import { createDuplicateRepository } from '@trapmap/server/lib/duplicates/index.js';
import { createFeedbackRepository } from '@trapmap/server/lib/feedback/index.js';
import { createGraphIndexRepository } from '@trapmap/server/lib/graph-index/index.js';
import { createKnowledgeRepository } from '@trapmap/server/lib/knowledge/index.js';
import { createLineageRepository } from '@trapmap/server/lib/lineage/index.js';
import {
  createMembershipRepository,
  createTeamRepository,
} from '@trapmap/server/lib/teams/index.js';
import { createUserRepository } from '@trapmap/server/lib/users/index.js';

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
  conflict: ConflictRepository;
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
    conflict: createConflictRepository(config),
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
    async hasQueryId() {
      return false;
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
