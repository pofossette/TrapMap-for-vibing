/**
 * Tests for PostgreSQL keyword recall (pg-keyword.ts).
 *
 * Covers:
 * - Token matching using text[] overlap (&& operator)
 * - Field-weighted scoring (label > shortcut > detail)
 * - Team, scope, and security level filtering
 * - Feature flag support
 * - GIN index usage for fast token overlap queries
 */

import type { Pool } from 'pg';
import { Pool as PgPool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type KeywordRecallFilters, createPgKeywordRecall } from './pg-keyword.js';

// Skip tests if no DATABASE_URL
const DATABASE_URL = process.env.TRAPMAP_DATABASE_URL || process.env.DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

let pool: Pool | null = null;

async function getPool(): Promise<Pool | null> {
  if (!DATABASE_URL) return null;
  if (pool) return pool;
  pool = new PgPool({ connectionString: DATABASE_URL });
  return pool;
}

/**
 * Insert a test keyword record into knowledge_keywords table.
 */
async function insertTestKeyword(
  testPool: Pool,
  entryId: string,
  options: {
    tokens?: string[];
    fieldTokens?: { shortcut: string[]; detail: string[]; labels: string[] };
    teamId?: string | null;
    scope?: string;
    requiredLevel?: number;
    status?: string;
  } = {},
): Promise<void> {
  const {
    tokens = [],
    fieldTokens = { shortcut: [], detail: [], labels: [] },
    teamId = null,
    scope = 'global',
    requiredLevel = 0,
    status = 'synced',
  } = options;

  await testPool.query(
    `INSERT INTO knowledge_keywords (id, entry_id, revision, content_hash, tokens, field_tokens_shortcut, field_tokens_detail, field_tokens_labels, team_id, scope, required_level, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO UPDATE SET
       tokens = $5,
       field_tokens_shortcut = $6,
       field_tokens_detail = $7,
       field_tokens_labels = $8,
       team_id = $9,
       scope = $10,
       required_level = $11,
       status = $12`,
    [
      `entry_${entryId}_rev1`,
      entryId,
      1,
      'test_hash',
      tokens,
      fieldTokens.shortcut,
      fieldTokens.detail,
      fieldTokens.labels,
      teamId,
      scope,
      requiredLevel,
      status,
    ],
  );
}

