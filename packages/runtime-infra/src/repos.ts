import type { Pool } from 'pg';

import type { UsageAnalyticsRepository } from '@trapmap/server/lib/analytics/index.js';
import type { ConflictRepository } from '@trapmap/server/lib/conflict/index.js';
import type { FeedbackRepository } from '@trapmap/server/lib/feedback/index.js';
import type { GraphIndexRepository } from '@trapmap/server/lib/graph-index/index.js';

import { createUsageAnalyticsRepository } from '@trapmap/server/lib/analytics/index.js';
import { createConflictRepository } from '@trapmap/server/lib/conflict/index.js';
import { createFeedbackRepository } from '@trapmap/server/lib/feedback/index.js';
import { createGraphIndexRepository } from '@trapmap/server/lib/graph-index/index.js';

import type { SkillShareerStore } from './store.js';

export interface SkillShareerRepos {
  knowledge: KnowledgeReadProjection;
  conflict: ConflictRepository;
  usageAnalytics: UsageAnalyticsRepository;
  feedback: FeedbackRepository;
  graphIndex: GraphIndexRepository;
}

export interface KnowledgeReadProjection {
  getById(entryId: string): Promise<unknown | null>;
  listMine(params: { userId: string; teamId?: string }): Promise<unknown[]>;
  getStatus(): Promise<unknown>;
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

  const knowledge = createKnowledgeProjection(config.pool);

  return {
    knowledge,
    conflict: createConflictRepository(config),
    usageAnalytics,
    feedback: createFeedbackRepository(config),
    graphIndex: createGraphIndexRepository(config),
  };
}

function createKnowledgeProjection(pool: Pool | undefined): KnowledgeReadProjection {
  if (!pool) {
    return {
      async getById() {
        return null;
      },
      async listMine() {
        return [];
      },
      async getStatus() {
        return {
          phase: 'phase-2-boundary-closed',
          source: 'knowledge-write-owner',
          consistency: 'strong',
          freshness: 'degraded',
          fallback: 'none',
          surfaces: [],
        };
      },
    };
  }
  return {
    async getById(entryId) {
      const result = await pool.query('SELECT * FROM knowledge_entries WHERE id = $1', [entryId]);
      return (result.rows[0] as never) ?? null;
    },
    async listMine({ userId, teamId }) {
      const params: string[] = [userId];
      const teamClause = teamId ? ' AND team_id = $2' : '';
      if (teamId) params.push(teamId);
      const result = await pool.query(
        `SELECT * FROM knowledge_entries WHERE owner_user_id = $1${teamClause} ORDER BY updated_at DESC LIMIT 100`,
        params,
      );
      return result.rows as never;
    },
    async getStatus() {
      return {
        phase: 'phase-2-boundary-closed',
        source: 'knowledge-write-owner',
        consistency: 'strong',
        freshness: 'current',
        fallback: 'none',
        surfaces: [],
      };
    },
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
