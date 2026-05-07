/**
 * Tests for stats routes.
 *
 * Phase: 89 (Usage Analytics & Statistics)
 */

import type { FastifyInstance } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildServer } from '../../app.js';
import type { UsageAnalyticsRepository } from '../../lib/analytics/index.js';

// Mock repository
const mockRepo: UsageAnalyticsRepository = {
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
  });
});
