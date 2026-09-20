/**
 * Retrieval surface as session-guarded gateway routes: `/v1/retrieval/search`,
 * the `/v2` capsule pipeline, `/v3` graph-plan and skills-by-content.
 *
 * Split out of `gateway.route-defs.ts` to keep that file inside its line
 * budget; it is composed back in at the same position, so the registered order
 * is unchanged. The `latencyEndpoint` labels are hardcoded *after* the body
 * spread in every handler below — they feed a metric label, so a client must
 * never be able to choose one.
 */

import type { RouteDef } from '@trapmap/backend-core';
import {
  graphPlanSearchQuerySchema,
  retrievalV2QuerySchema,
  skillLookupQuerySchema,
} from '@trapmap/contracts';
import {
  knowledgeReadInternalSearchSchema,
  toKnowledgeReadSearchArgs,
} from '@trapmap/service-knowledge-read';
import { z } from 'zod';

import {
  authContextSchema,
  emptyRecord,
  type GatewayRouteDeps,
  gatewayRouteDef,
} from './gateway.route-kit.js';

export function createRetrievalGatewayRouteDefs(_deps: GatewayRouteDeps): RouteDef[] {
  return [
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/retrieval/search',
      schema: knowledgeReadInternalSearchSchema,
      successStatus: 200,
      handler: async (ctx, deps) => {
        return deps.knowledgeRead.search({
          ...toKnowledgeReadSearchArgs(ctx.body as Parameters<typeof toKnowledgeReadSearchArgs>[0]),
          latencyEndpoint: 'v1-search',
        });
      },
    }),

    // v2 is a genuinely separate pipeline (capsule pool + three capsule
    // channels + RRF), not a label on v1 — different pool and response shape.
    gatewayRouteDef({
      method: 'POST',
      path: '/v2/retrieval/search',
      schema: z.object({
        params: emptyRecord,
        query: emptyRecord,
        body: retrievalV2QuerySchema,
        authContext: authContextSchema,
      }),
      successStatus: 200,
      handler: async (ctx, deps) => {
        if (!deps.knowledgeRead.searchCapsules) {
          throw new Error('this deployment has no capsule retrieval pipeline wired');
        }
        const body = ctx.body as { seed: string; maxResults?: number };
        return deps.knowledgeRead.searchCapsules({
          query: body.seed,
          ...(body.maxResults !== undefined ? { limit: body.maxResults } : {}),
          latencyEndpoint: 'v2-capsule',
        });
      },
    }),

    // v3 is a genuinely separate pipeline: trap-first graph-plan compilation
    // with a governed fallback, returning `GraphPlanSearchResponse` — the shape
    // `trapmap load` and the retrieval eval consume.
    gatewayRouteDef({
      method: 'POST',
      path: '/v3/retrieval/search',
      schema: z.object({
        params: emptyRecord,
        query: emptyRecord,
        body: graphPlanSearchQuerySchema,
        authContext: authContextSchema,
      }),
      successStatus: 200,
      handler: async (ctx, deps) => {
        if (!deps.knowledgeRead.searchGraphPlan) {
          throw new Error('this deployment has no graph-plan retrieval pipeline wired');
        }
        const body = ctx.body as {
          seed: string;
          skillBudget?: number;
          maxDepth?: number;
          fallbackMode?: 'auto' | 'v2-capsule' | 'v1-graph-assisted';
        };
        return deps.knowledgeRead.searchGraphPlan({
          seed: body.seed,
          ...(body.skillBudget !== undefined ? { skillBudget: body.skillBudget } : {}),
          ...(body.maxDepth !== undefined ? { maxDepth: body.maxDepth } : {}),
          ...(body.fallbackMode !== undefined ? { fallbackMode: body.fallbackMode } : {}),
          latencyEndpoint: 'v3-graph-plan',
        });
      },
    }),

    gatewayRouteDef({
      method: 'POST',
      path: '/v1/retrieval/skills/search-by-content',
      schema: z.object({
        params: emptyRecord,
        query: emptyRecord,
        body: skillLookupQuerySchema,
        authContext: authContextSchema,
      }),
      successStatus: 200,
      handler: async (ctx, deps) => {
        return deps.knowledgeRead.skillLookup({
          text: ctx.body.text,
          maxResults: ctx.body.maxResults,
          ...(ctx.authContext?.activeTeamId ? { teamId: ctx.authContext.activeTeamId } : {}),
        });
      },
    }),
  ];
}
