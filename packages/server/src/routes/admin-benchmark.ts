/**
 * Admin retrieval benchmark route.
 *
 * Provides endpoint for running retrieval pipeline benchmarks.
 * Requires system admin authentication.
 */

import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { AppError } from '../lib/errors.js';
import { BENCHMARK_SCENARIOS, runRetrievalBenchmark } from '../lib/retrieval/benchmark.js';
import { resolveAuthContext } from '../lib/session.js';

const benchmarkRequestSchema = z.object({
  query: z.string().min(1).max(512),
  mode: z.enum(['semantic', 'hybrid', 'graph-assisted']).default('semantic'),
});

export const adminBenchmarkRoutes: FastifyPluginAsync = async (app) => {
  /**
   * POST /admin/benchmark
   *
   * Run a retrieval pipeline benchmark against the current knowledge store.
   * Returns per-step latency breakdown and memory usage.
   * Requires system admin authentication.
   */
  app.post('/admin/benchmark', async (request, _reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);

    if (auth.subjectType !== 'system-admin') {
      throw new AppError(403, 'forbidden', 'System admin required');
    }

    const body = benchmarkRequestSchema.parse(request.body);
    const data = await app.skillShareer.store.snapshot();

    const result = await runRetrievalBenchmark(data.knowledgeEntries, body.query, body.mode);

    return result;
  });

  /**
   * GET /admin/benchmark/scenarios
   *
   * List predefined benchmark scenarios.
   * Requires system admin authentication.
   */
  app.get('/admin/benchmark/scenarios', async (request, _reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);

    if (auth.subjectType !== 'system-admin') {
      throw new AppError(403, 'forbidden', 'System admin required');
    }

    return { scenarios: BENCHMARK_SCENARIOS };
  });
};
