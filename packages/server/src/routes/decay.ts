/**
 * Decay management routes for batch operations on knowledge lifecycle.
 *
 * Provides three endpoints for the batch management interface (DECAY-03):
 * - GET /v1/operations/decay/entries: List entries with decay-state enrichment
 * - POST /v1/operations/decay/batch: Batch mutations (extend/mark-review/deactivate/supersede)
 * - POST /v1/operations/decay/search: Pattern search with decay-state facets
 */

import {
  type DecayAwareListItem,
  batchOperationRequestSchema,
  batchOperationResponseSchema,
  decayAwareListItemSchema,
  decayEntryListRequestSchema,
  decayEntryListResponseSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { createDecayBatchApplicationService } from '@trapmap/server/lib/decay/application-service.js';
import { loadDecayConfig } from '@trapmap/server/lib/decay/config.js';
import { computeDecayState } from '@trapmap/server/lib/decay/state-machine.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { loadUserOpsLogConfig, logUserOperation } from '@trapmap/server/lib/user-ops-log.js';

/**
 * Compute age in days from lastVerifiedAt to now.
 */
function computeAgeDays(lastVerifiedAt: string | null, now: Date): number | null {
  if (!lastVerifiedAt) return null;
  const verifiedAt = new Date(lastVerifiedAt);
  const ageMs = now.getTime() - verifiedAt.getTime();
  return ageMs / (1000 * 60 * 60 * 24);
}

/**
 * Filter entries by permission (same logic as operations.ts knowledge list).
 * Non-admins see only entries at or below their security level.
 */
function filterEntriesByPermission(
  entries: Array<{
    id: string;
    teamId: string | null;
    requiredLevel: number;
    lifecycleState: string;
  }>,
  auth: {
    subjectType: 'user' | 'system-admin';
    activeTeamId: string | null;
    securityLevel: number;
  },
): Array<{ id: string; teamId: string | null; requiredLevel: number; lifecycleState: string }> {
  return entries.filter((entry) => {
    // System admins see everything
    if (auth.subjectType === 'system-admin') return true;

    // Security level check: user must have level <= entry level
    if (auth.securityLevel > entry.requiredLevel) return false;

    // Team scoping: user must be in same team or entry must be global (null team)
    if (entry.teamId === null) return true;
    return entry.teamId === auth.activeTeamId;
  });
}

export const decayRoutes: FastifyPluginAsync = async (app) => {
  function getDecayBatchService() {
    return createDecayBatchApplicationService({
      repos: app.skillShareer.repos,
      store: app.skillShareer.store,
      eventBus: app.skillShareer.eventBus,
    });
  }

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

    // Get knowledge entries using repository
    const { knowledge: knowledgeRepo } = app.skillShareer.repos;
    const allEntries = await knowledgeRepo.listByFilter({});
    const config = loadDecayConfig();
    const now = new Date();

    // Filter by permission first
    const permittedEntries = filterEntriesByPermission(
      allEntries.map((e) => ({
        id: e.id,
        teamId: e.teamId,
        requiredLevel: e.requiredLevel,
        lifecycleState: e.lifecycleState,
      })),
      auth,
    );
    const permittedIds = new Set(permittedEntries.map((e) => e.id));

    // Enrich entries with decay state
    const items: DecayAwareListItem[] = [];

    for (const entry of allEntries) {
      // Skip entries not permitted for this user
      if (!permittedIds.has(entry.id)) continue;

      // Compute decay state
      const decayResult = entry.decayMeta
        ? computeDecayState(
            {
              lastVerifiedAt: entry.decayMeta.lastVerifiedAt,
              decayState: entry.decayMeta.decayState,
              supersededById: entry.decayMeta.supersededById,
            },
            config,
            now,
          )
        : null;

      const decayState = decayResult?.decayState ?? null;
      const ageDays = computeAgeDays(entry.decayMeta?.lastVerifiedAt ?? null, now);
      const lastVerifiedAt = entry.decayMeta?.lastVerifiedAt ?? null;
      const freshnessType = entry.decayMeta?.freshnessType ?? null;
      const supersededById = entry.decayMeta?.supersededById ?? null;

      // Filter by decayStates if provided
      if (query.decayStates && query.decayStates.length > 0) {
        if (!decayState || !query.decayStates.includes(decayState)) continue;
      }

      // Filter by age range if provided
      if (query.ageMinDays !== undefined) {
        if (ageDays === null || ageDays < query.ageMinDays) continue;
      }
      if (query.ageMaxDays !== undefined) {
        if (ageDays === null || ageDays > query.ageMaxDays) continue;
      }

      // Filter by labels if provided
      if (query.labels && query.labels.length > 0) {
        const hasAllLabels = query.labels.every((label) => entry.labels.includes(label));
        if (!hasAllLabels) continue;
      }

      // Filter by scope if provided
      if (query.scope && entry.scope !== query.scope) continue;

      // Build item
      items.push(
        decayAwareListItemSchema.parse({
          id: entry.id,
          scope: entry.scope,
          labels: entry.labels,
          shortcut: entry.shortcut,
          lifecycleState: entry.lifecycleState,
          requiredLevel: entry.requiredLevel,
          updatedAt: entry.updatedAt,
          decayState,
          freshnessType,
          ageDays,
          lastVerifiedAt,
          supersededById,
        }),
      );
    }

    // Sort by updatedAt descending, then apply limit
    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const total = items.length;
    const limitedItems = items.slice(0, query.limit);

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
        total,
        returned: limitedItems.length,
        filters: query,
      },
    });

    return decayEntryListResponseSchema.parse({
      items: limitedItems,
      total,
    });
  });

  /**
   * POST /v1/operations/decay/batch
   *
   * Execute or preview a batch operation on knowledge entries.
   * Supports extend, mark-review, deactivate, and supersede actions.
   */
  app.post('/v1/operations/decay/batch', async (request, _reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:update');

    const body = batchOperationRequestSchema.parse(request.body);
    const service = getDecayBatchService();
    const result = body.dryRun
      ? await service.previewBatch({ auth, command: body })
      : await service.executeBatch({ auth, command: body });

    const logConfig = loadUserOpsLogConfig();
    await logUserOperation(logConfig, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'decay-batch',
      targetId: null,
      teamId: auth.activeTeamId,
      metadata: {
        action: body.action,
        dryRun: body.dryRun,
        entryCount: body.entryIds.length,
        eligibleCount: result.totalEligible,
      },
    });

    return batchOperationResponseSchema.parse(result);
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
    const patternLower = pattern.toLowerCase();

    // Get knowledge entries using repository
    const { knowledge: knowledgeRepo } = app.skillShareer.repos;
    const allEntries = await knowledgeRepo.listByFilter({});
    const config = loadDecayConfig();
    const now = new Date();

    // Filter by permission first
    const permittedEntries = filterEntriesByPermission(
      allEntries.map((e) => ({
        id: e.id,
        teamId: e.teamId,
        requiredLevel: e.requiredLevel,
        lifecycleState: e.lifecycleState,
      })),
      auth,
    );
    const permittedIds = new Set(permittedEntries.map((e) => e.id));

    // Enrich and filter entries
    const items: DecayAwareListItem[] = [];

    for (const entry of allEntries) {
      // Skip entries not permitted for this user
      if (!permittedIds.has(entry.id)) continue;

      // Text search on shortcut + detail
      const searchText = `${entry.shortcut} ${entry.detail}`.toLowerCase();
      if (pattern && !searchText.includes(patternLower)) continue;

      // Compute decay state
      const decayResult = entry.decayMeta
        ? computeDecayState(
            {
              lastVerifiedAt: entry.decayMeta.lastVerifiedAt,
              decayState: entry.decayMeta.decayState,
              supersededById: entry.decayMeta.supersededById,
            },
            config,
            now,
          )
        : null;

      const decayState = decayResult?.decayState ?? null;
      const ageDays = computeAgeDays(entry.decayMeta?.lastVerifiedAt ?? null, now);
      const lastVerifiedAt = entry.decayMeta?.lastVerifiedAt ?? null;
      const freshnessType = entry.decayMeta?.freshnessType ?? null;
      const supersededById = entry.decayMeta?.supersededById ?? null;

      // Filter by decayStates if provided
      if (body.decayStates && body.decayStates.length > 0) {
        if (!decayState || !body.decayStates.includes(decayState)) continue;
      }

      // Filter by age range if provided
      if (body.ageMinDays !== undefined) {
        if (ageDays === null || ageDays < body.ageMinDays) continue;
      }
      if (body.ageMaxDays !== undefined) {
        if (ageDays === null || ageDays > body.ageMaxDays) continue;
      }

      // Filter by labels if provided
      if (body.labels && body.labels.length > 0) {
        const hasAllLabels = body.labels.every((label) => entry.labels.includes(label));
        if (!hasAllLabels) continue;
      }

      // Filter by scope if provided
      if (body.scope && entry.scope !== body.scope) continue;

      // Build item
      items.push(
        decayAwareListItemSchema.parse({
          id: entry.id,
          scope: entry.scope,
          labels: entry.labels,
          shortcut: entry.shortcut,
          lifecycleState: entry.lifecycleState,
          requiredLevel: entry.requiredLevel,
          updatedAt: entry.updatedAt,
          decayState,
          freshnessType,
          ageDays,
          lastVerifiedAt,
          supersededById,
        }),
      );
    }

    // Sort by updatedAt descending, then apply limit
    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const total = items.length;
    const limitedItems = items.slice(0, body.limit);

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
        total,
        returned: limitedItems.length,
        filters: body,
      },
    });

    return decayEntryListResponseSchema.parse({
      items: limitedItems,
      total,
    });
  });
};
