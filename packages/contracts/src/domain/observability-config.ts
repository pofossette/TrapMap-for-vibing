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
  /** SENTRY_SAMPLE_RATE value for error event sampling (string, default '1'). */
  sampleRate?: string;
  /** SENTRY_MAX_BREADCRUMBS value (string, default '50'). */
  maxBreadcrumbs?: string;
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
  /** Error event sample rate in [0, 1]. Only meaningful when enabled=true. */
  readonly sampleRate: number;
  /** Maximum number of breadcrumbs to retain. */
  readonly maxBreadcrumbs: number;
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
 * Parse an error sample rate string. Defaults to 1 (send all errors).
 */
function parseSentryErrorSampleRate(raw: string | undefined): { value: number; reason?: string } {
  if (raw === undefined || raw.trim() === '') {
    return { value: 1 };
  }
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) {
    return { value: 1, reason: `invalid sentry sample rate '${raw}', using default 1` };
  }
  if (parsed < SAMPLE_RATE_MIN) {
    return {
      value: SAMPLE_RATE_MIN,
      reason: `sentry sample rate ${parsed} below minimum, clamped to 0`,
    };
  }
  if (parsed > SAMPLE_RATE_MAX) {
    return {
      value: SAMPLE_RATE_MAX,
      reason: `sentry sample rate ${parsed} above maximum, clamped to 1`,
    };
  }
  return { value: parsed };
}

/**
 * Parse a max breadcrumbs string. Defaults to 50.
 */
