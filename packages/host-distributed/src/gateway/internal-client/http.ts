import {
  resolveInternalTimeoutMs,
  serviceNameForInternalHost,
} from '@trapmap/host-distributed/config/index.js';
import { CircuitOpenError, resolveRetryPolicy, withResilience } from '../resilience.js';
import type { InternalRequestOptions, ServiceResponse } from './types.js';
import {
  INTERNAL_UNAVAILABLE_RESPONSE,
  TransientInternalResponseError,
  breakerForOrigin,
  callInternalServiceOnce,
  isTransientStatus,
} from './types.js';

export function withEnvTimeout(
  hostname: string,
  options: InternalRequestOptions | undefined,
): InternalRequestOptions {
  if (options?.timeoutMs !== undefined) return options;
  const serviceName = serviceNameForInternalHost(hostname);
  if (serviceName === undefined) return options ?? {};
  const envTimeoutMs = resolveInternalTimeoutMs(process.env, serviceName);
  if (envTimeoutMs === undefined) return options ?? {};
  return { ...options, timeoutMs: envTimeoutMs };
}

export async function callInternalService(
  url: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: unknown,
  query?: Record<string, string>,
  options?: InternalRequestOptions,
): Promise<ServiceResponse> {
  const breaker = breakerForOrigin(new URL(url).origin);
  if (!breaker.canAttempt()) {
    return INTERNAL_UNAVAILABLE_RESPONSE;
  }

  const retry = resolveRetryPolicy(process.env);
  const effectiveOptions = withEnvTimeout(new URL(url).hostname, options);

  try {
    return await withResilience(
      {
        retry,
        breaker,
        retryable: (err) => err instanceof TransientInternalResponseError && method === 'GET',
      },
      async () => {
        const response = await callInternalServiceOnce(url, method, body, query, effectiveOptions);
        if (isTransientStatus(response.status)) {
          throw new TransientInternalResponseError(response);
        }
        return response;
      },
    );
  } catch (err) {
    if (err instanceof TransientInternalResponseError) return err.response;
    if (err instanceof CircuitOpenError) return INTERNAL_UNAVAILABLE_RESPONSE;
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Service clients
// ---------------------------------------------------------------------------
