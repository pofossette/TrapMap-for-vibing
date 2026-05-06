/**
 * Repository interface for usage analytics operations.
 * Abstracts analytics data access for PostgreSQL-backed storage.
 *
 * Phase: 89 (Usage Analytics & Statistics)
 */

import type { Pool } from 'pg';

import type { StatsEntryType, StatsGranularity } from '@trapmap/contracts';

/**
 * Usage event input for recording retrieval hits.
 */
export interface UsageEventInput {
  queryId: string;
  teamId: string | null;
  accountId: string;
  entryType: StatsEntryType;
  entryId: string;
  queryText?: string;
}

/**
 * Repository interface for usage analytics operations.
 * Abstracts analytics data access for PostgreSQL-backed storage.
 */
export interface UsageAnalyticsRepository {
  /**
   * Record a single usage event.
   */
  recordEvent(event: UsageEventInput): Promise<void>;

  /**
   * Batch record multiple usage events (for fire-and-forget after retrieval).
   */
  recordEvents(events: UsageEventInput[]): Promise<void>;

  /**
   * Query usage time-series aggregated by time bucket.
   */
  queryUsageTimeSeries(params: {
    teamId?: string;
    accountId?: string;
    from: Date;
    to: Date;
    granularity: StatsGranularity;
  }): Promise<Array<{ period: string; count: number }>>;

  /**
   * Query hit ranking (top N entries by hit count).
   */
  queryHitRanking(params: {
    teamId?: string;
    entryType?: StatsEntryType;
    from?: Date;
    to?: Date;
    limit: number;
  }): Promise<Array<{ entryId: string; entryType: string; count: number }>>;

  /**
   * Query system-wide summary statistics.
   */
  querySystemSummary(params: {
    from?: Date;
    to?: Date;
  }): Promise<{
    totalEvents: number;
    uniqueQueries: number;
    uniqueTeams: number;
    uniqueAccounts: number;
  }>;

  /**
   * Archive events older than specified days.
   * Returns count of archived events.
   */
  archiveOldEvents(olderThanDays: number): Promise<{ archivedCount: number }>;
}

/**
 * Factory function to create UsageAnalyticsRepository.
 * Returns PgUsageAnalyticsRepository when pool is available.
 */
export async function createUsageAnalyticsRepository(config: {
  pool: Pool;
}): Promise<UsageAnalyticsRepository> {
  const { PgUsageAnalyticsRepository } = await import('./pg-repository.js');
  return new PgUsageAnalyticsRepository(config.pool);
}
