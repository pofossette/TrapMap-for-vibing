import {
  BrokenCircuitError,
  type CircuitBreakerPolicy,
  ConsecutiveBreaker,
  DelegateBackoff,
  type IRetryBackoffContext,
  TaskCancelledError,
  TimeoutStrategy,
  circuitBreaker,
  handleWhen,
  retry,
  timeout,
  wrap,
} from 'cockatiel';

import {
  getRuntimeMetricsSnapshot,
  recordRuntimeExecution,
  recordRuntimeRetry,
} from './metrics.js';

export type ResilienceFailureKind = 'timeout' | 'retryable' | 'permanent';
export type ResilienceFailureMode = 'fail-closed' | 'fail-open';

export interface ResilienceCircuitBreakerPolicy {
  failureThreshold?: number;
  halfOpenAfterMs?: number;
}

export interface ResiliencePolicy {
  dependencyName: string;
  timeoutMs: number;
  maxAttempts: number;
  backoffMs: (attempt: number) => number;
  failureMode: ResilienceFailureMode;
  circuitBreaker?: ResilienceCircuitBreakerPolicy | false;
}

export interface ResilienceContext {
  requestId?: string | null;
  traceId?: string | null;
  route?: string;
  workItemId?: string;
  logger?: {
    warn: (payload: unknown, message: string) => void;
    error: (payload: unknown, message: string) => void;
  };
}

export interface ResilienceResult<T> {
  ok: boolean;
  value?: T;
  degraded: boolean;
  attempts: number;
  failureKind?: ResilienceFailureKind;
  failureClassification?:
    | 'dependency-error'
    | 'timeout'
    | 'retryable-async-failure'
    | 'permanent-failure';
  error?: unknown;
}

function mapFailureClassification(
  failureKind: ResilienceFailureKind,
): 'dependency-error' | 'timeout' | 'retryable-async-failure' | 'permanent-failure' {
  if (failureKind === 'timeout') {
    return 'timeout';
  }
  if (failureKind === 'retryable') {
    return 'retryable-async-failure';
  }
  return 'permanent-failure';
}

type ResilientOperation<T> = (signal?: AbortSignal) => Promise<T>;

export interface ExecuteWithResilienceOptions<T> {
  policy: ResiliencePolicy;
  context?: ResilienceContext;
  operation: ResilientOperation<T>;
  isRetryableError?: (error: unknown) => boolean;
  isSuccessfulResult?: (value: T) => boolean;
  fallbackValue?: T;
}

class UnsuccessfulResultError<T> extends Error {
  constructor(
    dependencyName: string,
    public readonly value: T,
  ) {
    super(`Operation returned unsuccessful result for ${dependencyName}`);
  }
}

const circuitBreakerCache = new Map<string, CircuitBreakerPolicy>();

function defaultIsRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /timeout|temporar|unavailable|network|reset|econn/i.test(error.message);
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof TaskCancelledError ||
    (error instanceof Error && /timeout|timed out/i.test(error.message))
  );
}

function isBrokenCircuit(error: unknown): error is BrokenCircuitError {
  return error instanceof BrokenCircuitError;
}

function classifyFailureKind(error: unknown, timedOut: boolean): ResilienceFailureKind {
  if (timedOut || isTimeoutError(error)) {
    return 'timeout';
  }

  return 'permanent';
}

function createRetryPolicy(
  policy: ResiliencePolicy,
  isRetryableError: (error: unknown) => boolean,
) {
  return retry(
    handleWhen((error) => error instanceof UnsuccessfulResultError || isRetryableError(error)),
    {
      maxAttempts: Math.max(0, policy.maxAttempts - 1),
      backoff: new DelegateBackoff<IRetryBackoffContext<unknown>>(({ attempt }) =>
        policy.backoffMs(attempt),
      ),
    },
  );
}

function getCircuitBreakerCacheKey(policy: ResiliencePolicy): string | null {
  const breakerPolicy = policy.circuitBreaker;
  if (!breakerPolicy) {
    return null;
  }

  return JSON.stringify({
    dependencyName: policy.dependencyName,
    failureThreshold: breakerPolicy.failureThreshold ?? 5,
    halfOpenAfterMs: breakerPolicy.halfOpenAfterMs ?? 30_000,
  });
}

function getCircuitBreakerPolicy(policy: ResiliencePolicy): CircuitBreakerPolicy | null {
  const cacheKey = getCircuitBreakerCacheKey(policy);
  if (!cacheKey) {
    return null;
  }
  const breakerPolicy = policy.circuitBreaker;
  if (!breakerPolicy) {
    return null;
  }

  const existing = circuitBreakerCache.get(cacheKey);
  if (existing) {
    return existing;
  }

  const next = circuitBreaker(
    handleWhen(() => true),
    {
      breaker: new ConsecutiveBreaker(breakerPolicy.failureThreshold ?? 5),
      halfOpenAfter: breakerPolicy.halfOpenAfterMs ?? 30_000,
    },
  );
  circuitBreakerCache.set(cacheKey, next);
  return next;
}

