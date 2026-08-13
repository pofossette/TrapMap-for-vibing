import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { validateOtelPolicy } from '@trapmap/contracts';
import type { OtelPolicyResult } from '@trapmap/contracts';

/**
 * Maximum time (ms) to wait for OTel SDK shutdown before giving up.
 * Prevents the process from hanging on unresponsive exporters.
 */
const SHUTDOWN_TIMEOUT_MS = 5_000;

/**
 * OpenTelemetry bootstrap service.
 *
 * Uses the shared {@link validateOtelPolicy} from @trapmap/contracts to
 * produce identical validated configuration semantics as host-distributed.
 *
 * - disabled mode: no SDK loaded, no export work scheduled
 * - local-agent profile: SDK starts with default console exporter; no OTLP
 * - team-monolith / distributed: OTLP exporter to Tempo/Prometheus
 */
@Injectable()
export class OtelService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(OtelService.name);
  private sdk: { start(): void; shutdown(): Promise<void> } | null = null;
  private policy: OtelPolicyResult | null = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.policy = validateOtelPolicy(
      Object.fromEntries(
        Object.entries({
          otelDisabled: this.config.get<string>('OTEL_DISABLED'),
          sampleRate: this.config.get<string>('OTEL_SAMPLE_RATE'),
          endpoint: this.config.get<string>('OTEL_EXPORTER_OTLP_ENDPOINT'),
          serviceName: this.config.get<string>('SERVICE_NAME'),
          serviceVersion: this.config.get<string>('npm_package_version'),
          deploymentProfile: this.config.get<string>('TRAPMAP_DEPLOYMENT_PROFILE'),
          environment: this.config.get<string>('NODE_ENV'),
        }).filter(([, v]) => v !== undefined),
      ),
    );

    if (!this.policy.enabled) {
      this.logger.log(`OpenTelemetry disabled: ${this.policy.reason}`);
      return;
    }

    try {
      // Dynamic imports to avoid loading OTel when disabled
      const { NodeSDK } = await import('@opentelemetry/sdk-node');
      const { resourceFromAttributes } = await import('@opentelemetry/resources');
      const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import(
        '@opentelemetry/semantic-conventions'
      );
      const { TraceIdRatioBasedSampler } = await import('@opentelemetry/sdk-trace-node');

      const resource = resourceFromAttributes({
        [ATTR_SERVICE_NAME]: this.policy.serviceName,
        [ATTR_SERVICE_VERSION]: this.policy.serviceVersion,
        'deployment.environment': this.policy.environment,
        'trapmap.deployment_profile': this.policy.deploymentProfile,
      });

      const sdkConfig: Record<string, unknown> = {
        resource,
        sampler: new TraceIdRatioBasedSampler(this.policy.sampleRate),
      };

      if (this.policy.deploymentProfile !== 'local-agent') {
        const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
        const { OTLPMetricExporter } = await import('@opentelemetry/exporter-metrics-otlp-http');
        const { PeriodicExportingMetricReader } = await import('@opentelemetry/sdk-metrics');

        sdkConfig.traceExporter = new OTLPTraceExporter({
          url: `${this.policy.endpoint}/v1/traces`,
        });

        const metricExporter = new OTLPMetricExporter({
          url: `${this.policy.endpoint}/v1/metrics`,
        });

        sdkConfig.metricReader = new PeriodicExportingMetricReader({
          exporter: metricExporter,
          exportIntervalMillis: 15_000,
        });
      }

      this.sdk = new NodeSDK(sdkConfig);
      this.sdk.start();
      this.logger.log(
        `OpenTelemetry SDK started (profile: ${this.policy.deploymentProfile}, endpoint: ${this.policy.endpoint}, sampleRate: ${this.policy.sampleRate})`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to start OpenTelemetry SDK: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async onApplicationShutdown() {
    if (!this.sdk) {
      return;
    }

    try {
      await Promise.race([
        this.sdk.shutdown(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('OTel shutdown timed out')), SHUTDOWN_TIMEOUT_MS),
        ),
      ]);
      this.logger.log('OpenTelemetry SDK shut down');
    } catch (err) {
      this.logger.warn(
        `OpenTelemetry SDK shutdown error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
