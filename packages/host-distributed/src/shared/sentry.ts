/**
 * Optional Sentry error-intelligence adapter for host-distributed.
 *
 * This module is a zero-dependency adapter that:
 * - Only initializes @sentry/node when a DSN is provided
 * - Strips sensitive data (headers, cookies, request data, secrets) in beforeSend
 * - Attaches only safe tags: service, environment, release, deployment profile,
 *   owner surface, failure classification, request ID, trace ID, operation ID
 * - Captures only actionable errors (not 4xx/auth/validation)
 * - Cannot affect the original request or job completion path
 *
 * The Sentry SDK is dynamically imported so the module has no hard dependency
 * on @sentry/node at the package level.
 */

import { validateSentryPolicy } from '@trapmap/contracts';
import type { SentryPolicyInput, SentryPolicyResult } from '@trapmap/contracts';
import {
  redactQueryString,
  redactSensitiveKeys,
  redactUrl,
  SENSITIVE_KEY_PATTERN,
} from '@trapmap/lib';

const SUPPRESSED_STATUS_CODES = new Set([400, 401, 403, 404, 409, 422]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SentryCaptureContext {
  statusCode?: number;
  failureClassification?: string;
  ownerSurface?: string;
  requestId?: string;
  traceId?: string;
  operationId?: string;
  extras?: Record<string, unknown>;
}

interface SentryEvent {
  exception?: {
    values?: Array<{
      type?: string;
      value?: string;
    }>;
  };
  request?: {
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
    data?: unknown;
    query_string?: string;
    url?: string;
  };
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
  breadcrumbs?: Array<{
    data?: Record<string, unknown>;
  }>;
}

function redactEvent(event: SentryEvent): SentryEvent {
  if (event.request) {
    const redactedHeaders = event.request.headers
      ? (redactSensitiveKeys(event.request.headers) as Record<string, string>)
      : undefined;
    const redactedQuery = event.request.query_string
      ? redactQueryString(event.request.query_string)
      : undefined;
    const redactedUrl = event.request.url ? redactUrl(event.request.url) : undefined;

    // Build request without undefined optional properties (exactOptionalPropertyTypes).
    const redactedRequest: NonNullable<SentryEvent['request']> = {};
    if (redactedHeaders !== undefined) {
      redactedRequest.headers = redactedHeaders;
    }
    if (redactedQuery !== undefined) {
      redactedRequest.query_string = redactedQuery;
    }
    if (redactedUrl !== undefined) {
      redactedRequest.url = redactedUrl;
    }
    event.request = redactedRequest;
  }

  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => {
      const redacted: { data?: Record<string, unknown> } = {};
      if (crumb.data) {
        redacted.data = redactSensitiveKeys(crumb.data);
      }
      return redacted;
    });
  }

  if (event.extra) {
    event.extra = redactSensitiveKeys(event.extra);
  }

  return event;
}

