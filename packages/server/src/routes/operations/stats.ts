/**
 * Stats routes for usage analytics.
 *
 * Endpoints:
 * - GET /v1/operations/stats/usage - Time-series usage counts
 * - GET /v1/operations/stats/hits - Hit ranking by entry
 * - GET /v1/operations/stats/summary - System-wide summary
 *
 * Phase: 89 (Usage Analytics & Statistics)
 */

import type { FastifyPluginAsync } from 'fastify';

import {
  statsHitRankingQuerySchema,
  statsHitRankingResponseSchema,
  statsSummaryQuerySchema,
  statsSummaryResponseSchema,
  statsUsageQuerySchema,
  statsUsageResponseSchema,
} from '@trapmap/contracts';

import { AppError } from '../../lib/errors.js';
import { requirePermission } from '../../lib/rbac.js';
import { resolveAuthContext } from '../../lib/session.js';

export const statsRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /v1/operations/stats/usage
   * Query usage time-series aggregated by time bucket.
   *
   * Non-system-admin users can only see their own team's data.
   */
  app.get('/v1/operations/stats/usage', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'stats:read');

    const repo = app.skillShareer.usageAnalyticsRepo;
    if (!repo) {
      throw new AppError(503, 'analytics_unavailable', 'Analytics requires PostgreSQL');
    }

    const query = statsUsageQuerySchema.parse(request.query as Record<string, unknown>);

    // Non-system-admin can only see their own team's data
    const teamId = auth.subjectType === 'system-admin'
      ? (query.teamId ?? undefined)
      : auth.activeTeamId ?? undefined;

    const result = await repo.queryUsageTimeSeries({
      teamId,
      accountId: query.accountId,
      from: new Date(query.from),
      to: new Date(query.to),
      granularity: query.granularity,
    });

    return statsUsageResponseSchema.parse({ items: result });
  });

  /**
   * GET /v1/operations/stats/hits
   * Query hit ranking (top N entries by hit count).
   *
   * Non-system-admin users can only see their own team's data.
   */
  app.get('/v1/operations/stats/hits', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'stats:read');

    const repo = app.skillShareer.usageAnalyticsRepo;
    if (!repo) {
      throw new AppError(503, 'analytics_unavailable', 'Analytics requires PostgreSQL');
    }

    const query = statsHitRankingQuerySchema.parse(request.query as Record<string, unknown>);

    // Non-system-admin can only see their own team's data
    const teamId = auth.subjectType === 'system-admin'
      ? (query.teamId ?? undefined)
      : auth.activeTeamId ?? undefined;

    const result = await repo.queryHitRanking({
      teamId,
      entryType: query.entryType,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit,
    });

    return statsHitRankingResponseSchema.parse({ items: result });
  });

  /**
   * GET /v1/operations/stats/summary
   * Query system-wide summary statistics.
   *
   * System-admin only - returns 403 for regular users.
   */
  app.get('/v1/operations/stats/summary', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'stats:read');

    // System summary is system-admin only
    if (auth.subjectType !== 'system-admin') {
      throw new AppError(403, 'forbidden', 'System summary requires system-admin privileges');
    }

    const repo = app.skillShareer.usageAnalyticsRepo;
    if (!repo) {
      throw new AppError(503, 'analytics_unavailable', 'Analytics requires PostgreSQL');
    }

    const query = statsSummaryQuerySchema.parse(request.query as Record<string, unknown>);

    const result = await repo.querySystemSummary({
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    });

    return statsSummaryResponseSchema.parse(result);
  });
};
