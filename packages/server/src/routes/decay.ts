/**
 * Decay management routes for batch operations on knowledge lifecycle.
 *
 * Provides three endpoints for the batch management interface (DECAY-03):
 * - GET /v1/operations/decay/entries: List entries with decay-state enrichment
 * - POST /v1/operations/decay/batch: Batch mutations (extend/mark-review/deactivate/supersede)
 * - POST /v1/operations/decay/search: Pattern search with decay-state facets
 */

import {
  decayAwareListItemSchema,
  decayEntryListRequestSchema,
  decayEntryListResponseSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { loadDecayConfig } from '@trapmap/server/lib/decay/config.js';
import { buildDecayEntriesProjection } from '@trapmap/server/lib/operations/read-model.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { loadUserOpsLogConfig, logUserOperation } from '@trapmap/server/lib/user-ops-log.js';

import { sendCompatibilityShellUnsupported } from './compatibility-shell.js';

export const decayRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /v1/operations/decay/entries
   *
   * List knowledge entries enriched with computed decay state.
   * Supports filtering by decay state, age range, labels, and scope.
   */
  app.get('/v1/operations/decay/entries', async (request, _reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    // Parse query parameters
    const query = decayEntryListRequestSchema.parse(request.query);

    const config = loadDecayConfig();
    const now = new Date();
    const filters = {
      limit: query.limit,
      ...(query.decayStates !== undefined ? { decayStates: query.decayStates } : {}),
      ...(query.ageMinDays !== undefined ? { ageMinDays: query.ageMinDays } : {}),
      ...(query.ageMaxDays !== undefined ? { ageMaxDays: query.ageMaxDays } : {}),
      ...(query.labels !== undefined ? { labels: query.labels } : {}),
      ...(query.scope !== undefined ? { scope: query.scope } : {}),
    };
    const projection = await buildDecayEntriesProjection(app.skillShareer.repos, {
      auth,
      filters,
      config,
      now,
    });

    // Log operation
    const logConfig = loadUserOpsLogConfig();
    await logUserOperation(logConfig, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'decay-list',
      targetId: null,
      teamId: auth.activeTeamId,
      metadata: {
        total: projection.total,
        returned: projection.items.length,
        filters: query,
      },
    });

    return decayEntryListResponseSchema.parse({
      items: projection.items.map((item) => decayAwareListItemSchema.parse(item)),
      total: projection.total,
    });
  });

  /**
   * POST /v1/operations/decay/batch
   *
   * Execute or preview a batch operation on knowledge entries.
   * Supports extend, mark-review, deactivate, and supersede actions.
   */
  app.post('/v1/operations/decay/batch', async (request, reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    return sendCompatibilityShellUnsupported(
      reply,
      'decay batch writes',
      'host-distributed authoritative decay service',
    );
  });

  /**
   * POST /v1/operations/decay/search
   *
   * Search entries by pattern with decay-state enrichment and filtering.
   */
  app.post('/v1/operations/decay/search', async (request, _reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    // Parse body with pattern field
    const bodySchema = decayEntryListRequestSchema.extend({
      pattern: z.string().optional(),
    });
    const body = bodySchema.parse(request.body);
    const pattern = body.pattern ?? '';

    const config = loadDecayConfig();
    const now = new Date();
    const filters = {
      pattern,
      limit: body.limit,
      ...(body.decayStates !== undefined ? { decayStates: body.decayStates } : {}),
      ...(body.ageMinDays !== undefined ? { ageMinDays: body.ageMinDays } : {}),
      ...(body.ageMaxDays !== undefined ? { ageMaxDays: body.ageMaxDays } : {}),
      ...(body.labels !== undefined ? { labels: body.labels } : {}),
      ...(body.scope !== undefined ? { scope: body.scope } : {}),
    };
    const projection = await buildDecayEntriesProjection(app.skillShareer.repos, {
      auth,
      filters,
      config,
      now,
    });

    // Log operation
    const logConfig = loadUserOpsLogConfig();
    await logUserOperation(logConfig, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'decay-search',
      targetId: null,
      teamId: auth.activeTeamId,
      metadata: {
        pattern,
        total: projection.total,
        returned: projection.items.length,
        filters: body,
      },
    });

    return decayEntryListResponseSchema.parse({
      items: projection.items.map((item) => decayAwareListItemSchema.parse(item)),
      total: projection.total,
    });
  });
};