function shouldSuppress(error: unknown, context: SentryCaptureContext | undefined): boolean {
  if (context?.statusCode && SUPPRESSED_STATUS_CODES.has(context.statusCode)) {
    return true;
  }

  const suppressedClassifications = new Set(['user-error', 'auth-policy-error']);
  if (
    context?.failureClassification &&
    suppressedClassifications.has(context.failureClassification)
  ) {
    return true;
  }

  if (error && typeof error === 'object' && 'kind' in error) {
    const kind = (error as { kind: string }).kind;
    if (['validation', 'unauthorized', 'forbidden', 'not-found'].includes(kind)) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Distributed Sentry adapter
// ---------------------------------------------------------------------------

let sentryInstance: typeof import('@sentry/node') | null = null;
let currentPolicy: SentryPolicyResult | null = null;

/**
 * Initialize the Sentry adapter for a distributed service.
 *
 * Call this once during service startup. If DSN is not configured,
 * this is a no-op.
 */
export async function initDistributedSentry(serviceName: string): Promise<SentryPolicyResult> {
  const policy = validateSentryPolicy(
    Object.fromEntries(
      Object.entries({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
        release: process.env.SENTRY_RELEASE ?? process.env.npm_package_version,
        tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE,
        sampleRate: process.env.SENTRY_SAMPLE_RATE,
        maxBreadcrumbs: process.env.SENTRY_MAX_BREADCRUMBS,
        deploymentProfile: process.env.TRAPMAP_DEPLOYMENT_PROFILE,
        serviceName,
      }).filter(([, v]) => v !== undefined),
    ) as SentryPolicyInput,
  );

  currentPolicy = policy;

  if (!policy.enabled) {
    console.log(`[sentry] Disabled for ${serviceName}: ${policy.reason}`);
    return policy;
  }

  try {
    const Sentry = await import('@sentry/node');

    Sentry.init({
      dsn: policy.dsn,
      environment: policy.environment,
      release: policy.release,
      sendDefaultPii: false,
      sampleRate: policy.sampleRate,
      tracesSampleRate: policy.tracesSampleRate,
      maxBreadcrumbs: policy.maxBreadcrumbs,
      beforeSend: (event) => redactEvent(event as unknown as SentryEvent) as never,
      integrations: (integrations) =>
        integrations.filter(
          (integration) => integration.name !== 'Http' && integration.name !== 'Undici',
        ),
    });

    sentryInstance = Sentry;
    console.log(
      `[sentry] Initialized for ${serviceName}: ` +
        `environment=${policy.environment}, release=${policy.release}, ` +
        `deploymentProfile=${policy.deploymentProfile}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[sentry] Failed to initialize for ${serviceName}: ${message}`);
  }

  return policy;
}

/**
 * Shut down the Sentry adapter. Call during graceful shutdown.
 */
export async function closeDistributedSentry(): Promise<void> {
  if (sentryInstance) {
    try {
      await sentryInstance.close(2_000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[sentry] Shutdown error: ${message}`);
    }
  }
  sentryInstance = null;
  currentPolicy = null;
}

/**
 * Capture an error if it is actionable.
 *
 * Returns true if the event was sent, false if suppressed or disabled.
 */
export function captureDistributedException(
  error: unknown,
  context?: SentryCaptureContext,
): boolean {
  if (!sentryInstance) {
    return false;
  }

  if (shouldSuppress(error, context)) {
    return false;
  }

  try {
    sentryInstance.withScope((scope) => {
      if (currentPolicy) {
        scope.setTag('service', currentPolicy.serviceName);
        scope.setTag('environment', currentPolicy.environment);
        scope.setTag('deployment_profile', currentPolicy.deploymentProfile);
      }

      if (context?.failureClassification) {
        scope.setTag('failure_classification', context.failureClassification);
      }
      if (context?.ownerSurface) {
        scope.setTag('owner_surface', context.ownerSurface);
      }
      if (context?.requestId) {
        scope.setTag('request_id', context.requestId);
        scope.setExtra('request_id', context.requestId);
      }
      if (context?.traceId) {
        scope.setTag('trace_id', context.traceId);
        scope.setExtra('trace_id', context.traceId);
      }
      if (context?.operationId) {
        scope.setTag('operation_id', context.operationId);
        scope.setExtra('operation_id', context.operationId);
      }

      if (context?.extras) {
        for (const [key, value] of Object.entries(context.extras)) {
          if (!SENSITIVE_KEY_PATTERN.test(key)) {
            scope.setExtra(key, value);
          }
        }
      }

      sentryInstance!.captureException(error);
    });

    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[sentry] Capture failed: ${message}`);
    return false;
  }
}

/**
 * Get the current Sentry policy (for diagnostics).
 */
export function getDistributedSentryPolicy(): SentryPolicyResult | null {
  return currentPolicy;
}

// ---------------------------------------------------------------------------
// Internal exports for testing
// ---------------------------------------------------------------------------

/** @internal Exported for unit tests only. */
export { redactSensitiveKeys, redactQueryString, redactUrl, redactEvent, shouldSuppress };
