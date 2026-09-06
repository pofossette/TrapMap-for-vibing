import { InvocationError, type RouteContext, type RouteDef } from '@trapmap/backend-core';
import {
  disabledExperienceGeneSearchResponse,
  type ExperienceGeneMode,
  type GeneSearchQuery,
  type GeneSearchResponse,
  geneSearchQuerySchema,
} from '@trapmap/contracts';
import { type ZodType, z } from 'zod';

export interface ExperienceGeneSearchAccess {
  teamId: string | null;
  securityLevel: number;
}

export interface ExperienceGeneSearchContext {
  teamId: string | null;
  maxRequiredLevel: number;
}

export interface ExperienceGeneRouteDeps {
  mode: ExperienceGeneMode;
  searchGenes(
    input: GeneSearchQuery,
    context: ExperienceGeneSearchContext,
  ): Promise<GeneSearchResponse>;
}

const emptyRecord = z.record(z.string(), z.unknown());
const headersSchema = z.record(z.string(), z.unknown());

const geneSearchHttpSchema = z.object({
  params: emptyRecord,
  query: emptyRecord,
  headers: headersSchema,
  body: geneSearchQuerySchema,
  // Distributed gateways inject the authenticated actor after adapter auth.
  actor: z.unknown().optional(),
});

function headerString(headers: Record<string, unknown>, name: string): string | null {
  const value = headers[name];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function accessFromContext(ctx: RouteContext & { headers: Record<string, unknown> }) {
  const actor = typeof ctx.actor === 'object' && ctx.actor !== null ? ctx.actor : null;
  if (actor && 'teamId' in actor && 'securityLevel' in actor) {
    return {
      teamId: typeof actor.teamId === 'string' ? actor.teamId : null,
      securityLevel: typeof actor.securityLevel === 'number' ? actor.securityLevel : Number.NaN,
    };
  }
  return {
    teamId: headerString(ctx.headers, 'x-trapmap-team-id'),
    securityLevel: Number.parseInt(headerString(ctx.headers, 'x-trapmap-security-level') ?? '', 10),
  };
}

export function toExperienceGeneSearchContext(
  filters: GeneSearchQuery['filters'],
  access: ExperienceGeneSearchAccess,
): ExperienceGeneSearchContext {
  if (filters.teamId != null && filters.teamId !== access.teamId) {
    throw InvocationError.forbidden('Requested team is outside the authenticated scope');
  }
  return {
    teamId: filters.teamId ?? access.teamId,
    maxRequiredLevel: Number.isFinite(access.securityLevel) ? access.securityLevel : 0,
  };
}

function experienceGeneRouteDef<Ctx extends RouteContext>(def: {
  method: 'POST';
  path: '/internal/retrieval/genes/search' | '/v1/retrieval/genes/search';
  schema: ZodType<Ctx>;
  handler(ctx: Ctx, deps: ExperienceGeneRouteDeps): Promise<unknown>;
}): RouteDef<Ctx, ExperienceGeneRouteDeps> {
  return def;
}

export function createExperienceGeneRouteDefs(
  _deps: ExperienceGeneRouteDeps,
): RouteDef<RouteContext, ExperienceGeneRouteDeps>[] {
  return [
    experienceGeneRouteDef({
      method: 'POST',
      path: '/internal/retrieval/genes/search',
      schema: geneSearchHttpSchema,
      handler: async (ctx, routeDeps) => {
        if (routeDeps.mode === 'off') return disabledExperienceGeneSearchResponse();
        return routeDeps.searchGenes(
          ctx.body,
          toExperienceGeneSearchContext(ctx.body.filters, accessFromContext(ctx)),
        );
      },
    }),
    experienceGeneRouteDef({
      method: 'POST',
      path: '/v1/retrieval/genes/search',
      schema: geneSearchHttpSchema,
      handler: async (ctx, routeDeps) => {
        if (routeDeps.mode === 'off' || routeDeps.mode === 'shadow') {
          return disabledExperienceGeneSearchResponse();
        }
        return routeDeps.searchGenes(
          ctx.body,
          toExperienceGeneSearchContext(ctx.body.filters, accessFromContext(ctx)),
        );
      },
    }),
  ];
}
