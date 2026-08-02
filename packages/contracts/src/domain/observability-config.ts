import { z } from 'zod';

export const featureFlagsSchema = z
  .object({
    metricsEnabled: z.boolean().default(true),
    tracingEnabled: z.boolean().default(true),
    loggingEnabled: z.boolean().default(true),
    serviceDiscoveryEnabled: z.boolean().default(false),
  })
  .strict();

export type FeatureFlags = z.infer<typeof featureFlagsSchema>;

export const observabilityConfigSchema = z
  .object({
    consulAddress: z.string().optional(),
    consulEnabled: z.boolean().default(false),
    otelEndpoint: z.string().optional(),
    otelDisabled: z.boolean().default(false),
    lokiUrl: z.string().optional(),
    lokiEnabled: z.boolean().default(false),
    prometheusEnabled: z.boolean().default(true),
    metricsPrefix: z.string().default('trapmap_'),
  })
  .strict();

export type ObservabilityConfig = z.infer<typeof observabilityConfigSchema>;

// ---------------------------------------------------------------------------
// Shared OTel Policy (Task 5)
// ---------------------------------------------------------------------------

/**
 * Raw input for OTel policy validation. Hosts read environment variables
 * and pass them here; the shared validator produces a typed, immutable result.
 */
export interface OtelPolicyInput {
  /** Raw OTEL_DISABLED value (string 'true' | 'false', default 'false'). */
  otelDisabled?: string;
  /** Raw OTEL_SAMPLE_RATE value (string, default '1'). */
  sampleRate?: string;
  /** OTEL_EXPORTER_OTLP_ENDPOINT value (may be absent). */
  endpoint?: string;
  /** Service name for resource attribute. */
  serviceName?: string;
  /** Service version for resource attribute (typically npm_package_version). */
  serviceVersion?: string;
  /** TRAPMAP_DEPLOYMENT_PROFILE value. */
  deploymentProfile?: string;
  /** NODE_ENV or equivalent. */
  environment?: string;
}

/**
 * Validated OTel policy result. Both hosts consume this identical shape
 * to configure the SDK, ensuring consistent disable/sample/resource/
 * exporter/shutdown semantics.
 */
export interface OtelPolicyResult {
  /** Whether OTel is enabled. When false, no SDK loading or export work. */
  readonly enabled: boolean;
  /** Validated sample rate in [0, 1]. Only meaningful when enabled=true. */
  readonly sampleRate: number;
  /** OTLP endpoint URL (always present; defaulted when absent). */
  readonly endpoint: string;
  /** Service.name resource attribute. */
  readonly serviceName: string;
  /** Service.version resource attribute. */
  readonly serviceVersion: string;
  /** Runtime environment (e.g. 'production', 'development'). */
  readonly environment: string;
  /** Deployment profile. */
  readonly deploymentProfile: string;
  /**
   * Safe human-readable diagnostic reason. Present when disabled or when
   * configuration was coerced from invalid input (e.g. clamped sample rate).
   * Never contains secrets or sensitive environment values.
   */
  readonly reason?: string;
}

const SAMPLE_RATE_MIN = 0;
const SAMPLE_RATE_MAX = 1;

// ---------------------------------------------------------------------------
// Sentry Policy (Task 9)
// ---------------------------------------------------------------------------

/**
 * Raw input for Sentry policy validation. Hosts read environment variables
 * and pass them here; the shared validator produces a typed, immutable result.
 */
export interface SentryPolicyInput {
  /** SENTRY_DSN value (may be absent). */
  dsn?: string;
  /** SENTRY_ENVIRONMENT value. */
  environment?: string;
  /** SENTRY_RELEASE value (typically npm_package_version or git SHA). */
  release?: string;
  /** SENTRY_TRACES_SAMPLE_RATE value (string, default '0'). */
  tracesSampleRate?: string;
  /** TRAPMAP_DEPLOYMENT_PROFILE value. */
  deploymentProfile?: string;
  /** Service name for Sentry tags. */
  serviceName?: string;
}

/**
 * Validated Sentry policy result. Both hosts consume this identical shape
 * to configure the Sentry SDK, ensuring consistent disable/tag/redaction
 * semantics.
 */
export interface SentryPolicyResult {
  /** Whether Sentry is enabled. When false, no SDK loading or transport work. */
  readonly enabled: boolean;
  /** Sentry DSN (always present when enabled; empty string when disabled). */
  readonly dsn: string;
  /** Runtime environment (e.g. 'production', 'development'). */
  readonly environment: string;
  /** Release identifier. */
  readonly release: string;
  /** Traces sample rate in [0, 1]. Only meaningful when enabled=true. */
  readonly tracesSampleRate: number;
  /** Deployment profile. */
  readonly deploymentProfile: string;
  /** Service name for Sentry tags. */
  readonly serviceName: string;
  /**
   * Safe human-readable diagnostic reason. Present when disabled or when
   * configuration was coerced from invalid input. Never contains secrets
   * or sensitive environment values.
   */
  readonly reason?: string;
}