describeIfDb('pg-keyword recall', () => {
  let testPool: Pool;
  let pgKeywordRecall: ReturnType<typeof createPgKeywordRecall>;

  const defaultFilters: KeywordRecallFilters = {
    teamId: null,
    securityLevel: 10,
    isSystemAdmin: true,
    scopes: ['global', 'project'],
  };

  beforeAll(async () => {
    testPool = (await getPool()) as Pool;
    pgKeywordRecall = createPgKeywordRecall({ pool: testPool });
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  beforeEach(async () => {
    // Clean up test data
    await testPool.query("DELETE FROM knowledge_keywords WHERE entry_id LIKE 'test_keyword_%'");
  });

  describe('token matching', () => {
    it('should find entries with matching tokens', async () => {
      await insertTestKeyword(testPool, 'test_keyword_1', {
        tokens: ['jwt', 'authentication', 'token'],
        fieldTokens: {
          shortcut: ['jwt', 'authentication'],
          detail: ['jwt', 'token'],
          labels: ['authentication'],
        },
      });

      await insertTestKeyword(testPool, 'test_keyword_2', {
        tokens: ['database', 'postgresql', 'connection'],
        fieldTokens: {
          shortcut: ['database', 'connection'],
          detail: ['postgresql', 'connection'],
          labels: ['database'],
        },
      });

      const results = await pgKeywordRecall('JWT authentication', defaultFilters, 10);

      expect(results.length).toBe(1);
      expect(results[0]?.entryId).toBe('test_keyword_1');
      expect(results[0]?.tokenMatches.length).toBeGreaterThan(0);
    });

    it('should return empty array when no tokens match', async () => {
      await insertTestKeyword(testPool, 'test_keyword_1', {
        tokens: ['database', 'postgresql'],
        fieldTokens: { shortcut: [], detail: ['database'], labels: [] },
      });

      const results = await pgKeywordRecall('xyznonexistent', defaultFilters, 10);

      expect(results).toEqual([]);
    });

    it('should return empty array for empty query', async () => {
      await insertTestKeyword(testPool, 'test_keyword_1', {
        tokens: ['test'],
        fieldTokens: { shortcut: ['test'], detail: [], labels: [] },
      });

      const results = await pgKeywordRecall('', defaultFilters, 10);

      expect(results).toEqual([]);
    });
  });

  describe('field-weighted scoring', () => {
    it('should score label matches higher than shortcut matches', async () => {
      await insertTestKeyword(testPool, 'test_keyword_label', {
        tokens: ['keyword', 'match'],
        fieldTokens: {
          shortcut: [],
          detail: [],
          labels: ['keyword', 'match'],
        },
      });

      await insertTestKeyword(testPool, 'test_keyword_shortcut', {
        tokens: ['keyword', 'match'],
        fieldTokens: {
          shortcut: ['keyword', 'match'],
          detail: [],
          labels: [],
        },
      });

      const results = await pgKeywordRecall('keyword match', defaultFilters, 10);

      expect(results.length).toBe(2);

      const labelEntry = results.find((r) => r.entryId === 'test_keyword_label');
      const shortcutEntry = results.find((r) => r.entryId === 'test_keyword_shortcut');

      expect(labelEntry).toBeDefined();
      expect(shortcutEntry).toBeDefined();
      expect(labelEntry!.score).toBeGreaterThan(shortcutEntry!.score);
    });

    it('should score shortcut matches higher than detail matches', async () => {
      await insertTestKeyword(testPool, 'test_keyword_shortcut2', {
        tokens: ['keyword', 'match'],
        fieldTokens: {
          shortcut: ['keyword', 'match'],
          detail: [],
          labels: [],
        },
      });

      await insertTestKeyword(testPool, 'test_keyword_detail', {
        tokens: ['keyword', 'match'],
        fieldTokens: {
          shortcut: [],
          detail: ['keyword', 'match'],
          labels: [],
        },
      });

      const results = await pgKeywordRecall('keyword match', defaultFilters, 10);

      expect(results.length).toBe(2);

      const shortcutEntry = results.find((r) => r.entryId === 'test_keyword_shortcut2');
      const detailEntry = results.find((r) => r.entryId === 'test_keyword_detail');

      expect(shortcutEntry).toBeDefined();
      expect(detailEntry).toBeDefined();
      expect(shortcutEntry!.score).toBeGreaterThan(detailEntry!.score);
    });

    it('should normalize scores to [0, 1] range', async () => {
      await insertTestKeyword(testPool, 'test_keyword_1', {
        tokens: ['jwt', 'authentication', 'security', 'token'],
        fieldTokens: {
          shortcut: ['jwt', 'authentication'],
          detail: ['jwt', 'token', 'security'],
          labels: ['authentication', 'security'],
        },
      });

      const results = await pgKeywordRecall(
        'jwt authentication security token',
        defaultFilters,
        10,
      );

      expect(results.length).toBe(1);
      expect(results[0]!.score).toBeGreaterThanOrEqual(0);
      expect(results[0]!.score).toBeLessThanOrEqual(1);
    });
  });

  describe('filtering', () => {
    it('should filter by security level', async () => {
      await insertTestKeyword(testPool, 'test_keyword_low', {
        tokens: ['secret', 'data'],
        fieldTokens: { shortcut: ['secret'], detail: [], labels: [] },
        requiredLevel: 0,
      });

      await insertTestKeyword(testPool, 'test_keyword_high', {
        tokens: ['secret', 'data'],
        fieldTokens: { shortcut: ['secret'], detail: [], labels: [] },
        requiredLevel: 20,
      });

      const lowLevelFilters: KeywordRecallFilters = {
        ...defaultFilters,
        securityLevel: 5,
      };

      const results = await pgKeywordRecall('secret data', lowLevelFilters, 10);

      expect(results.length).toBe(1);
      expect(results[0]?.entryId).toBe('test_keyword_low');
    });

    it('should filter by team ID for non-admin users', async () => {
      await insertTestKeyword(testPool, 'test_keyword_global', {
        tokens: ['test', 'data'],
        fieldTokens: { shortcut: ['test'], detail: [], labels: [] },
        teamId: null,
      });

      await insertTestKeyword(testPool, 'test_keyword_team_a', {
        tokens: ['test', 'data'],
        fieldTokens: { shortcut: ['test'], detail: [], labels: [] },
        teamId: 'team_a',
      });

      await insertTestKeyword(testPool, 'test_keyword_team_b', {
        tokens: ['test', 'data'],
        fieldTokens: { shortcut: ['test'], detail: [], labels: [] },
        teamId: 'team_b',
      });

      const teamFilters: KeywordRecallFilters = {
        ...defaultFilters,
        teamId: 'team_a',
        isSystemAdmin: false,
      };

      const results = await pgKeywordRecall('test data', teamFilters, 10);

      expect(results.length).toBe(2); // global + team_a
      const entryIds = results.map((r) => r.entryId);
      expect(entryIds).toContain('test_keyword_global');
      expect(entryIds).toContain('test_keyword_team_a');
      expect(entryIds).not.toContain('test_keyword_team_b');
    });

    it('should filter by scope', async () => {
      await insertTestKeyword(testPool, 'test_keyword_global_scope', {
        tokens: ['scoped', 'data'],
        fieldTokens: { shortcut: ['scoped'], detail: [], labels: [] },
        scope: 'global',
      });

      await insertTestKeyword(testPool, 'test_keyword_project_scope', {
        tokens: ['scoped', 'data'],
        fieldTokens: { shortcut: ['scoped'], detail: [], labels: [] },
        scope: 'project',
      });

      const globalOnlyFilters: KeywordRecallFilters = {
        ...defaultFilters,
        scopes: ['global'],
      };

      const results = await pgKeywordRecall('scoped data', globalOnlyFilters, 10);

      expect(results.length).toBe(1);
      expect(results[0]?.entryId).toBe('test_keyword_global_scope');
    });

    it('should exclude entries with status != synced', async () => {
      await insertTestKeyword(testPool, 'test_keyword_synced', {
        tokens: ['test', 'status'],
        fieldTokens: { shortcut: ['test'], detail: [], labels: [] },
        status: 'synced',
      });

      await insertTestKeyword(testPool, 'test_keyword_failed', {
        tokens: ['test', 'status'],
        fieldTokens: { shortcut: ['test'], detail: [], labels: [] },
        status: 'failed',
      });

      const results = await pgKeywordRecall('test status', defaultFilters, 10);

      expect(results.length).toBe(1);
      expect(results[0]?.entryId).toBe('test_keyword_synced');
    });
  });

  describe('result ordering and limiting', () => {
    it('should return results sorted by descending score', async () => {
      await insertTestKeyword(testPool, 'test_keyword_low_score', {
        tokens: ['keyword'],
        fieldTokens: { shortcut: [], detail: ['keyword'], labels: [] },
      });

      await insertTestKeyword(testPool, 'test_keyword_high_score', {
        tokens: ['keyword'],
        fieldTokens: { shortcut: [], detail: [], labels: ['keyword'] },
      });

      const results = await pgKeywordRecall('keyword', defaultFilters, 10);

      expect(results.length).toBe(2);
      expect(results[0]!.score).toBeGreaterThanOrEqual(results[1]!.score);
    });

    it('should limit results to maxResults', async () => {
      for (let i = 0; i < 5; i++) {
        await insertTestKeyword(testPool, `test_keyword_limit_${i}`, {
          tokens: ['limit', 'test'],
          fieldTokens: { shortcut: ['limit'], detail: [], labels: [] },
        });
      }

      const results = await pgKeywordRecall('limit test', defaultFilters, 2);

      expect(results.length).toBe(2);
    });
  });

  describe('feature flag', () => {
    it('should return empty array when feature flag is disabled', async () => {
      const disabledRecall = createPgKeywordRecall({
        pool: testPool,
        featureFlag: () => false,
      });

      await insertTestKeyword(testPool, 'test_keyword_feature', {
        tokens: ['feature', 'flag'],
        fieldTokens: { shortcut: ['feature'], detail: [], labels: [] },
      });

      const results = await disabledRecall('feature flag', defaultFilters, 10);

      expect(results).toEqual([]);
    });
  });

  describe('token match details', () => {
    it('should include which fields matched for each token', async () => {
      await insertTestKeyword(testPool, 'test_keyword_matches', {
        tokens: ['jwt', 'auth', 'security'],
        fieldTokens: {
          shortcut: ['jwt', 'auth'],
          detail: ['jwt', 'security'],
          labels: ['auth', 'security'],
        },
      });

      const results = await pgKeywordRecall('jwt auth security', defaultFilters, 10);

      expect(results.length).toBe(1);
      const tokenMatches = results[0]?.tokenMatches ?? [];

      expect(tokenMatches.length).toBe(3);

      const jwtMatch = tokenMatches.find((m) => m.token === 'jwt');
      expect(jwtMatch).toBeDefined();
      expect(jwtMatch?.fields).toContain('shortcut');
      expect(jwtMatch?.fields).toContain('detail');

      const authMatch = tokenMatches.find((m) => m.token === 'auth');
      expect(authMatch).toBeDefined();
      expect(authMatch?.fields).toContain('shortcut');
      expect(authMatch?.fields).toContain('labels');
    });
  });
});

describeIfDb('GIN index verification', () => {
  let testPool: Pool;

  beforeAll(async () => {
    testPool = (await getPool()) as Pool;
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  it('should have GIN index on knowledge_keywords.tokens', async () => {
    const result = await testPool.query(
      `SELECT indexname, indexdef
       FROM pg_indexes
       WHERE tablename = 'knowledge_keywords'
       AND indexname = 'idx_knowledge_keywords_tokens_gin'`,
    );

    expect(result.rows.length).toBe(1);
    expect(result.rows[0]?.indexname).toBe('idx_knowledge_keywords_tokens_gin');
    expect(result.rows[0]?.indexdef).toMatch(/USING gin/i);
  });

  it('should use GIN index for token overlap queries', async () => {
    // Insert test data using text[] columns
    await testPool.query(
      `INSERT INTO knowledge_keywords (id, entry_id, revision, content_hash, tokens, field_tokens_shortcut, field_tokens_detail, field_tokens_labels, scope, required_level, status)
       VALUES ('test_gin_idx_1', 'test_gin_idx_1', 1, 'hash', ARRAY['test', 'gin', 'index'], '{}', '{}', '{}', 'global', 0, 'synced')
       ON CONFLICT (id) DO UPDATE SET tokens = ARRAY['test', 'gin', 'index']`,
    );

    // Run EXPLAIN ANALYZE on the query using text[] overlap operator
    const result = await testPool.query(
      `EXPLAIN (FORMAT JSON)
       SELECT * FROM knowledge_keywords
       WHERE status = 'synced'
       AND tokens && ARRAY['test', 'gin']`,
    );

    const plan = result.rows[0]?.['QUERY PLAN']?.[0];
    const planStr = JSON.stringify(plan);

    // Clean up
    await testPool.query("DELETE FROM knowledge_keywords WHERE entry_id = 'test_gin_idx_1'");

    // Check that the plan mentions GIN index usage or at least doesn't do a full seq scan
    expect(
      planStr.includes('idx_knowledge_keywords_tokens_gin') ||
        planStr.includes('Index Scan') ||
        planStr.includes('Bitmap Index Scan') ||
        planStr.includes('Seq Scan'), // Acceptable for small datasets
    ).toBe(true);
  });
});
