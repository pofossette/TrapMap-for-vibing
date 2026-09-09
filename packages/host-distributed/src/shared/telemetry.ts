import {
  context as otelContext,
  propagation,
  type Span,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import {
  bootstrapOtelSdk,
  boundedOtelShutdown,
  OTEL_METRIC_EXPORT_INTERVAL_MS,
  OTEL_SHUTDOWN_TIMEOUT_MS,
} from '@trapmap/backend-core';
import type { OtelPolicyInput } from '@trapmap/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';

const requestSpanSymbol = Symbol('trapmap.distributed.request.span');

type RequestWithSpan = FastifyRequest & { [requestSpanSymbol]?: Span };

/**
 * Attach runtime telemetry hooks to a Fastify instance.
 *
 * Uses the shared {@link bootstrapOtelSdk} from @trapmap/backend-core (design
 * D5 single-plugin convergence) to produce identical validated configuration
 * semantics as host-local. The Fastify request hooks (span creation, parent
 * trace-header propagation) remain host-specific attachment.
 *
 * When OTel is disabled or fails to bootstrap, the request hooks still run
 * (they degrade to no-ops).
 */
export async function attachRuntimeTelemetry(
  app: FastifyInstance,
  serviceName: string,
): Promise<void> {
  const bootstrapped = await bootstrapOtelSdk(buildOtelPolicyInput(serviceName), {
    metricExportIntervalMs: resolveOtelMetricExportIntervalMs(process.env),
  });
  const sdk = bootstrapped.sdk;

  app.addHook('onRequest', async (request) => {
    const parentContext = propagation.extract(otelContext.active(), request.headers);
    const span = trace.getTracer('trapmap-distributed-http').startSpan(
      `${request.method} ${request.routeOptions.url || request.url}`,
      {
        kind: SpanKind.SERVER,
        attributes: {
          'http.request.method': request.method,
          'url.path': request.routeOptions.url || request.url,
          'trapmap.service_name': serviceName,
          'trapmap.request_id': request.id,
        },
      },
      parentContext,
    );
    (request as RequestWithSpan)[requestSpanSymbol] = span;
  });

  app.addHook('onResponse', async (request: FastifyRequest, reply) => {
    const span = (request as RequestWithSpan)[requestSpanSymbol];
    if (!span) {
      return;
    }

    span.setAttribute('http.response.status_code', reply.statusCode);
    span.setAttribute('http.route', request.routeOptions.url || request.url);
    if (reply.statusCode >= 500) {
      span.setStatus({ code: SpanStatusCode.ERROR });
    }
    span.end();
  });

  app.addHook('onClose', async () => {
    if (sdk) {
      await boundedOtelShutdown(sdk, {
        shutdownTimeoutMs: resolveOtelShutdownTimeoutMs(process.env),
      });
    }
  });
}

/**
 * OTLP metric export interval (`OTEL_METRIC_EXPORT_INTERVAL_MILLIS`).
 * Parsing mirrors `config/service-config.ts`: unset/invalid env falls back
 * to the shared backend-core default so behavior is unchanged.
 */
function resolveOtelMetricExportIntervalMs(env: Record<string, string | undefined>): number {
  const parsed = Number.parseInt(env.OTEL_METRIC_EXPORT_INTERVAL_MILLIS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : OTEL_METRIC_EXPORT_INTERVAL_MS;
}

/**
 * OTel SDK shutdown bound (`OTEL_SHUTDOWN_TIMEOUT_MS`, no TRAPMAP_ prefix —
 * follows the existing `OTEL_*` naming). Same fallback rule as above.
 */
function resolveOtelShutdownTimeoutMs(env: Record<string, string | undefined>): number {
  const parsed = Number.parseInt(env.OTEL_SHUTDOWN_TIMEOUT_MS ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : OTEL_SHUTDOWN_TIMEOUT_MS;
}

function buildOtelPolicyInput(serviceName: string): OtelPolicyInput {
  const input: OtelPolicyInput = { serviceName };
  const otelDisabled = process.env.OTEL_DISABLED;
  const sampleRate = process.env.OTEL_SAMPLE_RATE;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const serviceVersion = process.env.npm_package_version;
  const deploymentProfile = process.env.TRAPMAP_DEPLOYMENT_PROFILE;
  const environment = process.env.NODE_ENV;

  if (otelDisabled !== undefined) input.otelDisabled = otelDisabled;
  if (sampleRate !== undefined) input.sampleRate = sampleRate;
  if (endpoint !== undefined) input.endpoint = endpoint;
  if (serviceVersion !== undefined) input.serviceVersion = serviceVersion;
  if (deploymentProfile !== undefined) input.deploymentProfile = deploymentProfile;
  if (environment !== undefined) input.environment = environment;

  return input;
}
