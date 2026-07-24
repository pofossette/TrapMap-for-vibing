/**
 * Maintenance management routes for ownership verification and SLA tracking.
 *
 * Provides endpoints for the maintenance management interface (MAINT-02):
 * - GET /v1/operations/maintenance/entries: List entries with maintenance metadata filters
 * - POST /v1/admin/reconcile-knowledge-indexes: Reconcile all knowledge indexes (Phase 77)
 */

import {
  type MaintenanceAwareListItem,
  maintenanceAwareListItemSchema,
  maintenanceEntryListRequestSchema,
  maintenanceEntryListResponseSchema,
} from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { computeDecayState, loadDecayConfig } from '@trapmap/server/lib/decay/index.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import { reconcileKnowledgeIndexes } from '@trapmap/server/lib/indexing/pipeline.js';
import {
  isReviewOverdue,
  isStaleVerification,
  toActorRefFromRecord,
} from '@trapmap/server/lib/maintenance/model.js';
import { requirePermission } from '@trapmap/server/lib/rbac.js';
import { resolveAuthContext } from '@trapmap/server/lib/session.js';
import { nowIso } from '@trapmap/server/lib/store.js';
import { loadUserOpsLogConfig, logUserOperation } from '@trapmap/server/lib/user-ops-log.js';
import type { OwnerReadModelProjection } from '@trapmap/server/lib/context.js';

type OwnerReadEntry = Awaited<
  ReturnType<OwnerReadModelProjection['getReadModel']>
>['knowledgeEntries'][number];

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
 * Filter entries by permission (same logic as operations.ts and decay.ts).
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

function matchesMaintenanceFilters(
  entry: OwnerReadEntry,
  query: ReturnType<typeof maintenanceEntryListRequestSchema.parse>,
  lastVerifiedAt: string | null,
  reviewBy: string | null,
  now: Date,
): boolean {
  if (query.missingOwner && entry.maintenanceMeta?.maintainerUserId != null) return false;
  if (query.reviewOverdue && !isReviewOverdue(reviewBy, now)) return false;
  if (
    query.staleVerification &&
    !isStaleVerification(lastVerifiedAt, query.staleDays ?? 180, now)
  ) {
    return false;
  }
  if (query.scope && entry.scope !== query.scope) return false;
  return (
    !query.labels ||
    query.labels.length === 0 ||
    query.labels.every((label) => entry.labels.includes(label))
  );
}

export const maintenanceRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /v1/operations/maintenance/entries
   *
   * List knowledge entries with maintenance-related filters.
   * Supports filtering by missing owner, overdue review, stale verification, scope, and labels.
   */
  app.get('/v1/operations/maintenance/entries', async (request, _reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'knowledge:export');

    // Parse query parameters
    const query = maintenanceEntryListRequestSchema.parse(request.query);

    const ownerReadModel = app.skillShareer.ownerReadModel;
    if (!ownerReadModel) {
      throw new AppError(503, 'knowledge_read_unavailable', 'Knowledge read owner is unavailable');
    }
    const data = await ownerReadModel.getReadModel();
    const decayConfig = loadDecayConfig();
    const now = new Date();

    // Filter by permission first
    const permittedEntries = filterEntriesByPermission(
      data.knowledgeEntries.map((e) => ({
        id: e.id,
        teamId: e.teamId,
        requiredLevel: e.requiredLevel,
        lifecycleState: e.lifecycleState,
      })),
      auth,
    );
    const permittedIds = new Set(permittedEntries.map((e) => e.id));

    // Enrich entries with maintenance metadata
    const items: MaintenanceAwareListItem[] = [];

    for (const entry of data.knowledgeEntries) {
      // Skip entries not permitted for this user
      if (!permittedIds.has(entry.id)) continue;

      const entryDecay = entry.decayMeta;

      // Compute decay state for decay-aware list item base
      const decayResult = entryDecay
        ? computeDecayState(
            {
              lastVerifiedAt: entryDecay.lastVerifiedAt,
              decayState: entryDecay.decayState,
              supersededById: entryDecay.supersededById,
            },
            decayConfig,
            now,
          )
        : null;

      const decayState = decayResult?.decayState ?? null;
      const ageDays = computeAgeDays(entryDecay?.lastVerifiedAt ?? null, now);
      const lastVerifiedAt = entryDecay?.lastVerifiedAt ?? null;
      const freshnessType = entryDecay?.freshnessType ?? null;
      const supersededById = entryDecay?.supersededById ?? null;

      // Get maintenance metadata
      const maintainer = entry.maintenanceMeta ? toActorRefFromRecord(entry.maintenanceMeta) : null;
      const reviewBy = entry.maintenanceMeta?.reviewBy ?? null;

      if (!matchesMaintenanceFilters(entry, query, lastVerifiedAt, reviewBy, now)) continue;

      // Build item
      items.push(
        maintenanceAwareListItemSchema.parse({
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
          maintainer,
          reviewBy,
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
      action: 'maintenance-list',
      targetId: null,
      teamId: auth.activeTeamId,
      metadata: {
        total,
        returned: limitedItems.length,
        filters: query,
      },
    });

    return maintenanceEntryListResponseSchema.parse({
      items: limitedItems,
      total,
    });
  });

  /**
   * POST /v1/admin/reconcile-knowledge-indexes
   *
   * Reconcile all knowledge entries' indexes (vector, keyword, graph).
   * This is a maintenance operation for bulk repair/sync of indexes.
   * Requires system-admin privileges. (Phase 77)
   */
  app.post('/v1/admin/reconcile-knowledge-indexes', async (request, _reply) => {
    const auth = await resolveAuthContext(app.skillShareer, request);

    // Only system-admin can run reconciliation
    if (auth.subjectType !== 'system-admin') {
      throw new AppError(403, 'forbidden', 'Only system admins can reconcile knowledge indexes');
    }

    const startTime = Date.now();
    const registry = app.skillShareer.adapterRegistry;

    const result = await reconcileKnowledgeIndexes({ store: app.skillShareer.store }, registry);

    const durationMs = Date.now() - startTime;

    // Log operation
    const logConfig = loadUserOpsLogConfig();
    await logUserOperation(logConfig, {
      timestamp: nowIso(),
      actorId: auth.actorId,
      actorHandle: auth.handle,
      action: 'reconcile-knowledge-indexes',
      targetId: null,
      teamId: auth.activeTeamId,
      metadata: {
        totalEntries: result.totalEntries,
        entriesSynced: result.entriesSynced,
        entriesRemoved: result.entriesRemoved,
        entriesSkipped: result.entriesSkipped,
        durationMs,
      },
    });

    return {
      success: true,
      ...result,
    };
  });
};
