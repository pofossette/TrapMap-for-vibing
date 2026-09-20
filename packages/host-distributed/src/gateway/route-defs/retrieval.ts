/**
 * Retrieval surface on the distributed gateway: `/v1/retrieval/search`, the
 * `/v2` capsule pipeline, `/v3` graph-plan and skills-by-content.
 *
 * Split out of `knowledge.ts` to keep that file inside its line budget; it is
 * composed back in at the same position, so the registered order is unchanged.
 * `latencyEndpoint` is set after the body spread in every handler — it is a
 * metric label, so a client must never be able to choose one.
 */

import type { RouteDef } from '@trapmap/backend-core';

import {
  capsuleSearchBodySchema,
  forward,
  gatewayRouteDef,
  graphPlanSearchBodySchema,
  searchBodyArgs,
  searchBodySchema,
  skillLookupArgs,
  skillLookupBodySchema,
} from './shared.js';

export function createRetrievalRoutes(): RouteDef[] {
  return [
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/retrieval/search',
      schema: searchBodySchema,
      handler: async (ctx, clients) => {
        return forward(
          clients.knowledgeRead.search({
            ...searchBodyArgs(ctx),
            latencyEndpoint: 'v1-search',
          }),
        );
      },
    }),
    // Capsule-native pipeline: different pool, different channels, different
    // response shape than v1 — see docs/architecture/components/RETRIEVAL.md.
    gatewayRouteDef({
      method: 'POST',
      path: '/v2/retrieval/search',
      schema: capsuleSearchBodySchema,
      handler: async (ctx, clients) => {
        const body = ctx.body as { seed: string; maxResults?: number };
        return forward(
          clients.knowledgeRead.searchCapsules({
            query: body.seed,
            ...(body.maxResults !== undefined ? { limit: body.maxResults } : {}),
            latencyEndpoint: 'v2-capsule',
          }),
        );
      },
    }),
    // v3 is a genuinely separate pipeline: trap-first graph-plan compilation
    // with a governed fallback, returning `GraphPlanSearchResponse` — the shape
    // `trapmap load` and the retrieval eval consume.
    gatewayRouteDef({
      method: 'POST',
      path: '/v3/retrieval/search',
      schema: graphPlanSearchBodySchema,
      handler: async (ctx, clients) => {
        const body = ctx.body as {
          seed: string;
          skillBudget?: number;
          maxDepth?: number;
          fallbackMode?: 'auto' | 'v2-capsule' | 'v1-graph-assisted';
        };
        return forward(
          clients.knowledgeRead.searchGraphPlan({
            seed: body.seed,
            ...(body.skillBudget !== undefined ? { skillBudget: body.skillBudget } : {}),
            ...(body.maxDepth !== undefined ? { maxDepth: body.maxDepth } : {}),
            ...(body.fallbackMode !== undefined ? { fallbackMode: body.fallbackMode } : {}),
            latencyEndpoint: 'v3-graph-plan',
          }),
        );
      },
    }),
    gatewayRouteDef({
      method: 'POST',
      path: '/v1/retrieval/skills/search-by-content',
      schema: skillLookupBodySchema,
      handler: async (ctx, clients) => {
        return forward(clients.knowledgeRead.searchByContent(skillLookupArgs(ctx)));
      },
    }),
  ];
}
