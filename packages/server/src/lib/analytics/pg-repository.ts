/**
 * PostgreSQL-backed implementation of UsageAnalyticsRepository.
 *
 * Uses parameterized queries for type-safe SQL with PostgreSQL date_trunc for time-series.
 *
 * Phase: 89 (Usage Analytics & Statistics)
 */

import { randomUUID } from 'node:crypto';

import type { Pool } from 'pg';

import type { StatsEntryType, StatsGranularity } from '@trapmap/contracts';

import type { UsageAnalyticsRepository, UsageEventInput } from './repository.js';

/**
 * PostgreSQL-backed repository for usage analytics operations.
 */
export class PgUsageAnalyticsRepository implements UsageAnalyticsRepository {
  private initialized = false;

  constructor(private readonly pool: Pool) {}

  /**
   * Ensure the usage_events table exists.
   * Called idempotently before each operation.
   */
  private async ensureSchema(): Promise<void> {
    if (this.initialized) return;

    // Create usage_events table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS usage_events (
        id TEXT PRIMARY KEY,
        query_id TEXT NOT NULL,
        team_id TEXT,
        account_id TEXT NOT NULL,
        entry_type TEXT NOT NULL,
        entry_id TEXT NOT NULL,
        query_text TEXT,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    // Create composite indexes
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_usage_events_team_created
      ON usage_events (team_id, created_at)
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_usage_events_account_created
      ON usage_events (account_id, created_at)
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_usage_events_entry_type_created
      ON usage_events (entry_type, created_at)
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_usage_events_entry_id_created
      ON usage_events (entry_id, created_at)
    `);

    this.initialized = true;
  }

  async recordEvent(event: UsageEventInput): Promise<void> {
    await this.ensureSchema();

    await this.pool.query(
      `INSERT INTO usage_events (id, query_id, team_id, account_id, entry_type, entry_id, query_text, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        randomUUID(),
        event.queryId,
        event.teamId,
        event.accountId,
        event.entryType,
        event.entryId,
        event.queryText ?? null,
      ],
    );
  }

  async recordEvents(events: UsageEventInput[]): Promise<void> {
    if (events.length === 0) return;
    await this.ensureSchema();

    const now = new Date().toISOString();
    const values: string[] = [];
    const params: (string | null)[] = [];

    events.forEach((event, i) => {
      const base = i * 8;
      values.push(
        `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`,
      );
      params.push(
        randomUUID(),
        event.queryId,
        event.teamId ?? null,
        event.accountId,
        event.entryType,
        event.entryId,
        event.queryText ?? null,
        now,
      );
    });

    await this.pool.query(
      `INSERT INTO usage_events (id, query_id, team_id, account_id, entry_type, entry_id, query_text, created_at)
       VALUES ${values.join(', ')}`,
      params,
    );
  }

  async queryUsageTimeSeries(params: {
    teamId?: string;
    accountId?: string;
    from: Date;
    to: Date;
    granularity: StatsGranularity;
  }): Promise<Array<{ period: string; count: number }>> {
    await this.ensureSchema();

    const conditions: string[] = [];
    const queryParams: (string | Date)[] = [];
    let paramIndex = 2; // $1 is reserved for granularity

    if (params.teamId !== undefined) {
      conditions.push(`team_id = $${paramIndex++}`);
      queryParams.push(params.teamId);
    }
    if (params.accountId !== undefined) {
      conditions.push(`account_id = $${paramIndex++}`);
      queryParams.push(params.accountId);
    }
    conditions.push(`created_at >= $${paramIndex++}`);
    queryParams.push(params.from);
    conditions.push(`created_at <= $${paramIndex++}`);
    queryParams.push(params.to);

    const whereClause = conditions.join(' AND ');

    const result = await this.pool.query<{ period: Date; count: string }>(
      `SELECT date_trunc($1, created_at) AS period, COUNT(*)::text AS count
       FROM usage_events
       WHERE ${whereClause}
       GROUP BY period
       ORDER BY period`,
      [params.granularity, ...queryParams],
    );

    return result.rows.map((row) => ({
      period: row.period.toISOString(),
      count: Number.parseInt(row.count, 10),
    }));
  }

  async queryHitRanking(params: {
    teamId?: string;
    entryType?: StatsEntryType;
    from?: Date;
    to?: Date;
    limit: number;
  }): Promise<Array<{ entryId: string; entryType: string; count: number }>> {
    await this.ensureSchema();

    const conditions: string[] = [];
    const queryParams: (string | Date | number)[] = [];
    let paramIndex = 1;

    if (params.teamId !== undefined) {
      conditions.push(`team_id = $${paramIndex++}`);
      queryParams.push(params.teamId);
    }
    if (params.entryType !== undefined) {
      conditions.push(`entry_type = $${paramIndex++}`);
      queryParams.push(params.entryType);
    }
    if (params.from !== undefined) {
      conditions.push(`created_at >= $${paramIndex++}`);
      queryParams.push(params.from);
    }
    if (params.to !== undefined) {
      conditions.push(`created_at <= $${paramIndex++}`);
      queryParams.push(params.to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    queryParams.push(params.limit);

    const result = await this.pool.query<{ entry_id: string; entry_type: string; count: string }>(
      `SELECT entry_id, entry_type, COUNT(*)::text AS count
       FROM usage_events
       ${whereClause}
       GROUP BY entry_id, entry_type
       ORDER BY count DESC
       LIMIT $${paramIndex}`,
      queryParams,
    );

    return result.rows.map((row) => ({
      entryId: row.entry_id,
      entryType: row.entry_type,
      count: Number.parseInt(row.count, 10),
    }));
  }

  async querySystemSummary(params: {
    from?: Date;
    to?: Date;
  }): Promise<{
    totalEvents: number;
    uniqueQueries: number;
    uniqueTeams: number;
    uniqueAccounts: number;
  }> {
    await this.ensureSchema();

    const conditions: string[] = [];
    const queryParams: Date[] = [];
    let paramIndex = 1;

    if (params.from !== undefined) {
      conditions.push(`created_at >= $${paramIndex++}`);
      queryParams.push(params.from);
    }
    if (params.to !== undefined) {
      conditions.push(`created_at <= $${paramIndex++}`);
      queryParams.push(params.to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.pool.query<{
      total_events: string;
      unique_queries: string;
      unique_teams: string;
      unique_accounts: string;
    }>(
      `SELECT
         COUNT(*)::text AS total_events,
         COUNT(DISTINCT query_id)::text AS unique_queries,
         COUNT(DISTINCT team_id)::text AS unique_teams,
         COUNT(DISTINCT account_id)::text AS unique_accounts
       FROM usage_events
       ${whereClause}`,
      queryParams,
    );

    const row = result.rows[0]!;
    return {
      totalEvents: Number.parseInt(row.total_events, 10),
      uniqueQueries: Number.parseInt(row.unique_queries, 10),
      uniqueTeams: Number.parseInt(row.unique_teams, 10),
      uniqueAccounts: Number.parseInt(row.unique_accounts, 10),
    };
  }

  async archiveOldEvents(olderThanDays: number): Promise<{ archivedCount: number }> {
    await this.ensureSchema();

    const result = await this.pool.query<{ count: string }>(
      `WITH deleted AS (
         DELETE FROM usage_events
         WHERE created_at < NOW() - INTERVAL '1 day' * $1
         RETURNING 1
       )
       SELECT COUNT(*)::text AS count FROM deleted`,
      [olderThanDays],
    );

    return {
      archivedCount: Number.parseInt(result.rows[0]!.count, 10),
    };
  }
}
