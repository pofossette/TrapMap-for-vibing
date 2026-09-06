// @ts-nocheck

import type { RouteContext, RouteDef } from '@trapmap/backend-core';
import { InvocationError, isRouteResponse } from '@trapmap/backend-core';
import {
  filterReviewQueueEntries,
  isReviewQueueEntryVisible,
} from '@trapmap/backend-core/governance-review/domain/policy.js';
import { applyReviewQueueQuery } from '@trapmap/backend-core/governance-review/domain/review-queue-query.js';
import type { AdminReviewQueueQuery } from '@trapmap/contracts';
import type { GovernanceReviewRouteDeps } from './helpers.js';
import {
  adminActivitySchema,
  adminReviewDecisionSchema,
  adminReviewDetailSchema,
  adminReviewQueueSchema,
  decodeActivityCursor,
  fetchActivityEvents,
  fetchAllReviewEntries,
  fetchReviewEntryById,
  getGovernanceAuth,
  governanceRouteDef,
  normalizeActivityType,
  readAdminActor,
  toReviewQueueItem,
} from './helpers.js';

export function createGovernanceQueueRouteDefs(): RouteDef<
  RouteContext,
  GovernanceReviewRouteDeps
>[] {
  return [
    governanceRouteDef({
      method: 'GET',
      path: '/api/admin/reviews',
      schema: adminReviewQueueSchema,
      handler: async (ctx, deps) => {
        const actor = readAdminActor((ctx.headers as Record<string, unknown>) ?? {}, ctx.body);
        if (isRouteResponse(actor)) return actor;
        const query = ctx.query as unknown as AdminReviewQueueQuery;
        const auth = getGovernanceAuth((ctx.headers as Record<string, unknown>) ?? {});
        const allEntries = await fetchAllReviewEntries(deps);
        const governed = filterReviewQueueEntries(allEntries, {
          auth,
          ...(query.status !== undefined ? { status: query.status } : {}),
        });
        const teamScoped =
          query.teamId !== undefined
            ? governed.filter((e) => (e as Record<string, unknown>).teamId === query.teamId)
            : governed;
        const queueQuery: Record<string, unknown> = {
          ...(query.status !== undefined ? { status: query.status } : {}),
          ...(query.search !== undefined ? { search: query.search } : {}),
          ...(query.source !== undefined ? { source: query.source } : {}),
          ...(query.riskLevel !== undefined ? { riskLevel: query.riskLevel } : {}),
          sort: query.sort,
          ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
          limit: query.limit,
        };
        const result = applyReviewQueueQuery(
          teamScoped,
          queueQuery as unknown as Parameters<typeof applyReviewQueueQuery>[1],
        );
        const items = result.items.map(toReviewQueueItem);
        return {
          items,
          nextCursor: result.nextCursor,
          filteredTotal: result.filteredTotal,
          total: result.total,
        };
      },
    }),
    governanceRouteDef({
      method: 'GET',
      path: '/api/admin/reviews/:id',
      schema: adminReviewDetailSchema,
      handler: async (ctx, deps) => {
        const actor = readAdminActor((ctx.headers as Record<string, unknown>) ?? {}, ctx.body);
        if (isRouteResponse(actor)) return actor;
        const auth = getGovernanceAuth((ctx.headers as Record<string, unknown>) ?? {});
        const entry = await fetchReviewEntryById(deps, (ctx.params as { id: string }).id);
        if (!entry) throw InvocationError.notFound('Review not found');
        if (!isReviewQueueEntryVisible(entry, auth))
          throw InvocationError.notFound('Review not found');
        return { entry, activity: [], files: [] };
      },
    }),
    governanceRouteDef({
      method: 'GET',
      path: '/api/admin/activity',
      schema: adminActivitySchema,
      handler: async (ctx, deps) => {
        const actor = readAdminActor((ctx.headers as Record<string, unknown>) ?? {}, ctx.body);
        if (isRouteResponse(actor)) return actor;
        const query = ctx.query as unknown as {
          actor?: string;
          type?: string;
          search?: string;
          from?: string;
          to?: string;
          cursor?: string;
          limit: number;
        };
        const events = await fetchActivityEvents(deps);
        const filtered = events.filter((event) => {
          if (query.actor && !event.actor.toLowerCase().includes(query.actor.toLowerCase()))
            return false;
          if (query.type && normalizeActivityType(event.typeLabel) !== query.type) return false;
          if (query.search) {
            const s = query.search.trim().toLowerCase();
            if (s.length > 0) {
              const hit = [event.title, event.actor, event.description].some((v) =>
                v.toLowerCase().includes(s),
              );
              if (!hit) return false;
            }
          }
          if (query.from && event.timestamp < query.from) return false;
          if (query.to && event.timestamp > query.to) return false;
          return true;
        });
        const sorted = [...filtered].sort(
          (a, b) => b.timestamp.localeCompare(a.timestamp) || a.id.localeCompare(b.id),
        );
        const offset = decodeActivityCursor(query.cursor);
        const limit = query.limit;
        const paged = sorted.slice(offset, offset + limit);
        return {
          events: paged,
          filteredTotal: sorted.length,
          total: events.length,
          nextCursor: offset + limit < sorted.length ? String(offset + limit) : null,
        };
      },
    }),
    governanceRouteDef({
      method: 'POST',
      path: '/api/admin/reviews/:id/decision',
      schema: adminReviewDecisionSchema,
      handler: async (ctx, deps) => {
        const actor = readAdminActor((ctx.headers as Record<string, unknown>) ?? {}, ctx.body);
        if (isRouteResponse(actor)) return actor;
        const entryId = (ctx.params as { id: string }).id;
        const body = ctx.body as {
          decision: string;
          notes?: string;
          note?: string;
          evidence?: Record<string, unknown>;
        };
        const note = body.notes ?? body.note;
        const input: Record<string, unknown> = {
          entryId,
          actorId: actor as string,
          ...(note !== undefined ? { note } : {}),
          ...(body.evidence !== undefined ? { evidence: body.evidence } : {}),
        };
        if (body.decision === 'approve')
          return (deps as unknown as Record<string, (a: unknown) => Promise<unknown>>).approve(
            input,
          );
        if (body.decision === 'reject')
          return (deps as unknown as Record<string, (a: unknown) => Promise<unknown>>).reject(
            input,
          );
        if (body.decision === 'return-for-correction')
          return (
            deps as unknown as Record<string, (a: unknown) => Promise<unknown>>
          ).returnForCorrection(input);
        throw InvocationError.validation('Unsupported decision');
      },
    }),
  ];
}
