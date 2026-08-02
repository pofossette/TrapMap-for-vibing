import type { NestMiddleware } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { FastifyRequest, FastifyReply } from 'fastify';
import {
  SpanKind,
  SpanStatusCode,
  context as otelContext,
  propagation,
  trace,
} from '@opentelemetry/api';
import { normalizeObservabilityRouteFamily } from '@trapmap/contracts';

import { PrometheusService } from './prometheus.service.js';

/**
 * NestJS middleware that instruments every inbound HTTP request with:
 *
 * - **Prometheus RED metrics**: request count, duration histogram, active
 *   connections gauge.  All labels use the finite route-family normalizer
 *   from `@trapmap/contracts` and the *actual* response status class.
 *
 * - **OpenTelemetry server span**: started from the incoming traceparent
 *   (or as a root span), bound to async context so child application
 *   spans automatically inherit the server span as their parent.
 *
 * When `TRAPMAP_METRICS_ENABLED` is `false`, Prometheus mutation calls
 * are no-ops (the service guards on `enabled`); spans are still created
 * and ended regardless of the metrics flag.
 */
@Injectable()
export class HttpMetricsMiddleware implements NestMiddleware {
  constructor(
    private readonly prometheus: PrometheusService,
  ) {}

  use(req: FastifyRequest, res: FastifyReply, next: () => void): void {
    const startTime = Date.now();
    const method = (req.method || 'GET').toUpperCase();
    const route = req.routeOptions?.url || req.url || '/';

    // Track active connections
    this.prometheus.incrementConnections();

    // Extract parent context from incoming traceparent header
    const parentContext = propagation.extract(
      otelContext.active(),
      req.headers as Record<string, string>,
    );

    // Create server span
    const tracer = trace.getTracer('trapmap-host-local-http');
    const span = tracer.startSpan(
      `${method} ${route}`,
      {
        kind: SpanKind.SERVER,
        attributes: {
          'http.request.method': method,
          'url.path': route,
          'trapmap.route_family': normalizeObservabilityRouteFamily(route),
        },
      },
      parentContext,
    );

    // Bind the span to async context so child spans inherit the server span
    const activeContext = trace.setSpan(parentContext, span);

    otelContext.with(activeContext, () => {
      // Listen for response finalization to record metrics with actual status code
      const responseTarget = (res.raw ?? res) as {
        on?: (event: string, cb: () => void) => void;
      };

      responseTarget.on?.('finish', () => {
        const durationSeconds = (Date.now() - startTime) / 1000;
        const statusCode = String(
          (res as FastifyReply & { raw?: { statusCode?: number } }).statusCode ??
            (res as FastifyReply & { raw?: { statusCode?: number } }).raw?.statusCode ??
            0,
        );
        const statusCodeNum = parseInt(statusCode, 10);

        // Record Prometheus metrics with actual status code
        this.prometheus.incrementRequests(method, route, statusCode);
        this.prometheus.observeDuration(method, route, statusCode, durationSeconds);
        this.prometheus.decrementConnections();

        // Finalize the server span
        span.setAttribute('http.response.status_code', statusCodeNum);
        span.setAttribute(
          'http.route',
          normalizeObservabilityRouteFamily(route),
        );

        if (statusCodeNum >= 500) {
          span.setStatus({ code: SpanStatusCode.ERROR });
        }
        span.end();
      });

      next();
    });
  }
}
