/**
 * Optional Sentry error-intelligence adapter for host-local.
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

import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import type { SentryPolicyResult } from '@trapmap/contracts';
import { validateSentryPolicy } from '@trapmap/contracts';

import type { RequestContextService } from '../runtime/request-context.service.js';
import {
  redactQueryString,
  redactSensitiveKeys,
  redactUrl,
  SENSITIVE_KEY_PATTERN,
} from '@trapmap/lib';

/**
 * HTTP status codes that are "expected" client errors and should not be
 * captured as actionable Sentry events.
 */
const SUPPRESSED_STATUS_CODES = new Set([
  400, // Bad Request (validation)
  401, // Unauthorized
  403, // Forbidden
  404, // Not Found
  409, // Conflict
  422, // Unprocessable Entity
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SentryCaptureContext {
  /** HTTP status code (if applicable). */
  statusCode?: number;
  /** Error classification from the failure taxonomy. */
  failureClassification?: string;
  /** Owner surface that generated the error. */
  ownerSurface?: string;
  /** Request ID for correlation. */
  requestId?: string;
  /** Trace ID for correlation. */
  traceId?: string;
  /** Operation ID for correlation. */
  operationId?: string;
  /** Additional safe extras. */
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


/**
 * Redact sensitive data from a Sentry event before transport.
 */
function redactEvent(event: SentryEvent): SentryEvent {
  // Strip request headers, cookies, and body; redact query params
  if (event.request) {
    const redactedRequest: NonNullable<SentryEvent['request']> = {};
    if (event.request.headers) {
      redactedRequest.headers = redactSensitiveKeys(event.request.headers) as Record<string, string>;
    }
    if (event.request.query_string !== undefined) {
      redactedRequest.query_string = redactQueryString(event.request.query_string);
    }
    if (event.request.url !== undefined) {
      redactedRequest.url = redactUrl(event.request.url);
    }
    event.request = redactedRequest;
  }

  // Redact breadcrumb data
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => {
      const redacted: { data?: Record<string, unknown> } = {};
      if (crumb.data) {
        redacted.data = redactSensitiveKeys(crumb.data);
      }
      return redacted;
    });
  }

  // Redact extras
  if (event.extra) {
    event.extra = redactSensitiveKeys(event.extra);
  }

  return event;
}

/**
 * Determine whether an error should be suppressed (not sent to Sentry).
 *
 * Suppresses:
 * - Expected client errors (4xx status codes)
 * - InvocationError with validation/unauthorized/forbidden/not-found kinds
 * - Errors with explicit status codes in the suppressed set
 */
function shouldSuppress(
  error: unknown,
  context: SentryCaptureContext | undefined,
): boolean {
  // Check explicit status code
  if (context?.statusCode && SUPPRESSED_STATUS_CODES.has(context.statusCode)) {
    return true;
  }

  // Check failure classification
  const suppressedClassifications = new Set([
    'user-error',
    'auth-policy-error',
  ]);
  if (context?.failureClassification && suppressedClassifications.has(context.failureClassification)) {
    return true;
  }

  // Check InvocationError kind
  if (error && typeof error === 'object' && 'kind' in error) {
    const kind = (error as { kind: string }).kind;
    if (['validation', 'unauthorized', 'forbidden', 'not-found'].includes(kind)) {
      return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// SentryService
// ---------------------------------------------------------------------------

@Injectable()
export class SentryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SentryService.name);
  private sentry: typeof import('@sentry/node') | null = null;
  private readonly policy: SentryPolicyResult;

  constructor(
    private readonly requestContext?: RequestContextService,
  ) {
    this.policy = validateSentryPolicy(
      Object.fromEntries(
        Object.entries({
          dsn: process.env.SENTRY_DSN,
          environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
          release: process.env.SENTRY_RELEASE ?? process.env.npm_package_version,
          tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE,
          sampleRate: process.env.SENTRY_SAMPLE_RATE,
          maxBreadcrumbs: process.env.SENTRY_MAX_BREADCRUMBS,
          deploymentProfile: process.env.TRAPMAP_DEPLOYMENT_PROFILE,
          serviceName: process.env.TRAPMAP_SERVICE_NAME,
        }).filter(([, v]) => v !== undefined),
      ),
    );
  }

  async onModuleInit(): Promise<void> {
    if (!this.policy.enabled) {
      this.logger.log(`Sentry disabled: ${this.policy.reason}`);
      return;
    }

    try {
      const Sentry = await import('@sentry/node');

      Sentry.init({
        dsn: this.policy.dsn,
        environment: this.policy.environment,
        release: this.policy.release,
        sendDefaultPii: false,
        sampleRate: this.policy.sampleRate,
        tracesSampleRate: this.policy.tracesSampleRate,
        maxBreadcrumbs: this.policy.maxBreadcrumbs,
        beforeSend: (event) => redactEvent(event as unknown as SentryEvent) as never,
        integrations: (integrations) =>
          integrations.filter(
            (integration) =>
              integration.name !== 'Http' && integration.name !== 'Undici',
          ),
      });

      this.sentry = Sentry;
      this.logger.log(
        `Sentry initialized: environment=${this.policy.environment}, ` +
        `release=${this.policy.release}, ` +
        `deploymentProfile=${this.policy.deploymentProfile}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to initialize Sentry: ${message}`);
      // Transport failure must not affect the host
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.sentry) {
      return;
    }
    try {
      await this.sentry.close(2_000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Sentry shutdown error: ${message}`);
    }
  }

  /**
   * Capture an error if it is actionable (not a suppressed 4xx/auth/validation).
   *
   * Safe tags/extras attached:
   * - service, environment, release, deployment_profile
   * - owner_surface, failure_classification
   * - request_id, trace_id, operation_id
   *
   * Returns true if the event was sent, false if suppressed or disabled.
   */
  captureException(error: unknown, context?: SentryCaptureContext): boolean {
    if (!this.sentry) {
      return false;
    }

    if (shouldSuppress(error, context)) {
      return false;
    }

    try {
      // Extract request context if available
      const reqCtx = this.requestContext?.get();

      this.sentry.withScope((scope) => {
        // Safe tags (low cardinality)
        scope.setTag('service', this.policy.serviceName);
        scope.setTag('environment', this.policy.environment);
        scope.setTag('deployment_profile', this.policy.deploymentProfile);

        if (context?.failureClassification) {
          scope.setTag('failure_classification', context.failureClassification);
        }
        if (context?.ownerSurface) {
          scope.setTag('owner_surface', context.ownerSurface);
        }

        // Safe extras (correlation IDs only)
        const requestId = context?.requestId ?? reqCtx?.requestId;
        const traceId = context?.traceId ?? reqCtx?.traceId;
        const operationId = context?.operationId ?? reqCtx?.operationId;

        if (requestId) {
          scope.setTag('request_id', requestId);
          scope.setExtra('request_id', requestId);
        }
        if (traceId) {
          scope.setTag('trace_id', traceId);
          scope.setExtra('trace_id', traceId);
        }
        if (operationId) {
          scope.setTag('operation_id', operationId);
          scope.setExtra('operation_id', operationId);
        }

        if (context?.extras) {
          // Only attach safe extras (no secrets, no request bodies)
          for (const [key, value] of Object.entries(context.extras)) {
            if (!SENSITIVE_KEY_PATTERN.test(key)) {
              scope.setExtra(key, value);
            }
          }
        }

        this.sentry!.captureException(error);
      });

      return true;
    } catch (err) {
      // Capture/transport failure must not affect the original request
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Sentry capture failed: ${message}`);
      return false;
    }
  }

  /**
   * Get the current Sentry policy (for diagnostics).
   */
  getPolicy(): SentryPolicyResult {
    return this.policy;
  }
}
