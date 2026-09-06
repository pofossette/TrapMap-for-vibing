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
  OTEL_SHUTDOWN_TIMEOUT_MS,
  type OtelSdkHandle,
} from '@trapmap/backend-core';
import type { OtelPolicyResult } from '@trapmap/contracts';

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
      await Promise.race([
        boundedOtelShutdown(this.sdk),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('OTel shutdown timed out')), OTEL_SHUTDOWN_TIMEOUT_MS),
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
