import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  context as otelContext,
  type Span,
  SpanKind,
  SpanStatusCode,
  propagation,
  trace,
} from '@opentelemetry/api';

const requestSpanSymbol = Symbol('trapmap.distributed.request.span');

type RequestWithSpan = FastifyRequest & { [requestSpanSymbol]?: Span };

export async function attachRuntimeTelemetry(
  app: FastifyInstance,
  serviceName: string,
): Promise<void> {
  const sdk = await bootstrapOtel(serviceName);

  app.addHook('onRequest', async (request) => {
    const traceParentHeader = request.headers.traceparent;
    if (typeof traceParentHeader !== 'string' || traceParentHeader.trim().length === 0) {
      return;
    }

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
      await sdk.shutdown();
    }
  });
}

async function bootstrapOtel(serviceName: string): Promise<{ shutdown(): Promise<void> } | null> {
  if (process.env.OTEL_DISABLED === 'true') {
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

    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://localhost:4318';
    const sdk = new NodeSDK({
      resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: `trapmap-${serviceName}`,
        [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '0.1.0',
      }),
      sampler: new TraceIdRatioBasedSampler(Number.parseFloat(process.env.OTEL_SAMPLE_RATE ?? '1')),
      traceExporter: new OTLPTraceExporter({
        url: `${endpoint}/v1/traces`,
      }),
      metricReader: new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({
          url: `${endpoint}/v1/metrics`,
        }),
        exportIntervalMillis: 15_000,
      }),
    });

    sdk.start();
    return sdk;
  } catch {
    return null;
  }
}
