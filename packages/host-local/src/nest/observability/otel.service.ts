import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  bootstrapOtelSdk,
  boundedOtelShutdown,
  OTEL_METRIC_EXPORT_INTERVAL_MS,
  OTEL_SHUTDOWN_TIMEOUT_MS,
  type OtelSdkHandle,
} from '@trapmap/backend-core';
import type { OtelPolicyResult } from '@trapmap/contracts';

/**
 * Parse an optional positive-int ms env value, falling back to `defaultMs`
 * when unset or invalid so behavior is unchanged.
 */
function resolvePositiveIntMs(raw: string | undefined, defaultMs: number): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultMs;
}

/**
 * NestJS adapter for the shared OTel bootstrap (design D5 single-plugin
 * convergence). The framework-agnostic SDK bootstrap lives in
 * @trapmap/backend-core; this service only maps Nest config/env onto the
 * shared {@link bootstrapOtelSdk} policy input and lifecycle hooks.
 */
@Injectable()
export class OtelService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(OtelService.name);
  private sdk: OtelSdkHandle | null = null;
  private policy: OtelPolicyResult | null = null;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  async onModuleInit() {
    const bootstrapped = await bootstrapOtelSdk(
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
      { metricExportIntervalMs: this.resolveOtelMetricExportIntervalMs() },
    );
    this.sdk = bootstrapped.sdk;
    this.policy = bootstrapped.policy;

    if (!this.policy.enabled) {
      this.logger.log(`OpenTelemetry disabled: ${this.policy.reason}`);
      return;
    }

    if (!this.sdk) {
      this.logger.error('Failed to start OpenTelemetry SDK');
      return;
    }

    this.logger.log(
      `OpenTelemetry SDK started (profile: ${this.policy.deploymentProfile}, endpoint: ${this.policy.endpoint}, sampleRate: ${this.policy.sampleRate})`,
    );
  }

  async onApplicationShutdown() {
    if (!this.sdk) {
      return;
    }

    try {
      // Preserve the shared bounded shutdown timeout semantics.
      const shutdownTimeoutMs = this.resolveOtelShutdownTimeoutMs();
      await Promise.race([
        boundedOtelShutdown(this.sdk, { shutdownTimeoutMs }),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('OTel shutdown timed out')), shutdownTimeoutMs),
        ),
      ]);
      this.logger.log('OpenTelemetry SDK shut down');
    } catch (err) {
      this.logger.warn(
        `OpenTelemetry SDK shutdown error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Env resolution mirrors the pool pattern in `config/config.ts`:
   * `TRAPMAP_HOST_LOCAL_*` first, shared name as fallback; unset/invalid
   * falls back to the backend-core default so behavior is unchanged.
   */
  private resolveOtelMetricExportIntervalMs(): number {
    return resolvePositiveIntMs(
      this.config.get<string>('TRAPMAP_HOST_LOCAL_OTEL_METRIC_EXPORT_INTERVAL_MILLIS') ??
        this.config.get<string>('OTEL_METRIC_EXPORT_INTERVAL_MILLIS'),
      OTEL_METRIC_EXPORT_INTERVAL_MS,
    );
  }

  private resolveOtelShutdownTimeoutMs(): number {
    return resolvePositiveIntMs(
      this.config.get<string>('TRAPMAP_HOST_LOCAL_OTEL_SHUTDOWN_TIMEOUT_MS') ??
        this.config.get<string>('OTEL_SHUTDOWN_TIMEOUT_MS'),
      OTEL_SHUTDOWN_TIMEOUT_MS,
    );
  }
}
