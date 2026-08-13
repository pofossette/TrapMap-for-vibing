/**
 * Fastify adapter for RouteDefs.
 *
 * Thin translation layer: Fastify request -> RouteContext, handler result ->
 * Fastify response. Error mapping uses the shared canonical envelope
 * (`mapErrorToEnvelope`) and renders the full envelope
 * (`code/message/kind/requestId?/traceId?/error?/details?`) + status, which
 * is the unified wire convention across every Fastify host.
 */

import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type FastifyServerOptions,
} from 'fastify';

import { type RouteDef, isRouteResponse, mapErrorToEnvelope } from '../route-contract.js';

/**
 * Host-specific adapter options. `context` lets a host enrich the assembled
 * RouteContext with per-request fields that are not part of
 * params/query/body/headers (e.g. the authenticated actor resolved by a
 * host-level auth hook); the route schema decides which fields survive.
 */
export interface FastifyAdapterOptions {
  context?: (request: FastifyRequest) => Record<string, unknown>;
}

/**
 * Builds a standalone Fastify app serving the given route defs.
 */
export function createFastifyAdapter(
  routeDefs: RouteDef[],
  deps: unknown,
  options?: FastifyServerOptions,
  adapterOptions?: FastifyAdapterOptions,
): FastifyInstance {
  const app = Fastify(options);
  registerFastifyRoutes(app, routeDefs, deps, adapterOptions);
  return app;
}

/**
 * Registers route defs onto an existing Fastify instance (used by hosts that
 * assemble their own app, e.g. the distributed gateway).
 */
export function registerFastifyRoutes(
  app: FastifyInstance,
  routeDefs: RouteDef[],
  deps: unknown,
  adapterOptions?: FastifyAdapterOptions,
): void {
  for (const route of routeDefs) {
    app.route({
      method: route.method,
      url: route.path,
      handler: async (request: FastifyRequest, reply: FastifyReply) => {
        try {
          const context = route.schema.parse({
            params: request.params ?? {},
            query: request.query ?? {},
            body: request.body,
            headers: request.headers ?? {},
            ...(adapterOptions?.context ? adapterOptions.context(request) : {}),
          });
          const result = await route.handler(context, deps);
          if (isRouteResponse(result)) {
            return reply.status(result.status).send(result.body);
          }
          return reply.status(route.successStatus ?? 200).send(result);
        } catch (error) {
          const { status, envelope } = mapErrorToEnvelope(error);
          return reply.status(status).send({
            ...envelope,
            requestId: typeof request.id === 'string' ? request.id : undefined,
          });
        }
      },
    });
  }
}
