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

import { getRetrievalCacheStats } from '@trapmap/server/lib/cache/metrics.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import {
  getAverageLatencyMs,
  getRuntimeMetricsSnapshot,
} from '@trapmap/server/lib/runtime/metrics.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';

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
    const resolvedTeamId =
      auth.subjectType === 'system-admin' ? query.teamId : (auth.activeTeamId ?? undefined);

    const result = await repo.queryUsageTimeSeries({
      ...(resolvedTeamId !== undefined && { teamId: resolvedTeamId }),
      ...(query.accountId !== undefined && { accountId: query.accountId }),
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
    const resolvedTeamId =
      auth.subjectType === 'system-admin' ? query.teamId : (auth.activeTeamId ?? undefined);

    const result = await repo.queryHitRanking({
      ...(resolvedTeamId !== undefined && { teamId: resolvedTeamId }),
      ...(query.entryType !== undefined && { entryType: query.entryType }),
      ...(query.from !== undefined && { from: new Date(query.from) }),
      ...(query.to !== undefined && { to: new Date(query.to) }),
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
      ...(query.from !== undefined && { from: new Date(query.from) }),
      ...(query.to !== undefined && { to: new Date(query.to) }),
    });

    const runtime = getRuntimeMetricsSnapshot();
    const cacheStats = getRetrievalCacheStats();
    const queueBacklogByType: Record<string, number> = {};
    const deadLetterByType: Record<string, number> = {};
    const retryRateByType: Record<string, number> = {};
    const avgHandlerLatencyMsByType: Record<string, number> = {};
    const retrievalFailureDistribution: Record<string, number> = {};

    for (const [dependencyName, counter] of Object.entries(runtime.dependencies)) {
      if (dependencyName.startsWith('task:backlog:')) {
        queueBacklogByType[dependencyName.replace('task:backlog:', '')] = counter.executions;
      }
      if (dependencyName.startsWith('task:dead-letter:')) {
        deadLetterByType[dependencyName.replace('task:dead-letter:', '')] = counter.executions;
      }
      retryRateByType[dependencyName] =
        counter.executions > 0 ? counter.retries / counter.executions : 0;
      avgHandlerLatencyMsByType[dependencyName] = getAverageLatencyMs(counter);
      if (dependencyName.startsWith('retrieval-failure:')) {
        retrievalFailureDistribution[dependencyName.replace('retrieval-failure:', '')] =
          counter.executions;
      }
    }

    const cacheHitRateByNamespace = Object.fromEntries(
      Object.entries(cacheStats).map(([ns, stats]) => [ns, stats.hitRate]),
    );
    const cacheInvalidationByNamespace = Object.fromEntries(
      Object.entries(cacheStats).map(([ns, stats]) => [ns, stats.invalidations]),
    );
    const cachePendingInvalidationByNamespace = Object.fromEntries(
      Object.entries(cacheStats).map(([ns, stats]) => [ns, stats.pendingInvalidation]),
    );

    return statsSummaryResponseSchema.parse({
      ...result,
      asyncArchitecture: {
        queueBacklogByType,
        deadLetterByType,
        retryRateByType,
        avgHandlerLatencyMsByType,
        cacheHitRateByNamespace,
        cacheInvalidationByNamespace,
        cachePendingInvalidationByNamespace,
        badcaseExportCount: runtime.dependencies['badcase-export']?.executions ?? 0,
        retrievalFailureDistribution,
        thresholds: [
          {
            metric: 'queueBacklogByType',
            healthyBelowOrEqual: 100,
            investigateAbove: 500,
            action:
              'PG queue is enough below 100 active backlog per type; investigate external MQ above 500 sustained backlog.',
          },
          {
            metric: 'deadLetterByType',
            healthyBelowOrEqual: 5,
            investigateAbove: 20,
            action:
              'Modular monolith is enough while dead letters stay below 5 per type; above 20 investigate service split or external broker isolation.',
          },
          {
            metric: 'avgHandlerLatencyMsByType',
            healthyBelowOrEqual: 2000,
            investigateAbove: 5000,
            action:
              'Average handler latency above 5000ms is the trigger to consider dedicated service boundaries.',
          },
        ],
      },
    });
  });
};
