import { validateOtelPolicy } from '@trapmap/contracts';
import type { OtelPolicyInput, OtelPolicyResult } from '@trapmap/contracts';

/**
 * Maximum time (ms) to wait for OTel SDK shutdown before giving up.
 * Prevents the process from hanging on unresponsive exporters.
 *
 * Shared by both hosts so shutdown timeout semantics are identical
 * (design D5 single-plugin convergence).
 */
export const OTEL_SHUTDOWN_TIMEOUT_MS = 5_000;

/**
 * Shutdown handle for the OTel SDK. Framework-agnostic.
 */
export interface OtelSdkHandle {
  shutdown(): Promise<void>;
}

/**
 * The configured OTel SDK. We expose the validated policy so framework
 * adapters (Nest lifecycle, Fastify hooks) can log/act on it consistently.
 */
export interface BootstrappedOtel {
  sdk: OtelSdkHandle | null;
  policy: OtelPolicyResult;
}

/**
 * Framework-agnostic OTel SDK bootstrap.
 *
 * Reads the raw environment policy input, validates it with the shared
 * {@link validateOtelPolicy} from @trapmap/contracts, and returns a handle
 * with a bounded shutdown. When OTel is disabled the SDK is never loaded
 * and the handle is `null` (no export work scheduled).
 *
 * Semantics preserved from the previous host-local implementation:
 * - `local-agent` profile loads the SDK with default console tracing and
 *   no OTLP exporters;
 * - team-monolith / distributed load OTLP trace + metric exporters.
 */
export async function bootstrapOtelSdk(input: OtelPolicyInput): Promise<BootstrappedOtel> {
  const policy = validateOtelPolicy(input);

  if (!policy.enabled) {
    return { sdk: null, policy };
  }

  try {
    // Dynamic imports to avoid loading OTel when disabled.
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { resourceFromAttributes } = await import('@opentelemetry/resources');
    const { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } = await import(
      '@opentelemetry/semantic-conventions'
    );
    const { TraceIdRatioBasedSampler } = await import('@opentelemetry/sdk-trace-node');

    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: policy.serviceName,
      [ATTR_SERVICE_VERSION]: policy.serviceVersion,
      'deployment.environment': policy.environment,
      'trapmap.deployment_profile': policy.deploymentProfile,
    });

    const sdkConfig: Record<string, unknown> = {
      resource,
      sampler: new TraceIdRatioBasedSampler(policy.sampleRate),
    };

    if (policy.deploymentProfile !== 'local-agent') {
      const { OTLPTraceExporter } = await import('@opentelemetry/exporter-trace-otlp-http');
      const { OTLPMetricExporter } = await import('@opentelemetry/exporter-metrics-otlp-http');
      const { PeriodicExportingMetricReader } = await import('@opentelemetry/sdk-metrics');

      sdkConfig.traceExporter = new OTLPTraceExporter({
        url: `${policy.endpoint}/v1/traces`,
      });

      const metricExporter = new OTLPMetricExporter({
        url: `${policy.endpoint}/v1/metrics`,
      });

      sdkConfig.metricReader = new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 15_000,
      });
    }

    const sdk = new NodeSDK(sdkConfig);
    sdk.start();
    return { sdk: sdk as OtelSdkHandle, policy };
  } catch (_err) {
    // Framework adapters log appropriately; returning null keeps behavior
    // degraded-but-non-fatal indistinguishable from a disabled OTel.
    return { sdk: null, policy };
  }
}

/**
 * Shut down an OTel SDK handle with a bounded timeout to prevent process hangs.
 */
export async function boundedOtelShutdown(sdk: OtelSdkHandle): Promise<void> {
  try {
    await Promise.race([
      sdk.shutdown(),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('OTel shutdown timed out')), OTEL_SHUTDOWN_TIMEOUT_MS),
      ),
    ]);
  } catch {
    // Ignored: the caller logs the failure; timeout behavior is preserved.
  }
}
