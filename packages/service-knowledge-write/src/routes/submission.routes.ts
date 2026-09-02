// @ts-nocheck
import {
  InvocationError,
  type RouteContext,
  type RouteDef,
  routeResponse,
} from '@trapmap/backend-core';
import { knowledgeWriteRouteDef } from './helpers.js';
import type { KnowledgeWriteRouteDeps } from './helpers.js';
import {
  reviewDecisionSchema,
  maintenanceDecisionSchema,
  publishCandidateSchema,
  experienceGeneDerivationSchema,
  experienceGeneStalenessSchema,
  rpcSchema,
  healthSchema,
  adminArtifactListSchema,
  adminArtifactDetailSchema,
  reviewDecisionArgs,
  maintenanceDecisionArgs,
  getArtifactAuth,
  isArtifactVisible,
  parseArtifactCursor,
  fetchAllArtifacts,
  fetchArtifactById,
  invokeKnowledgeWriteRpc,
  toConflictCandidate,
  readinessHandler,
  KNOWLEDGE_WRITE_OWNERSHIP,
} from './helpers.js';
import { trustedActor } from '../route-helpers.js';
import type { AdminArtifactQuery } from '@trapmap/contracts';
import { z } from 'zod';

const emptyRecord = z.record(z.string(), z.unknown());
const headersSchema = z.record(z.string(), z.unknown());

export function createKnowledgeSubmissionRouteDefs(): RouteDef<
  RouteContext,
  KnowledgeWriteRouteDeps
