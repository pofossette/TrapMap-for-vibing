import { Injectable, Logger, OnModuleInit, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * OpenTelemetry bootstrap service.
 *
 * Starts the OTel SDK (traces + metrics) on module init and shuts it
 * down on application shutdown. The SDK is profile-aware:
 * - local-agent: console exporter (or noop if OTEL_DISABLED=true)
 * - team-monolith / distributed: OTLP exporter to Tempo/Prometheus
 */
@Injectable()
export class OtelService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(OtelService.name);
  private sdk: any = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    const disabled = this.config.get<string>('OTEL_DISABLED', 'false');
    if (disabled === 'true') {
      this.logger.log('OpenTelemetry disabled by configuration');
      return;
    }

    const profile = this.config.get<string>('TRAPMAP_DEPLOYMENT_PROFILE', 'local-agent');
    const endpoint = this.config.get<string>(
      'OTEL_EXPORTER_OTLP_ENDPOINT',
      'http://localhost:4318',
    );
    const serviceName = this.config.get<string>('SERVICE_NAME', 'trapmap');
    const serviceVersion = this.config.get<string>('npm_package_version', '0.1.0');

    try {
      // Dynamic imports to avoid loading OTel when disabled
      const { NodeSDK } = await import('@opentelemetry/sdk-node');
      const { Resource } = await import('@opentelemetry/resources');
      const {
        ATTR_SERVICE_NAME,
        ATTR_SERVICE_VERSION,
      } = await import('@opentelemetry/semantic-conventions');

      const resource = new Resource({
        [ATTR_SERVICE_NAME]: serviceName,
        [ATTR_SERVICE_VERSION]: serviceVersion,
      });

      const sdkConfig: any = { resource };

      if (profile !== 'local-agent') {
        const { OTLPTraceExporter } = await import(
          '@opentelemetry/exporter-trace-otlp-http'
        );
        const { OTLPMetricExporter } = await import(
          '@opentelemetry/exporter-metrics-otlp-http'
        );
        const { PeriodicExportingMetricReader } = await import(
          '@opentelemetry/sdk-metrics'
        );

        sdkConfig.traceExporter = new OTLPTraceExporter({
          url: `${endpoint}/v1/traces`,
        });

        const metricExporter = new OTLPMetricExporter({
          url: `${endpoint}/v1/metrics`,
        });

        sdkConfig.metricReader = new PeriodicExportingMetricReader({
          exporter: metricExporter,
          exportIntervalMillis: 15_000,
        });
      }

      this.sdk = new NodeSDK(sdkConfig);
      this.sdk.start();
      this.logger.log(`OpenTelemetry SDK started (profile: ${profile}, endpoint: ${endpoint})`);
    } catch (err) {
      this.logger.error(`Failed to start OpenTelemetry SDK: ${err}`);
    }
  }

  async onApplicationShutdown() {
    if (this.sdk) {
      try {
        await this.sdk.shutdown();
        this.logger.log('OpenTelemetry SDK shut down');
      } catch (err) {
        this.logger.warn(`OpenTelemetry SDK shutdown error: ${err}`);
      }
    }
  }
}
