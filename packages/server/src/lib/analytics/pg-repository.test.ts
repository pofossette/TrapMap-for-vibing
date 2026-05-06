/**
 * Tests for PgUsageAnalyticsRepository.
 *
 * These tests require a PostgreSQL database connection.
 * Set DATABASE_URL or TRAPMAP_DATABASE_URL environment variable to run.
 *
 * Phase: 89 (Usage Analytics & Statistics)
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';

import { PgUsageAnalyticsRepository } from './pg-repository.js';
import type { UsageEventInput } from './repository.js';

const DATABASE_URL = process.env.TRAPMAP_DATABASE_URL || process.env.DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

let pool: Pool | null = null;

async function getPool(): Promise<Pool | null> {
  if (!DATABASE_URL) return null;
  if (pool) return pool;
  pool = new Pool({ connectionString: DATABASE_URL });
  return pool;
}

describeIfDb('PgUsageAnalyticsRepository', () => {
  let repo: PgUsageAnalyticsRepository;
  let testPool: Pool;

  beforeAll(async () => {
    testPool = (await getPool())!;
    repo = new PgUsageAnalyticsRepository(testPool);
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  beforeEach(async () => {
    // Clean up test data before each test
    await testPool.query("DELETE FROM usage_events WHERE query_id LIKE 'test_%'");
  });

  describe('recordEvent', () => {
    it('should record a single usage event', async () => {
      const event: UsageEventInput = {
        queryId: 'test_query_1',
        teamId: 'team_test',
        accountId: 'account_test',
        entryType: 'knowledge',
        entryId: 'knowledge_123',
        queryText: 'test query',
      };

      await repo.recordEvent(event);

      const result = await testPool.query(
        'SELECT * FROM usage_events WHERE query_id = $1',
        ['test_query_1'],
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]!.entry_id).toBe('knowledge_123');
      expect(result.rows[0]!.entry_type).toBe('knowledge');
    });
  });

  describe('recordEvents', () => {
    it('should batch record multiple events', async () => {
      const events: UsageEventInput[] = [
        {
          queryId: 'test_batch_1',
          teamId: 'team_test',
          accountId: 'account_test',
          entryType: 'skill',
          entryId: 'artifact_1',
        },
        {
          queryId: 'test_batch_1',
          teamId: 'team_test',
          accountId: 'account_test',
          entryType: 'trap',
          entryId: 'knowledge_2',
        },
      ];

      await repo.recordEvents(events);

      const result = await testPool.query(
        'SELECT * FROM usage_events WHERE query_id = $1',
        ['test_batch_1'],
      );

      expect(result.rows).toHaveLength(2);
    });

    it('should handle empty array', async () => {
      await expect(repo.recordEvents([])).resolves.not.toThrow();
    });
  });

  describe('queryUsageTimeSeries', () => {
    beforeEach(async () => {
      // Insert test events
      const events: UsageEventInput[] = [
        {
          queryId: 'test_ts_1',
          teamId: 'team_test',
          accountId: 'account_test',
          entryType: 'knowledge',
          entryId: 'k1',
        },
        {
          queryId: 'test_ts_2',
          teamId: 'team_test',
          accountId: 'account_test',
          entryType: 'knowledge',
          entryId: 'k2',
        },
      ];

      await repo.recordEvents(events);
    });

    it('should return time-series aggregation', async () => {
      const from = new Date();
      from.setDate(from.getDate() - 1);
      const to = new Date();
      to.setDate(to.getDate() + 1);

      const result = await repo.queryUsageTimeSeries({
        teamId: 'team_test',
        from,
        to,
        granularity: 'day',
      });

      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0]).toHaveProperty('period');
      expect(result[0]).toHaveProperty('count');
      expect(typeof result[0]!.count).toBe('number');
    });
  });

  describe('queryHitRanking', () => {
    beforeEach(async () => {
      // Insert test events with different hit counts
      const events: UsageEventInput[] = [];
      for (let i = 0; i < 5; i++) {
        events.push({
          queryId: `test_rank_${i}`,
          teamId: 'team_rank',
          accountId: 'account_test',
          entryType: 'skill',
          entryId: 'artifact_top',
        });
      }
      for (let i = 0; i < 3; i++) {
        events.push({
          queryId: `test_rank_b_${i}`,
          teamId: 'team_rank',
          accountId: 'account_test',
          entryType: 'skill',
          entryId: 'artifact_second',
        });
      }

      await repo.recordEvents(events);
    });

    it('should return hit ranking sorted by count', async () => {
      const result = await repo.queryHitRanking({
        teamId: 'team_rank',
        limit: 10,
      });

      expect(result.length).toBeGreaterThanOrEqual(2);
      expect(result[0]!.entryId).toBe('artifact_top');
      expect(result[0]!.count).toBe(5);
      expect(result[1]!.entryId).toBe('artifact_second');
      expect(result[1]!.count).toBe(3);
    });

    it('should filter by entryType', async () => {
      const result = await repo.queryHitRanking({
        teamId: 'team_rank',
        entryType: 'skill',
        limit: 10,
      });

      expect(result.length).toBeGreaterThanOrEqual(1);
      result.forEach((item) => {
        expect(item.entryType).toBe('skill');
      });
    });
  });

  describe('querySystemSummary', () => {
    beforeEach(async () => {
      const events: UsageEventInput[] = [
        {
          queryId: 'test_summary_1',
          teamId: 'team_a',
          accountId: 'account_1',
          entryType: 'knowledge',
          entryId: 'k1',
        },
        {
          queryId: 'test_summary_2',
          teamId: 'team_b',
          accountId: 'account_2',
          entryType: 'knowledge',
          entryId: 'k2',
        },
      ];

      await repo.recordEvents(events);
    });

    it('should return system-wide summary', async () => {
      const result = await repo.querySystemSummary({});

      expect(result).toHaveProperty('totalEvents');
      expect(result).toHaveProperty('uniqueQueries');
      expect(result).toHaveProperty('uniqueTeams');
      expect(result).toHaveProperty('uniqueAccounts');
      expect(result.totalEvents).toBeGreaterThanOrEqual(2);
      expect(result.uniqueQueries).toBeGreaterThanOrEqual(2);
    });
  });

  describe('archiveOldEvents', () => {
    it('should archive events older than specified days', async () => {
      // Insert an old event directly
      await testPool.query(`
        INSERT INTO usage_events (id, query_id, team_id, account_id, entry_type, entry_id, created_at)
        VALUES ('old_event_1', 'test_archive_old', 'team_test', 'account_test', 'knowledge', 'k_old', NOW() - INTERVAL '100 days')
      `);

      const result = await repo.archiveOldEvents(90);

      expect(result.archivedCount).toBeGreaterThanOrEqual(1);

      // Verify old event is gone
      const check = await testPool.query(
        'SELECT * FROM usage_events WHERE id = $1',
        ['old_event_1'],
      );
      expect(check.rows).toHaveLength(0);
    });
  });
});
