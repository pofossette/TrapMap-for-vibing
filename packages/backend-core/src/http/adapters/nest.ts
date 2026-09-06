/**
 * NestJS adapter for RouteDefs.
 *
 * `createNestAdapter` builds a controller class whose methods are decorated
 * from the RouteDef list at factory time, so the same RouteDefs registered
 * by a service package are served by the Nest host with identical paths and
 * behavior. Handlers throw on error; the host's global exception filter maps
 * them to the canonical envelope. `RouteDefExceptionFilter` is the shared
 * companion filter implementing that canonical mapping for hosts (or tests)
 * that do not have their own richer filter.
 */

import 'reflect-metadata';

import {
  type ArgumentsHost,
  type CanActivate,
  Catch,
  Controller,
  Delete,
  type ExceptionFilter,
  Get,
  Patch,
  Post,
  Put,
  Req,
  Res,
  type Type,
  UseGuards,
} from '@nestjs/common';

import {
  type HttpMethod,
  isRouteResponse,
  mapErrorToEnvelope,
  type RouteDef,
} from '../route-contract.js';

const METHOD_DECORATORS: Record<HttpMethod, (path?: string) => MethodDecorator> = {
  GET: Get,
  POST: Post,
  PUT: Put,
  PATCH: Patch,
  DELETE: Delete,
};

/**
 * Structural request/response shapes accepted by the adapter. Nest on
 * platform-fastify injects FastifyRequest/FastifyReply; on express it
 * injects ExpressRequest/Response — both satisfy these shapes.
 */
export interface NestAdapterRequest {
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, unknown>;
  /** Host-level fields attached by guards/context extractors (e.g. authContext). */
  [key: string]: unknown;
}

export interface NestAdapterResponse {
  status(code: number): { send(body: unknown): unknown };
}

/**
 * Host-specific adapter options.
 *
 * - `guards`: session/authorization guards applied per route. A route is
 *   guarded unless its path appears in `openRoutes` (exact match) — hosts
 *   keep authentication in their guard layer, never in handlers.
 * - `context`: enriches the assembled RouteContext with per-request fields
 *   that are not part of params/query/body/headers (e.g. the auth context
 *   resolved by a guard); the route schema decides which fields survive.
 */
export interface NestAdapterOptions {
  guards?: Type<CanActivate>[];
  openRoutes?: readonly string[];
  context?: (request: NestAdapterRequest & Record<string, unknown>) => Record<string, unknown>;
}

function methodNameFor(route: Pick<RouteDef, 'method' | 'path'>): string {
  return `handle_${route.method.toLowerCase()}_${route.path.replace(/[^a-z0-9]+/gi, '_')}`;
}

/**
 * Builds a Nest controller class serving the given route defs. The deps are
 * captured by closure (the controller has no constructor dependencies), so
 * hosts can register it directly in a module's `controllers` list.
 */
export function createNestAdapter(
  routeDefs: RouteDef[],
  deps: unknown,
  options?: NestAdapterOptions,
): Type<unknown> {
  class RouteDefController {}
  // NOTE: applied functionally (not `@Controller()` syntax) so the file stays
  // parseable on toolchains that preserve native decorator syntax (Vite 8/oxc)
  // while running on Node versions without decorator support. `Controller()`
  // returns a metadata-only legacy class decorator, so this is identical.
  Controller()(RouteDefController);

  const prototype = RouteDefController.prototype;

  for (const route of routeDefs) {
    const methodName = methodNameFor(route);
    if (methodName in prototype) {
      throw new Error(
        `RouteDef adapter: duplicate method name ${methodName} for ${route.method} ${route.path}`,
      );
    }

    const routeGuards =
      options?.guards && options.guards.length > 0 && !options.openRoutes?.includes(route.path)
        ? options.guards
        : undefined;

    Object.defineProperty(prototype, methodName, {
      configurable: true,
      writable: true,
      value: async function (
        this: unknown,
        request: NestAdapterRequest,
        response: NestAdapterResponse,
      ) {
        const context = route.schema.parse({
          params: request.params ?? {},
          query: request.query ?? {},
          body: request.body,
          headers: request.headers ?? {},
          ...(options?.context ? options.context(request) : {}),
        });
        const result = await route.handler(context, deps);
        if (isRouteResponse(result)) {
          return response.status(result.status).send(result.body);
        }
        return response.status(route.successStatus ?? 200).send(result);
      },
    });

    const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName);
    if (!descriptor) {
      throw new Error(`RouteDef adapter: failed to materialize ${methodName}`);
    }

    METHOD_DECORATORS[route.method](route.path)(prototype, methodName, descriptor);
    if (routeGuards) {
      UseGuards(...routeGuards)(prototype, methodName, descriptor);
    }
    Req()(prototype, methodName, 0);
    Res()(prototype, methodName, 1);
  }

  return RouteDefController;
}

/**
 * Canonical-envelope exception filter for RouteDef-served apps.
 *
 * Maps InvocationError/ZodError/unknown to the canonical envelope
 * (`code/message/kind/requestId?/traceId?/details?`) with the same status
 * mapping the Fastify adapter uses. Hosts with richer filters (e.g.
 * host-local's AllExceptionFilter, which adds requestId/traceId from request
 * context) keep their own filter; this one is the shared, standalone
 * implementation for tests and filter-less hosts.
 */
export class RouteDefExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{
      sent?: boolean;
      status?: (code: number) => { send(body: unknown): unknown };
      raw?: {
        writableEnded?: boolean;
        statusCode?: number;
        setHeader?: (name: string, value: string) => void;
        end?: (body: string) => void;
      };
    }>();

    const { status, envelope } = mapErrorToEnvelope(exception);

    if ('sent' in response && response.sent) {
      return;
    }

    if (typeof response.status === 'function') {
      response.status(status).send(envelope);
      return;
    }

    if (response.raw && !response.raw.writableEnded && typeof response.raw.end === 'function') {
      response.raw.statusCode = status;
      response.raw.setHeader?.('content-type', 'application/json; charset=utf-8');
      response.raw.end(JSON.stringify(envelope));
    }
  }
}

// NOTE: see above — `Catch()` is a metadata-only legacy class decorator.
Catch()(RouteDefExceptionFilter);
