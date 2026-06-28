import {
  getRuntimeMetricsSnapshot,
  recordRuntimeExecution,
  recordRuntimeRetry,
} from './metrics.js';

export type ResilienceFailureKind = 'timeout' | 'retryable' | 'permanent';
export type ResilienceFailureMode = 'fail-closed' | 'fail-open';

export interface ResiliencePolicy {
  dependencyName: string;
  timeoutMs: number;
  maxAttempts: number;
  backoffMs: (attempt: number) => number;
  failureMode: ResilienceFailureMode;
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

export interface ExecuteWithResilienceOptions<T> {
  policy: ResiliencePolicy;
  context?: ResilienceContext;
  operation: () => Promise<T>;
  isRetryableError?: (error: unknown) => boolean;
  isSuccessfulResult?: (value: T) => boolean;
  fallbackValue?: T;
}

function defaultIsRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /timeout|temporar|unavailable|network|reset|econn/i.test(error.message);
}

function classifyFailureKind(error: unknown, isRetryable: boolean): ResilienceFailureKind {
  if (error instanceof Error && /timeout|timed out/i.test(error.message)) {
    return 'timeout';
  }

  return isRetryable ? 'retryable' : 'permanent';
}

function withTimeout<T>(timeoutMs: number, operation: () => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    void operation()
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
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

  let lastError: unknown;
  let lastFailureKind: ResilienceFailureKind | undefined;
  const startedAt = Date.now();

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      const value = await withTimeout(policy.timeoutMs, operation);
      if (isSuccessfulResult(value)) {
        recordRuntimeExecution({
          dependencyName: policy.dependencyName,
          latencyMs: Date.now() - startedAt,
        });
        return {
          ok: true,
          value,
          degraded: false,
          attempts: attempt,
        };
      }

      const resultError = new Error(
        `Operation returned unsuccessful result for ${policy.dependencyName}`,
      );
      lastError = resultError;
      const retryable = attempt < policy.maxAttempts;
      lastFailureKind = retryable ? 'retryable' : 'permanent';
      if (!retryable) {
        break;
      }
      recordRuntimeRetry(policy.dependencyName);
      context?.logger?.warn?.(
        {
          dependencyName: policy.dependencyName,
          attempt,
          requestId: context.requestId ?? null,
          traceId: context.traceId ?? null,
          route: context.route,
          workItemId: context.workItemId,
          failureKind: lastFailureKind,
          metrics: getRuntimeMetricsSnapshot().dependencies[policy.dependencyName],
        },
        'Retrying resilient operation after unsuccessful result',
      );
      await new Promise((resolve) => setTimeout(resolve, policy.backoffMs(attempt)));
    } catch (error) {
      lastError = error;
      const retryable = isRetryableError(error) && attempt < policy.maxAttempts;
      lastFailureKind = classifyFailureKind(error, retryable);

      if (!retryable) {
        break;
      }

      recordRuntimeRetry(policy.dependencyName);
      context?.logger?.warn?.(
        {
          dependencyName: policy.dependencyName,
          attempt,
          requestId: context.requestId ?? null,
          traceId: context.traceId ?? null,
          route: context.route,
          workItemId: context.workItemId,
          metrics: getRuntimeMetricsSnapshot().dependencies[policy.dependencyName],
        },
        'Retrying resilient operation',
      );
      await new Promise((resolve) => setTimeout(resolve, policy.backoffMs(attempt)));
    }
  }

  const failureKind = lastFailureKind ?? classifyFailureKind(lastError, false);
  if (policy.failureMode === 'fail-open' && fallbackValue !== undefined) {
    recordRuntimeExecution({
      dependencyName: policy.dependencyName,
      degraded: true,
      failureKind,
      latencyMs: Date.now() - startedAt,
    });
    context?.logger?.warn?.(
      {
        dependencyName: policy.dependencyName,
        requestId: context?.requestId ?? null,
        traceId: context?.traceId ?? null,
        route: context?.route,
        workItemId: context?.workItemId,
      },
      'Resilient operation degraded to fallback',
    );
    return {
      ok: true,
      value: fallbackValue,
      degraded: true,
      attempts: policy.maxAttempts,
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
      dependencyName: policy.dependencyName,
      requestId: context?.requestId ?? null,
      traceId: context?.traceId ?? null,
      route: context?.route,
      workItemId: context?.workItemId,
      failureKind,
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
    attempts: policy.maxAttempts,
    failureKind,
    failureClassification: mapFailureClassification(failureKind),
    error: lastError,
  };
}