function parseMaxBreadcrumbs(raw: string | undefined): { value: number; reason?: string } {
  const DEFAULT_MAX_BREADCRUMBS = 50;
  if (raw === undefined || raw.trim() === '') {
    return { value: DEFAULT_MAX_BREADCRUMBS };
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return {
      value: DEFAULT_MAX_BREADCRUMBS,
      reason: `invalid sentry maxBreadcrumbs '${raw}', using default ${DEFAULT_MAX_BREADCRUMBS}`,
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
      sampleRate: 1,
      maxBreadcrumbs: 50,
      deploymentProfile,
      serviceName,
      reason: 'SENTRY_DSN not configured',
    };
  }

  const { value: tracesSampleRate, reason: tracesReason } = parseSentrySampleRate(
    input.tracesSampleRate,
  );
  const { value: sampleRate, reason: sampleReason } = parseSentryErrorSampleRate(input.sampleRate);
  const { value: maxBreadcrumbs, reason: breadcrumbReason } = parseMaxBreadcrumbs(
    input.maxBreadcrumbs,
  );

  const reasons = [tracesReason, sampleReason, breadcrumbReason].filter(
    (r): r is string => r !== undefined,
  );

  const result: SentryPolicyResult = {
    enabled: true,
    dsn,
    environment,
    release,
    tracesSampleRate,
    sampleRate,
    maxBreadcrumbs,
    deploymentProfile,
    serviceName,
  };

  if (reasons.length > 0) {
    // Assign only when present to satisfy exactOptionalPropertyTypes.
    return { ...result, reason: reasons.join('; ') };
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
// ---------------------------------------------------------------------------
// Langfuse Policy (Task 10)
// ---------------------------------------------------------------------------

/**
 * Raw input for Langfuse policy validation. Hosts read environment variables
 * and pass them here; the shared validator produces a typed, immutable result.
 */
export interface LangfusePolicyInput {
  /** LANGFUSE_ENABLED value (string 'true' | 'false', default 'true'). */
  langfuseEnabled?: string;
  /** LANGFUSE_BASE_URL value (may be absent). */
  baseUrl?: string;
  /** LANGFUSE_PUBLIC_KEY value (may be absent). */
  publicKey?: string;
  /** LANGFUSE_SECRET_KEY value (may be absent). */
  secretKey?: string;
  /** LANGFUSE_FLUSH_TIMEOUT_MS value (string, default '5000'). */
  flushTimeoutMs?: string;
  /** Service name for Langfuse metadata. */
  serviceName?: string;
  /** Service version for Langfuse metadata. */
  serviceVersion?: string;
  /** Runtime environment (e.g. 'production', 'development'). */
  environment?: string;
  /** Deployment profile. */
  deploymentProfile?: string;
  /** Release identifier. */
  release?: string;
  /** Privacy mode for Langfuse observations. */
  privacyMode?: string;
}

/**
 * Validated Langfuse policy result. Both hosts consume this identical shape
 * to configure the Langfuse SDK, ensuring consistent disable/observation/
 * flush/redaction semantics.
 */
export interface LangfusePolicyResult {
  /** Whether Langfuse observation is enabled. When false, no SDK work. */
  readonly enabled: boolean;
  /** Langfuse base URL (always present; empty string when disabled). */
  readonly baseUrl: string;
  /** Langfuse public key (always present; empty string when disabled). */
  readonly publicKey: string;
  /** Langfuse secret key (always present; empty string when disabled). */
  readonly secretKey: string;
  /** Bounded flush timeout in milliseconds. */
  readonly flushTimeoutMs: number;
  /** Service name for Langfuse metadata. */
  readonly serviceName: string;
  /** Service version for Langfuse metadata. */
  readonly serviceVersion: string;
  /** Runtime environment. */
  readonly environment: string;
  /** Deployment profile. */
  readonly deploymentProfile: string;
  /** Release identifier. */
  readonly release: string;
  /** Privacy mode: 'strict' strips all content, 'metadata-only' sends safe metadata only. */
  readonly privacyMode: 'strict' | 'metadata-only';
  /**
   * Safe human-readable diagnostic reason. Present when disabled or when
   * configuration was coerced from invalid input. Never contains secrets
   * or sensitive environment values.
   */
  readonly reason?: string;
}

const DEFAULT_LANGFUSE_FLUSH_TIMEOUT_MS = 5000;
const MIN_LANGFUSE_FLUSH_TIMEOUT_MS = 100;
const MAX_LANGFUSE_FLUSH_TIMEOUT_MS = 60_000;

/**
 * Parse a flush timeout string. Returns [value, reason?] where reason is
 * present if the input was invalid and had to be clamped/coerced.
 */
function parseLangfuseFlushTimeout(raw: string | undefined): { value: number; reason?: string } {
  if (raw === undefined || raw.trim() === '') {
    return { value: DEFAULT_LANGFUSE_FLUSH_TIMEOUT_MS };
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return {
      value: DEFAULT_LANGFUSE_FLUSH_TIMEOUT_MS,
      reason: `invalid langfuse flush timeout '${raw}', using default ${DEFAULT_LANGFUSE_FLUSH_TIMEOUT_MS}`,
    };
  }
  if (parsed < MIN_LANGFUSE_FLUSH_TIMEOUT_MS) {
    return {
      value: MIN_LANGFUSE_FLUSH_TIMEOUT_MS,
      reason: `langfuse flush timeout ${parsed} below minimum, clamped to ${MIN_LANGFUSE_FLUSH_TIMEOUT_MS}`,
    };
  }
  if (parsed > MAX_LANGFUSE_FLUSH_TIMEOUT_MS) {
    return {
      value: MAX_LANGFUSE_FLUSH_TIMEOUT_MS,
      reason: `langfuse flush timeout ${parsed} above maximum, clamped to ${MAX_LANGFUSE_FLUSH_TIMEOUT_MS}`,
    };
  }
  return { value: parsed };
}

/**
 * Validate and produce a typed Langfuse policy result from raw environment input.
 *
 * This is the single source of truth for Langfuse configuration semantics.
 * Both host-local and host-distributed call this function with the same
 * input shape, guaranteeing identical behavior.
 *
 * When `LANGFUSE_ENABLED=false` or any required credential is missing,
 * the result has `enabled: false` and no Langfuse SDK work should be performed.
 */
export function validateLangfusePolicy(input: LangfusePolicyInput = {}): LangfusePolicyResult {
  const disabled = input.langfuseEnabled?.trim().toLowerCase() === 'false';
  const deploymentProfile = input.deploymentProfile?.trim() || 'local-agent';
  const environment = input.environment?.trim() || 'development';
  const serviceName = input.serviceName?.trim() || 'trapmap';
  const serviceVersion = input.serviceVersion?.trim() || '0.1.0';
  const release = input.release?.trim() || '0.1.0';
  const privacyMode: 'strict' | 'metadata-only' =
    input.privacyMode?.trim().toLowerCase() === 'metadata-only' ? 'metadata-only' : 'strict';

  if (disabled) {
    return {
      enabled: false,
      baseUrl: '',
      publicKey: '',
      secretKey: '',
      flushTimeoutMs: DEFAULT_LANGFUSE_FLUSH_TIMEOUT_MS,
      serviceName,
      serviceVersion,
      environment,
      deploymentProfile,
      release,
      privacyMode,
      reason: 'LANGFUSE_ENABLED=false',
    };
  }

  const baseUrl = input.baseUrl?.trim() ?? '';
  const publicKey = input.publicKey?.trim() ?? '';
  const secretKey = input.secretKey?.trim() ?? '';

  const missingKeys = [
    !baseUrl ? 'LANGFUSE_BASE_URL' : null,
    !publicKey ? 'LANGFUSE_PUBLIC_KEY' : null,
    !secretKey ? 'LANGFUSE_SECRET_KEY' : null,
  ].filter((key): key is string => key !== null);

  if (missingKeys.length > 0) {
    return {
      enabled: false,
      baseUrl,
      publicKey,
      secretKey,
      flushTimeoutMs: DEFAULT_LANGFUSE_FLUSH_TIMEOUT_MS,
      serviceName,
      serviceVersion,
      environment,
      deploymentProfile,
      release,
      privacyMode,
      reason: `Langfuse not configured: missing ${missingKeys.join(', ')}`,
    };
  }

  const { value: flushTimeoutMs, reason: flushReason } = parseLangfuseFlushTimeout(
    input.flushTimeoutMs,
  );

  const result: LangfusePolicyResult = {
    enabled: true,
    baseUrl,
    publicKey,
    secretKey,
    flushTimeoutMs,
    serviceName,
    serviceVersion,
    environment,
    deploymentProfile,
    release,
    privacyMode,
  };

  if (flushReason) {
    return { ...result, reason: flushReason };
  }

  return result;
}

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
