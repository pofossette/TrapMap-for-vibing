/**
 * Fastify adapter for RouteDefs.
 *
 * Thin translation layer: Fastify request -> RouteContext, handler result ->
 * Fastify response. Error mapping uses the shared canonical envelope
 * (`mapErrorToEnvelope`) and renders it in the standalone-service wire
 * convention `{ error, kind }` + status, which the Fastify services have
 * always used.
 */

import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type FastifyServerOptions,
} from 'fastify';

import { type RouteDef, isRouteResponse, mapErrorToEnvelope } from '../route-contract.js';

/**
 * Builds a standalone Fastify app serving the given route defs.
 */
export function createFastifyAdapter(
  routeDefs: RouteDef[],
  deps: unknown,
  options?: FastifyServerOptions,
): FastifyInstance {
  const app = Fastify(options);
  registerFastifyRoutes(app, routeDefs, deps);
  return app;
}

/**
 * Registers route defs onto an existing Fastify instance (used by hosts that
 * assemble their own app, e.g. the distributed gateway's service plugins).
 */
export function registerFastifyRoutes(
  app: FastifyInstance,
  routeDefs: RouteDef[],
  deps: unknown,
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
          });
          const result = await route.handler(context, deps);
          if (isRouteResponse(result)) {
            return reply.status(result.status).send(result.body);
          }
          return reply.status(route.successStatus ?? 200).send(result);
        } catch (error) {
          const { status, envelope } = mapErrorToEnvelope(error);
          return reply.status(status).send({ error: envelope.message, kind: envelope.kind });
        }
      },
    });
  }
}
