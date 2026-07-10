import type { Span } from '@opentelemetry/api';
import {
  SpanKind,
  SpanStatusCode,
  context as otelContext,
  propagation,
  trace,
} from '@opentelemetry/api';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { ServerConfig } from '../../config.js';
import { recordHttpRequestMetric } from './metrics.js';
import { getOrCreateRequestContext } from './request-context.js';
import type { RuntimeMode } from './runtime-contract.js';

const requestSpanSymbol = Symbol('trapmap.request.span');

type RequestWithSpan = FastifyRequest & { [requestSpanSymbol]?: Span };

export interface HttpRequestHooksArgs {
  app: FastifyInstance;
  config: ServerConfig;
  runtimeServiceName: string;
  runtimeMode: RuntimeMode;
}

function classifyRouteFamily(route: string): 'runtime' | 'operator' | 'gateway' {
  if (route.startsWith('/health') || route.startsWith('/ready') || route === '/metrics') {
    return 'runtime';
  }
  if (route.startsWith('/v1/operations')) return 'operator';
  if (route.startsWith('/v1/')) return 'gateway';
  return 'runtime';
}

function resolveResponseTraceId(app: FastifyInstance, request: FastifyRequest): string | null {
  const context = request.requestContext;
  const activeTraceId = app.skillShareer.tracing?.getCurrentTraceId();
  return activeTraceId ?? context?.traceId ?? null;
}

function onRequestHook(config: ServerConfig, runtimeServiceName: string) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const context = getOrCreateRequestContext(request, config);
    if (context.traceParent) {
      const parentContext = propagation.extract(otelContext.active(), request.headers);
      const span = trace.getTracer('trapmap-http').startSpan(
        `${request.method} ${request.routeOptions.url || request.url}`,
        {
          kind: SpanKind.SERVER,
          attributes: {
            'http.request.method': request.method,
            'url.path': request.routeOptions.url || request.url,
            'trapmap.request_id': context.requestId,
            'trapmap.service_name': runtimeServiceName,
          },
        },
        parentContext,
      );
      (request as RequestWithSpan)[requestSpanSymbol] = span;
    }
    reply.header(config.runtime.requestIdHeader, context.requestId);
    if (context.traceParent) {
      reply.header(config.runtime.traceHeaderName, context.traceParent);
    }
    // Inject X-Trace-Id header when a trace ID is available — either from an
    // incoming traceparent header or from the OTel SDK later in the lifecycle.
    if (context.traceId) {
      reply.header('X-Trace-Id', context.traceId);
    }
  };
}

function onResponseHook(runtimeServiceName: string, app: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const context = request.requestContext;
    const route = context?.route ?? request.routeOptions.url ?? request.url;
    const routeFamily = classifyRouteFamily(route);
    const responseTime =
      typeof reply.elapsedTime === 'number' && Number.isFinite(reply.elapsedTime)
        ? reply.elapsedTime
        : 0;

    const responseTraceId = resolveResponseTraceId(app, request);
    if (responseTraceId) {
      reply.header('X-Trace-Id', responseTraceId);
    }

    recordHttpRequestMetric({
      routeFamily,
      serviceName: runtimeServiceName,
      latencyMs: responseTime,
      statusCode: reply.statusCode,
      method: request.method,
    });

    const requestSpan = (request as RequestWithSpan)[requestSpanSymbol];
    if (requestSpan) {
      requestSpan.setAttribute('http.response.status_code', reply.statusCode);
      requestSpan.setAttribute('http.route', route);
      if (reply.statusCode >= 500) {
        requestSpan.setStatus({ code: SpanStatusCode.ERROR });
      }
      requestSpan.end();
    }

    app.log.info(
      {
        eventCategory: 'request',
        eventName: 'request.completed',
        requestId: context?.requestId ?? null,
        traceId: responseTraceId,
        service: runtimeServiceName,
        serviceName: runtimeServiceName,
        ownerSurface: 'runtime-seam',
        routeFamily,
        method: request.method,
        route,
        statusCode: reply.statusCode,
        latencyMs: responseTime,
      },
      'Request completed',
    );
  };
}

export function registerHttpRequestHooks(args: HttpRequestHooksArgs): void {
  const { app, config, runtimeServiceName } = args;
  app.addHook('onRequest', onRequestHook(config, runtimeServiceName));
  app.addHook('onResponse', onResponseHook(runtimeServiceName, app));
}
