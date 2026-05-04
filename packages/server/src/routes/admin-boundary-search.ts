/**
 * Admin boundary search route.
 *
 * Provides endpoint for finding knowledge entries matching boundary constraints.
 * Requires system admin authentication.
 *
 * Satisfies Success Criteria 6: "Back-reference queries consumed by production retrieval code."
 */

import {
  adminBoundarySearchQuerySchema,
  adminBoundarySearchResponseSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '../lib/errors.js';
import { findEntriesByBoundaryConstraint } from '../lib/retrieval/boundary-query.js';
import { resolveAuthContext } from '../lib/session.js';

export const adminBoundarySearchRoutes: FastifyPluginAsync = async (app) => {
  /**
   * POST /admin/boundary-search
   *
   * Find knowledge entries matching boundary constraints.
   * Requires system admin authentication.
   */
  app.post('/admin/boundary-search', async (request, reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);

    // Require system admin
    if (auth.subjectType !== 'system-admin') {
      throw new AppError(403, 'forbidden', 'System admin required');
    }

    // Validate query
    const query = adminBoundarySearchQuerySchema.parse(request.body);

    // Get store snapshot
    const data = await app.skillShareer.store.snapshot();

    // Build constraint from query (only include defined values)
    const constraint: {
      context?: string;
      platform?: string;
      package?: string;
    } = {};
    if (query.context) constraint.context = query.context;
    if (query.platform) constraint.platform = query.platform;
    if (query.package) constraint.package = query.package;

    // Skip if no constraints provided
    if (!constraint.context && !constraint.platform && !constraint.package) {
      return adminBoundarySearchResponseSchema.parse({
        matches: [],
        query,
      });
    }

    // Find matching entries
    const matches = findEntriesByBoundaryConstraint(data.knowledgeEntries, constraint).slice(
      0,
      query.maxResults,
    );

    // Build response
    return adminBoundarySearchResponseSchema.parse({
      matches: matches.map((entry) => ({
        entryId: entry.id,
        scope: entry.scope,
        shortcut: entry.shortcut,
        detail: entry.detail,
        labels: entry.labels,
        boundary: entry.boundary ?? null,
      })),
      query,
    });
  });
};