function logRetry(
  dependencyName: string,
  context: ResilienceContext | undefined,
  attempt: number,
  error: unknown,
) {
  recordRuntimeRetry(dependencyName);

  if (error instanceof UnsuccessfulResultError) {
    context?.logger?.warn?.(
      {
        eventCategory: 'async-job',
        eventName: 'resilience.retry',
        dependencyName,
        attempt,
        requestId: context.requestId ?? null,
        traceId: context.traceId ?? null,
        route: context.route,
        workItemId: context.workItemId,
        serviceName: 'gateway',
        ownerSurface: 'runtime-seam',
        failureKind: 'retryable',
        metrics: getRuntimeMetricsSnapshot().dependencies[dependencyName],
      },
      'Retrying resilient operation after unsuccessful result',
    );
    return;
  }

  context?.logger?.warn?.(
    {
      eventCategory: 'async-job',
      eventName: 'resilience.retry',
      dependencyName,
      attempt,
      requestId: context?.requestId ?? null,
      traceId: context?.traceId ?? null,
      route: context?.route,
      workItemId: context?.workItemId,
      serviceName: 'gateway',
      ownerSurface: 'runtime-seam',
      metrics: getRuntimeMetricsSnapshot().dependencies[dependencyName],
    },
    'Retrying resilient operation',
  );
}

export async function executeWithResilience<T>(
  options: ExecuteWithResilienceOptions<T>,
): Promise<ResilienceResult<T>> {
  const {
    policy,
    context,
    operation,
    fallbackValue,
    isRetryableError = defaultIsRetryableError,
    isSuccessfulResult = () => true,
  } = options;

  const startedAt = Date.now();
  let attempts = 0;
  let lastError: unknown;
  let timedOut = false;

  const retryPolicy = createRetryPolicy(policy, isRetryableError);
  const timeoutPolicy = timeout(policy.timeoutMs, {
    strategy: TimeoutStrategy.Aggressive,
    abortOnReturn: false,
  });
  const breakerPolicy = getCircuitBreakerPolicy(policy);
  const executionPolicy = breakerPolicy
    ? wrap(retryPolicy, breakerPolicy, timeoutPolicy)
    : wrap(retryPolicy, timeoutPolicy);

  const retryListener = retryPolicy.onRetry((event) => {
    const retryError = 'error' in event ? event.error : lastError;
    lastError = retryError;
    logRetry(policy.dependencyName, context, event.attempt, retryError);
  });
  const timeoutListener = timeoutPolicy.onTimeout(() => {
    timedOut = true;
  });

  try {
    const value = await executionPolicy.execute(async ({ signal }) => {
      attempts += 1;
      const result = await operation(signal);
      if (!isSuccessfulResult(result)) {
        throw new UnsuccessfulResultError(policy.dependencyName, result);
      }
      return result;
    });

    recordRuntimeExecution({
      dependencyName: policy.dependencyName,
      latencyMs: Date.now() - startedAt,
    });
    return {
      ok: true,
      value,
      degraded: false,
      attempts,
    };
  } catch (error) {
    lastError = error;
    const failureKind = classifyFailureKind(error, timedOut);
    const attemptsUsed = attempts || 1;

    if (policy.failureMode === 'fail-open' && fallbackValue !== undefined) {
      recordRuntimeExecution({
        dependencyName: policy.dependencyName,
        degraded: true,
        failureKind,
        latencyMs: Date.now() - startedAt,
      });
      context?.logger?.warn?.(
        {
          eventCategory: 'async-job',
          eventName: 'resilience.degraded',
          dependencyName: policy.dependencyName,
          requestId: context?.requestId ?? null,
          traceId: context?.traceId ?? null,
          route: context?.route,
          workItemId: context?.workItemId,
          serviceName: 'gateway',
          ownerSurface: 'runtime-seam',
          ...(isBrokenCircuit(error) ? { circuitBreakerOpen: true } : {}),
        },
        'Resilient operation degraded to fallback',
      );
      return {
        ok: true,
        value: fallbackValue,
        degraded: true,
        attempts: attemptsUsed,
        failureKind,
        failureClassification: mapFailureClassification(failureKind),
        error: lastError,
      };
    }

    recordRuntimeExecution({
      dependencyName: policy.dependencyName,
      failureKind,
      latencyMs: Date.now() - startedAt,
    });
    context?.logger?.error?.(
      {
        eventCategory: 'async-job',
        eventName: 'resilience.failed',
        dependencyName: policy.dependencyName,
        requestId: context?.requestId ?? null,
        traceId: context?.traceId ?? null,
        route: context?.route,
        workItemId: context?.workItemId,
        serviceName: 'gateway',
        ownerSurface: 'runtime-seam',
        failureKind,
        ...(isBrokenCircuit(error) ? { circuitBreakerOpen: true } : {}),
        error:
          lastError instanceof Error
            ? { message: lastError.message, stack: lastError.stack }
            : lastError,
      },
      'Resilient operation failed',
    );

    return {
      ok: false,
      degraded: false,
      attempts: attemptsUsed,
      failureKind,
      failureClassification: mapFailureClassification(failureKind),
      error: lastError,
    };
  } finally {
    retryListener.dispose();
    timeoutListener.dispose();
  }
}
