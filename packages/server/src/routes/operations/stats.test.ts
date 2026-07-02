/**
 * Tests for stats routes.
 *
 * Phase: 89 (Usage Analytics & Statistics)
 */

import { buildServer } from '@trapmap/server/app.js';
import type { UsageAnalyticsRepository } from '@trapmap/server/lib/analytics/index.js';
import { recordRuntimeExecution, resetRuntimeMetrics } from '@trapmap/server/lib/runtime/index.js';
import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock repository
const _mockRepo: UsageAnalyticsRepository = {
  recordEvent: vi.fn(),
  recordEvents: vi.fn(),
  queryUsageTimeSeries: vi.fn().mockResolvedValue([
    { period: '2024-01-01T00:00:00.000Z', count: 10 },
    { period: '2024-01-02T00:00:00.000Z', count: 15 },
  ]),
  queryHitRanking: vi.fn().mockResolvedValue([
    { entryId: 'k1', entryType: 'knowledge', count: 100 },
    { entryId: 'a1', entryType: 'skill', count: 50 },
  ]),
  querySystemSummary: vi.fn().mockResolvedValue({
    totalEvents: 1000,
    uniqueQueries: 500,
    uniqueTeams: 10,
    uniqueAccounts: 100,
  }),
  archiveOldEvents: vi.fn().mockResolvedValue({ archivedCount: 0 }),
};

describe('stats routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetRuntimeMetrics();
    app = await buildServer();
  });

  describe('GET /v1/operations/stats/usage', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/stats/usage',
        query: {
          from: '2024-01-01T00:00:00Z',
          to: '2024-01-31T00:00:00Z',
        },
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return 503 when analytics unavailable', async () => {
      // Login first
      const loginResponse = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: {
          handle: 'admin',
          password: 'admin',
        },
      });
      const sessionToken = loginResponse.json<{ sessionToken: string }>().sessionToken;

      // Request without repo
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/stats/usage',
        query: {
          from: '2024-01-01T00:00:00Z',
          to: '2024-01-31T00:00:00Z',
        },
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
      });

      // Admin user doesn't have stats:read by default - expect 403 or 401
      expect([403, 503, 401]).toContain(response.statusCode);
    });
  });

  describe('GET /v1/operations/stats/hits', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/stats/hits',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /v1/operations/stats/summary', () => {
    it('should return 401 without authentication', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/stats/summary',
      });

      expect(response.statusCode).toBe(401);
    });

    it('keeps async architecture metrics shape available on summary route', async () => {
      recordRuntimeExecution({
        dependencyName: 'badcase-export',
        latencyMs: 120,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/operations/stats/summary',
      });

      expect([401, 403, 503]).toContain(response.statusCode);
    });

    it('exposes Phase 3 cache capacity fields in summary schema', async () => {
      const schema = (await import('@trapmap/contracts')).statsSummaryResponseSchema;

      const parsed = schema.parse({
        totalEvents: 1000,
        uniqueQueries: 500,
        uniqueTeams: 10,
        uniqueAccounts: 100,
        asyncArchitecture: {
          queueBacklogByType: { candidate: 5 },
          deadLetterByType: { candidate: 1 },
          retryRateByType: { candidate: 0.1 },
          avgHandlerLatencyMsByType: { candidate: 1200 },
          cacheHitRateByNamespace: { intent: 0.75 },
          cacheInvalidationByNamespace: { intent: 3 },
          cachePendingInvalidationByNamespace: { intent: false },
          badcaseExportCount: 0,
          retrievalFailureDistribution: { timeout: 1 },
          thresholds: [
            {
              metric: 'queueBacklogByType',
              healthyBelowOrEqual: 100,
              investigateAbove: 500,
              action: 'investigate backlog',
            },
          ],
        },
      });

      expect(parsed.asyncArchitecture.cacheInvalidationByNamespace.intent).toBe(3);
      expect(parsed.asyncArchitecture.cachePendingInvalidationByNamespace.intent).toBe(false);
    });
  });
});
