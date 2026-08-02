import {
  type Span,
  SpanKind,
  SpanStatusCode,
  context as otelContext,
  propagation,
  trace,
} from '@opentelemetry/api';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { validateOtelPolicy } from '@trapmap/contracts';
import type { OtelPolicyResult } from '@trapmap/contracts';

const requestSpanSymbol = Symbol('trapmap.distributed.request.span');

type RequestWithSpan = FastifyRequest & { [requestSpanSymbol]?: Span };

/**
 * Maximum time (ms) to wait for OTel SDK shutdown before giving up.
 * Prevents the process from hanging on unresponsive exporters.
 */
const SHUTDOWN_TIMEOUT_MS = 5_000;

/**
 * Attach runtime telemetry hooks to a Fastify instance.
 *
 * Uses the shared {@link validateOtelPolicy} from @trapmap/contracts to
 * produce identical validated configuration semantics as host-local.
 *
 * When OTel is disabled or fails to bootstrap, the request hooks still run
 * (they degrade to no-ops).
 */
export async function attachRuntimeTelemetry(
  app: FastifyInstance,
  serviceName: string,
): Promise<void> {
  const sdk = await bootstrapOtel(serviceName);

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

  app.addHook('onResponse', async (request, reply) => {
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
      await boundedShutdown(sdk);
    }
  });
}

async function bootstrapOtel(serviceName: string): Promise<{ shutdown(): Promise<void> } | null> {
  const policy = validateOtelPolicy({
    otelDisabled: process.env.OTEL_DISABLED,
    sampleRate: process.env.OTEL_SAMPLE_RATE,
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    serviceName,
    serviceVersion: process.env.npm_package_version,
    deploymentProfile: process.env.TRAPMAP_DEPLOYMENT_PROFILE,
    environment: process.env.NODE_ENV,
  });

  if (!policy.enabled) {
    return null;
  }

  try {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { resourceFromAttributes } = await import('@opentelemetry/resources');
    const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import(
      '@opentelemetry/semantic-conventions'
    );
    const { TraceIdRatioBasedSampler } = await import('@opentelemetry/sdk-trace-node');
    const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
    const { OTLPMetricExporter } = await import('@opentelemetry/exporter-metrics-otlp-http');
    const { PeriodicExportingMetricReader } = await import('@opentelemetry/sdk-metrics');

    const sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: policy.serviceName,
        [ATTR_SERVICE_VERSION]: policy.serviceVersion,
        'deployment.environment': policy.environment,
        'trapmap.deployment_profile': policy.deploymentProfile,
      }),
      sampler: new TraceIdRatioBasedSampler(policy.sampleRate),
      traceExporter: new OTLPTraceExporter({
        url: `${policy.endpoint}/v1/traces`,
      }),
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${policy.endpoint}/v1/metrics`,
        }),
        exportIntervalMillis: 15_000,
      }),
    });

    sdk.start();
    return sdk;
  } catch (err) {
    // Log safe diagnostic instead of silently swallowing
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[telemetry] Failed to start OTel SDK: ${message}`);
    return null;
  }
}

/**
 * Shut down an OTel SDK with a bounded timeout to prevent process hangs.
 */
async function boundedShutdown(sdk: { shutdown(): Promise<void> }): Promise<void> {
  try {
    await Promise.race([
      sdk.shutdown(),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('OTel shutdown timed out')), SHUTDOWN_TIMEOUT_MS),
      ),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[telemetry] OTel SDK shutdown error: ${message}`);
  }
}
