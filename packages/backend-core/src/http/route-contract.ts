/**
 * Framework-neutral HTTP route contract for TrapMap hosts.
 *
 * A RouteDef describes a single HTTP route (method, path, Zod input schema,
 * success status, handler). The framework adapters in `./adapters` translate
 * a framework request into a RouteContext, run the handler, and translate the
 * handler result back into a framework response. This module itself must
 * never import a framework package.
 *
 * Error handling contract:
 * - Handlers throw; they do not write responses.
 * - The shared `mapErrorToEnvelope` maps any thrown error to the canonical
 *   error envelope (`code/message/kind/requestId?/traceId?/details?`).
 * - Every adapter renders that envelope in full: the Fastify adapter sends
 *   the complete canonical envelope plus the fastify request id, and the
 *   Nest host renders it through its global filter (host-local's
 *   AllExceptionFilter enriches it with requestId/traceId from the request
 *   context).
 * - 401 authentication responses stay in each host's guard layer, never in
 *   the adapters or handlers.
 */

import { ZodError, type ZodType } from 'zod';

import { toInvocationErrorResponse } from '../invocation/index.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RouteContext {
  params: Record<string, unknown>;
  query: Record<string, unknown>;
  body: unknown;
  /**
   * Raw request headers, populated by the adapters for routes whose handlers
   * need the trusted-actor or tenant headers. Present only when the route's
   * schema declares a `headers` key; otherwise stripped by Zod.
   */
  headers?: Record<string, unknown>;
  actor?: unknown;
  requestId?: string;
}

/**
 * One HTTP route, framework-neutral.
 *
 * The handler is declared with method-shorthand syntax so that a list of
 * RouteDefs whose handlers are typed with narrower contexts stays assignable
 * to `RouteDef[]` (method parameters are checked bivariantly in TypeScript).
 */
export interface RouteDef<Ctx extends RouteContext = RouteContext, Deps = unknown> {
  method: HttpMethod;
  path: string;
  /** Validates and types the assembled `{ params, query, body }` input. */
  schema: ZodType<Ctx>;
  /** Success status used when the handler does not return a RouteSuccess. */
  successStatus?: number;
  handler(ctx: Ctx, deps: Deps): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Explicit response status
// ---------------------------------------------------------------------------

const ROUTE_RESPONSE = Symbol('trapmap.route-response');

/**
 * A handler result carrying an explicit HTTP status and body. Handlers return
 * a plain value for the default status, or `routeResponse(status, body)` when
 * the status is dynamic (e.g. the validate-session 401 result).
 */
export interface RouteSuccess {
  readonly [ROUTE_RESPONSE]: typeof ROUTE_RESPONSE;
  status: number;
  body: unknown;
}

export function routeResponse(status: number, body: unknown): RouteSuccess {
  return { [ROUTE_RESPONSE]: ROUTE_RESPONSE, status, body };
}

export function isRouteResponse(value: unknown): value is RouteSuccess {
  return typeof value === 'object' && value !== null && ROUTE_RESPONSE in value;
}

// ---------------------------------------------------------------------------
// Canonical error envelope
// ---------------------------------------------------------------------------

/**
 * Canonical error envelope shared by all hosts. `requestId`/`traceId` are
 * populated by hosts that have request-context plumbing (e.g. the Nest host's
 * global exception filter); `details` carries structured extras such as Zod
 * validation issues.
 */
export interface ErrorEnvelope {
  code: string;
  message: string;
  kind: string;
  requestId?: string;
  traceId?: string;
  error?: string;
  details?: Record<string, unknown>;
}

export interface MappedError {
  status: number;
  envelope: ErrorEnvelope;
}

const KIND_TO_CODE: Record<string, string> = {
  validation: 'validation_error',
  unauthorized: 'unauthorized',
  'not-found': 'not_found',
  conflict: 'conflict',
  forbidden: 'forbidden',
  timeout: 'timeout',
  unavailable: 'unavailable',
  internal: 'internal_error',
};

/**
 * Maps any thrown error to the canonical envelope plus HTTP status.
 *
 * - InvocationError: status/code/kind from the shared invocation taxonomy.
 * - ZodError: 400 validation_error with structured issues in `details`.
 * - Anything else: 500 internal_error.
 */
export function mapErrorToEnvelope(error: unknown): MappedError {
  if (error instanceof ZodError) {
    return {
      status: 400,
      envelope: {
        code: 'validation_error',
        message: 'Request validation failed',
        kind: 'validation',
        error: 'Request validation failed',
        details: {
          issues: error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      },
    };
  }

  const response = toInvocationErrorResponse(error);
  return {
    status: response.status,
    envelope: {
      code: KIND_TO_CODE[response.body.kind] ?? 'internal_error',
      message: response.body.error,
      kind: response.body.kind,
      error: response.body.error,
    },
  };
}
