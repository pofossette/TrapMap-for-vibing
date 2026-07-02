/**
 * OTel SDK bootstrap for the Fastify server.
 *
 * Initialises the OpenTelemetry SDK with profile-aware exporters:
 * - local-agent: console exporter (for local development)
 * - team-monolith / distributed: OTLP exporter to Tempo/Prometheus
 *
 * SDK initialization failures are non-fatal (fail-open).
 * The SDK instance is returned so callers can shut it down gracefully.
 *
 * Phase 2B -- real OTel integration.
 */

export interface BootstrapOtelOptions {
  profile: string;
  otlpEndpoint?: string;
  serviceName?: string;
  serviceVersion?: string;
  sampleRate?: number;
}

export interface BootstrapOtelResult {
  sdk: any | null;
  success: boolean;
  error?: string;
}

/**
 * Bootstrap the OTel SDK.  Returns the SDK instance (or null on failure)
 * so the caller can shut it down during graceful shutdown.
 */
export async function bootstrapOtel(options: BootstrapOtelOptions): Promise<BootstrapOtelResult> {
  const {
    profile,
    otlpEndpoint = 'http://localhost:4318',
    serviceName = 'trapmap',
    serviceVersion = '0.1.0',
    sampleRate = 0.1,
  } = options;

  try {
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { resourceFromAttributes } = await import('@opentelemetry/resources');
    const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import(
      '@opentelemetry/semantic-conventions'
    );
    const { TraceIdRatioBasedSampler } = await import('@opentelemetry/sdk-trace-node');

    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
    });

    const sdkConfig: any = {
      resource,
      sampler: new TraceIdRatioBasedSampler(sampleRate),
    };

    if (profile !== 'local-agent') {
      const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
      const { OTLPMetricExporter } = await import('@opentelemetry/exporter-metrics-otlp-http');
      const { PeriodicExportingMetricReader } = await import('@opentelemetry/sdk-metrics');

      sdkConfig.traceExporter = new OTLPTraceExporter({
        url: `${otlpEndpoint}/v1/traces`,
      });

      const metricExporter = new OTLPMetricExporter({
        url: `${otlpEndpoint}/v1/metrics`,
      });

      sdkConfig.metricReader = new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 15_000,
      });
    }

    const sdk = new NodeSDK(sdkConfig);
    sdk.start();

    return { sdk, success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { sdk: null, success: false, error: message };
  }
}
