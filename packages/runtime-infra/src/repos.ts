import type { Pool } from 'pg';

import type { UsageAnalyticsRepository } from '@trapmap/server/lib/analytics/index.js';
import type { ArtifactRepository } from '@trapmap/server/lib/artifacts/index.js';
import type { AuditRepository } from '@trapmap/server/lib/audit/index.js';
import type { AccessKeyRepository, SessionRepository } from '@trapmap/server/lib/auth/index.js';
import type { CandidateRepository } from '@trapmap/server/lib/candidates/index.js';
import type { ConflictRepository } from '@trapmap/server/lib/conflict/index.js';
import type { DuplicateRepository } from '@trapmap/server/lib/duplicates/index.js';
import type { FeedbackRepository } from '@trapmap/server/lib/feedback/index.js';
import type { GraphIndexRepository } from '@trapmap/server/lib/graph-index/index.js';
import type { KnowledgeRepository } from '@trapmap/server/lib/knowledge/index.js';
import type { LineageRepository } from '@trapmap/server/lib/lineage/index.js';
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
import { createConflictRepository } from '@trapmap/server/lib/conflict/index.js';
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

import type { SkillShareerStore } from './store.js';

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

export async function createRuntimeInfraRepos(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): Promise<SkillShareerRepos> {
  let usageAnalytics: UsageAnalyticsRepository;
  if (config.pool) {
    usageAnalytics = await createUsageAnalyticsRepository({ pool: config.pool });
  } else {
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

function createInMemoryUsageAnalyticsRepository(): UsageAnalyticsRepository {
  return {
    async recordEvent() {},
    async recordEvents() {},
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