>[] {
  return [
    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/knowledge/review/approve',
      schema: reviewDecisionSchema,
      handler: async (ctx, module) => {
        return module.approveReviewDecision(reviewDecisionArgs(ctx));
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/knowledge/review/reject',
      schema: reviewDecisionSchema,
      handler: async (ctx, module) => {
        return module.rejectReviewDecision(reviewDecisionArgs(ctx));
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/knowledge/review/return-for-correction',
      schema: reviewDecisionSchema,
      handler: async (ctx, module) => {
        return module.returnReviewDecision(reviewDecisionArgs(ctx));
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/knowledge/maintenance',
      schema: maintenanceDecisionSchema,
      handler: async (ctx, module) => {
        return module.applyMaintenanceDecision(maintenanceDecisionArgs(ctx));
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/knowledge/decay',
      schema: maintenanceDecisionSchema,
      handler: async (ctx, module) => {
        return module.applyDecayDecision(maintenanceDecisionArgs(ctx));
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/candidates/publish',
      schema: publishCandidateSchema,
      handler: async (ctx, module) => {
        const body = trustedActor(ctx.headers ?? {}, ctx.body);
        return module.publishCandidateResult(body);
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/experience-genes/derive',
      schema: experienceGeneDerivationSchema,
      handler: async (ctx, deps) => {
        if (!deps.experienceGeneDerive) {
          throw InvocationError.unavailable('experience gene derivation is not assembled');
        }
        return deps.experienceGeneDerive(ctx.body);
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/experience-genes/derivation-plan',
      schema: z.object({
        params: emptyRecord,
        query: emptyRecord,
        headers: headersSchema,
        body: z.unknown(),
      }),
      handler: async (ctx, deps) => {
        if (!deps.planExperienceGeneDerivations) {
          throw InvocationError.unavailable('experience gene planning is not assembled');
        }
        return { tasks: await deps.planExperienceGeneDerivations(ctx.body) };
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/experience-genes/stale',
      schema: experienceGeneStalenessSchema,
      handler: async (ctx, deps) => {
        if (!deps.markExperienceGenesStale) {
          throw InvocationError.unavailable('experience gene staleness handling is not assembled');
        }
        return { marked: await deps.markExperienceGenesStale(ctx.body) };
      },
    }),

    knowledgeWriteRouteDef({
      method: 'POST',
      path: '/internal/rpc/knowledge-write',
      schema: rpcSchema,
      handler: async (ctx, module) => {
        const input = trustedActor(ctx.headers ?? {}, ctx.body.input ?? {});
        const result = await invokeKnowledgeWriteRpc(module, ctx.body.method, input);
        return { ok: true, result };
      },
    }),

    knowledgeWriteRouteDef({
      method: 'GET',
      path: '/internal/health',
      schema: healthSchema,
      handler: async (_ctx, _module) => ({
        status: 'ok',
        service: 'knowledge-write',
        owner: KNOWLEDGE_WRITE_OWNERSHIP.boundedContext,
        acceptsDelegationFrom: KNOWLEDGE_WRITE_OWNERSHIP.acceptsDelegationFrom,
      }),
    }),

    knowledgeWriteRouteDef({
      method: 'GET',
      path: '/internal/live',
      schema: healthSchema,
      handler: async () => ({ status: 'alive', service: 'knowledge-write' }),
    }),

    knowledgeWriteRouteDef({
      method: 'GET',
      path: '/internal/readiness',
      schema: healthSchema,
      handler: async (_ctx, module) => readinessHandler(module, 'knowledge-write')(),
    }),

    knowledgeWriteRouteDef({
      method: 'GET',
      path: '/internal/ready',
      schema: healthSchema,
      handler: async (_ctx, module) => readinessHandler(module, 'knowledge-write')(),
    }),

    knowledgeWriteRouteDef({
      method: 'GET',
      path: '/internal/ownership',
      schema: healthSchema,
      handler: async () => KNOWLEDGE_WRITE_OWNERSHIP,
    }),

    knowledgeWriteRouteDef({
      method: 'GET',
      path: '/internal/operator-status',
      schema: healthSchema,
      handler: async (_ctx, module) => {
        try {
          const details = (await module.getOperatorStatus?.()) ?? {};
          return {
            service: 'knowledge-write',
            owner: KNOWLEDGE_WRITE_OWNERSHIP.boundedContext,
            ...details,
          };
        } catch (error) {
          return routeResponse(503, {
            service: 'knowledge-write',
            owner: KNOWLEDGE_WRITE_OWNERSHIP.boundedContext,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      },
    }),

    knowledgeWriteRouteDef({
      method: 'GET',
      path: '/api/admin/artifacts',
      schema: adminArtifactListSchema,
      handler: async (ctx, deps) => {
        // Enforce trusted actor — 401 if missing
        trustedActor(ctx.headers ?? {}, {} as Record<string, unknown>);
        const query = ctx.query as unknown as AdminArtifactQuery; // lib type gap: dynamic admin port probe
        const auth = getArtifactAuth(ctx.headers ?? {});
        const all = await fetchAllArtifacts(deps);
        const effectiveLifecycle = query.lifecycleState ?? query.lifecycle;
        const effectiveLevel = query.requiredLevel ?? query.level;
        const search = query.search?.trim().toLowerCase() ?? '';
        const cursor = query.cursor;
        const limit = query.limit;
        const filtered = all.filter((artifact) => {
          if (!isArtifactVisible(artifact, auth)) return false;
          if (effectiveLifecycle && artifact.lifecycleState !== effectiveLifecycle) return false;
          if (query.scope && artifact.scope !== query.scope) return false;
          if (effectiveLevel !== undefined && artifact.requiredLevel !== effectiveLevel)
            return false;
          if (search.length > 0) {
            const hit = [artifact.id, artifact.title, artifact.slug, ...artifact.labels].some(
              (value) => value.toLowerCase().includes(search),
            );
            if (!hit) return false;
          }
          return true;
        });
        const sorted = [...filtered].sort(
          (left, right) =>
            right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id),
        );
        const offset = parseArtifactCursor(cursor);
        const paged = sorted.slice(offset, offset + limit);
        return {
          items: paged,
          filteredTotal: sorted.length,
          total: all.length,
          nextCursor: offset + limit < sorted.length ? String(offset + limit) : null,
        };
      },
    }),

    knowledgeWriteRouteDef({
      method: 'GET',
      path: '/api/admin/artifacts/:id',
      schema: adminArtifactDetailSchema,
      handler: async (ctx, deps) => {
        try {
          trustedActor(ctx.headers ?? {}, {} as Record<string, unknown>);
          const auth = getArtifactAuth(ctx.headers ?? {});
          const artifact = await fetchArtifactById(deps, (ctx.params as { id: string }).id);
          if (!artifact) {
            throw InvocationError.notFound('Artifact not found');
          }
          if (!isArtifactVisible(artifact as any, auth)) {
            throw InvocationError.notFound('Artifact not found');
          }
          return artifact;
        } catch (e) {
          const fs = await import('node:fs');
          const msg = e instanceof Error ? e.message + '\n' + e.stack : String(e);
          fs.appendFileSync('/tmp/kw_handler_error.log', msg + '\n---\n');
          throw e;
        }
      },
    }),
  ];
}
