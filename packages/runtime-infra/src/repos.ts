import type { Pool } from 'pg';

import type { UsageAnalyticsRepository } from '@trapmap/server/lib/analytics/index.js';
import type { CandidateRepository } from '@trapmap/server/lib/candidates/index.js';
import type { ConflictRepository } from '@trapmap/server/lib/conflict/index.js';
import type { DuplicateRepository } from '@trapmap/server/lib/duplicates/index.js';
import type { FeedbackRepository } from '@trapmap/server/lib/feedback/index.js';
import type { GraphIndexRepository } from '@trapmap/server/lib/graph-index/index.js';
import type { KnowledgeRepository } from '@trapmap/server/lib/knowledge/index.js';
import type { LineageRepository } from '@trapmap/server/lib/lineage/index.js';

import { createUsageAnalyticsRepository } from '@trapmap/server/lib/analytics/index.js';
import { createCandidateRepository } from '@trapmap/server/lib/candidates/index.js';
import { createConflictRepository } from '@trapmap/server/lib/conflict/index.js';
import { createDuplicateRepository } from '@trapmap/server/lib/duplicates/index.js';
import { createFeedbackRepository } from '@trapmap/server/lib/feedback/index.js';
import { createGraphIndexRepository } from '@trapmap/server/lib/graph-index/index.js';
import { createKnowledgeRepository } from '@trapmap/server/lib/knowledge/index.js';
import { createLineageRepository } from '@trapmap/server/lib/lineage/index.js';

import type { SkillShareerStore } from './store.js';

export interface SkillShareerRepos {
  knowledge: KnowledgeRepository;
  candidate: CandidateRepository;
  conflict: ConflictRepository;
  usageAnalytics: UsageAnalyticsRepository;
  feedback: FeedbackRepository;
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
    candidate: createCandidateRepository({ ...config, duplicateRepo: duplicate }),
    conflict: createConflictRepository(config),
    usageAnalytics,
    feedback: createFeedbackRepository(config),
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