/**
 * Parse a traces sample rate string. Returns [value, reason?] where reason is
 * present if the input was invalid and had to be clamped/coerced.
 */
function parseSentrySampleRate(raw: string | undefined): { value: number; reason?: string } {
  if (raw === undefined || raw.trim() === '') {
    return { value: 0 };
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) {
    return { value: 0, reason: `invalid sentry traces sample rate '${raw}', using default 0` };
  }
  if (parsed < SAMPLE_RATE_MIN) {
    return {
      value: SAMPLE_RATE_MIN,
      reason: `sentry traces sample rate ${parsed} below minimum, clamped to 0`,
    };
  }
  if (parsed > SAMPLE_RATE_MAX) {
    return {
      value: SAMPLE_RATE_MAX,
      reason: `sentry traces sample rate ${parsed} above maximum, clamped to 1`,
    };
  }
  return { value: parsed };
}

/**
 * Validate and produce a typed Sentry policy result from raw environment input.
 *
 * This is the single source of truth for Sentry configuration semantics.
 * Both host-local and host-distributed call this function with the same
 * input shape, guaranteeing identical behavior.
 *
 * When `dsn` is absent or empty, the result has `enabled: false` and no
 * Sentry SDK work should be performed.
 */
export function validateSentryPolicy(input: SentryPolicyInput = {}): SentryPolicyResult {
  const dsn = input.dsn?.trim() ?? '';
  const deploymentProfile = input.deploymentProfile?.trim() || 'local-agent';
  const environment = input.environment?.trim() || 'development';
  const serviceName = input.serviceName?.trim() || 'trapmap';
  const release = input.release?.trim() || '0.1.0';

  if (dsn.length === 0) {
    return {
      enabled: false,
      dsn: '',
      environment,
      release,
      tracesSampleRate: 0,
      deploymentProfile,
      serviceName,
      reason: 'SENTRY_DSN not configured',
    };
  }

  const { value: tracesSampleRate, reason: sampleReason } = parseSentrySampleRate(
    input.tracesSampleRate,
  );

  const result: SentryPolicyResult = {
    enabled: true,
    dsn,
    environment,
    release,
    tracesSampleRate,
    deploymentProfile,
    serviceName,
  };

  if (sampleReason) {
    // Assign only when present to satisfy exactOptionalPropertyTypes.
    return { ...result, reason: sampleReason };
  }

  return result;
}

/**
 * Parse a sample rate string. Returns [value, reason?] where reason is
 * present if the input was invalid and had to be clamped/coerced.
 */
function parseSampleRate(raw: string | undefined): { value: number; reason?: string } {
  if (raw === undefined || raw.trim() === '') {
    return { value: 1 };
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) {
    return { value: 1, reason: `invalid sample rate '${raw}', using default 1` };
  }
  if (parsed < SAMPLE_RATE_MIN) {
    return { value: SAMPLE_RATE_MIN, reason: `sample rate ${parsed} below minimum, clamped to 0` };
  }
  if (parsed > SAMPLE_RATE_MAX) {
    return { value: SAMPLE_RATE_MAX, reason: `sample rate ${parsed} above maximum, clamped to 1` };
  }
  return { value: parsed };
}

/**
 * Validate and produce a typed OTel policy result from raw environment input.
 *
 * This is the single source of truth for OTel configuration semantics.
 * Both host-local and host-distributed call this function with the same
 * input shape, guaranteeing identical behavior.
 */
export function validateOtelPolicy(input: OtelPolicyInput = {}): OtelPolicyResult {
  const disabled = input.otelDisabled?.trim().toLowerCase() === 'true';
  const deploymentProfile = input.deploymentProfile?.trim() || 'local-agent';
  const environment = input.environment?.trim() || 'development';
  const serviceName = input.serviceName?.trim() || 'trapmap';
  const serviceVersion = input.serviceVersion?.trim() || '0.1.0';
  const endpoint = input.endpoint?.trim() || 'http://localhost:4318';

  if (disabled) {
    return {
      enabled: false,
      sampleRate: 0,
      endpoint,
      serviceName,
      serviceVersion,
      environment,
      deploymentProfile,
      reason: 'OTEL_DISABLED=true',
    };
  }

  const { value: sampleRate, reason: sampleReason } = parseSampleRate(input.sampleRate);

  const result: OtelPolicyResult = {
    enabled: true,
    sampleRate,
    endpoint,
    serviceName,
    serviceVersion,
    environment,
    deploymentProfile,
  };

  if (sampleReason) {
    // Assign only when present to satisfy exactOptionalPropertyTypes.
    return { ...result, reason: sampleReason };
  }

  return result;
}
