/**
 * Shared building blocks for the host-local gateway RouteDef files.
 *
 * Both the knowledge/candidate/review surface and the cron management
 * surface declare framework-neutral RouteDefs through {@link gatewayRouteDef};
 * the AuthGuard runs before every route, so handlers read the resolved auth
 * context directly from the adapter-enriched RouteContext.
 */

import type {
  CandidateIngestionPort,
  HttpMethod,
  KnowledgeReadPort,
  ReviewPort,
  RouteContext,
  RouteDef,
} from '@trapmap/backend-core';
import type { CronServiceModule } from '@trapmap/service-cron';
import { type ZodType, z } from 'zod';

import type { resolveHostLocalAuthContext } from '../runtime/auth-context.js';
import type { HostLocalRuntime } from '../runtime/host-runtime.js';

export type GatewayAuthContext = Awaited<ReturnType<typeof resolveHostLocalAuthContext>>;

export interface GatewayRouteDeps {
  knowledgeRead: KnowledgeReadPort;
  candidateIngestion: CandidateIngestionPort;
  governanceReview: ReviewPort;
  cron: CronServiceModule;
  runtime: HostLocalRuntime;
}

export interface GatewayRouteContext extends RouteContext {
  authContext?: GatewayAuthContext;
}

export const emptyRecord = z.record(z.string(), z.unknown());
/**
 * The AuthGuard runs before every route below, so the schema requires the
 * auth context field; the adapter injects it from the request. 401 stays in
 * the guard layer (裁决 b), so handlers never re-check it.
 */
export const authContextSchema = z.custom<GatewayAuthContext>();

/**
 * The AuthGuard guarantees the auth context on guarded routes, so handlers
 * read `ctx.authContext` directly — 401 never enters the handler layer.
 */
export function gatewayRouteDef<Ctx extends GatewayRouteContext>(def: {
  method: HttpMethod;
  path: string;
  schema: ZodType<Ctx>;
  successStatus?: number;
  handler(ctx: Ctx, deps: GatewayRouteDeps): Promise<unknown>;
}): RouteDef<Ctx, GatewayRouteDeps> {
  return def;
}
