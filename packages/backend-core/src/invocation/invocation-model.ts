/**
 * Transport-agnostic invocation model.
 *
 * Defines the contract for how backend-core modules are invoked,
 * regardless of whether the caller is an HTTP handler, a CLI command,
 * a task worker, or another module.
 */

// ---------------------------------------------------------------------------
// Invocation modes
// ---------------------------------------------------------------------------

/**
 * Synchronous invocation: caller waits for the result.
 */
export interface SyncInvocation<TInput, TOutput> {
  mode: 'sync';
  execute(input: TInput): Promise<TOutput>;
}

/**
 * Fire-and-forget invocation: caller does not wait.
 * Returns an acknowledgment with an optional correlation ID.
 */
export interface AsyncInvocation<TInput> {
  mode: 'async';
  dispatch(input: TInput): Promise<InvocationAck>;
}

/**
 * Request-response invocation (could be sync over HTTP or RPC).
 * Combines both modes into a unified contract.
 */
export type Invocation<TInput, TOutput> = SyncInvocation<TInput, TOutput> | AsyncInvocation<TInput>;

// ---------------------------------------------------------------------------
// Invocation acknowledgement
// ---------------------------------------------------------------------------

export interface InvocationAck {
  /** Correlation ID for tracing the invocation through the system. */
  correlationId: string;
  /** Optional task/job ID if the invocation was enqueued. */
  taskId?: string;
  /** Timestamp when the invocation was accepted. */
  acceptedAt: string;
}

// ---------------------------------------------------------------------------
// Error taxonomy
// ---------------------------------------------------------------------------

/**
 * Invocation errors are classified into categories that callers
 * can act on without inspecting error messages.
 */
export type InvocationErrorKind =
  | 'validation' // Input failed validation
  | 'unauthorized' // Authentication credentials are invalid
  | 'not-found' // Requested resource does not exist
  | 'conflict' // State conflict (e.g. invalid lifecycle transition)
  | 'forbidden' // Actor lacks required permission
  | 'timeout' // Operation exceeded time limit
  | 'unavailable' // Downstream dependency is unavailable
  | 'internal'; // Unexpected internal error

export class InvocationError extends Error {
  constructor(
    public readonly kind: InvocationErrorKind,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'InvocationError';
  }

  static validation(message: string, cause?: unknown): InvocationError {
    return new InvocationError('validation', message, cause);
  }

  static unauthorized(message: string, cause?: unknown): InvocationError {
    return new InvocationError('unauthorized', message, cause);
  }

  static notFound(message: string, cause?: unknown): InvocationError {
    return new InvocationError('not-found', message, cause);
  }

  static conflict(message: string, cause?: unknown): InvocationError {
    return new InvocationError('conflict', message, cause);
  }

  static forbidden(message: string, cause?: unknown): InvocationError {
    return new InvocationError('forbidden', message, cause);
  }

  static timeout(message: string, cause?: unknown): InvocationError {
    return new InvocationError('timeout', message, cause);
  }

  static unavailable(message: string, cause?: unknown): InvocationError {
    return new InvocationError('unavailable', message, cause);
  }

  static internal(message: string, cause?: unknown): InvocationError {
    return new InvocationError('internal', message, cause);
  }
}

export interface InvocationErrorResponse {
  status: number;
  body: { error: string; kind: InvocationErrorKind };
}

const INVOCATION_ERROR_STATUS: Record<InvocationErrorKind, number> = {
  validation: 400,
  unauthorized: 401,
  'not-found': 404,
  conflict: 409,
  forbidden: 403,
  timeout: 504,
  unavailable: 503,
  internal: 500,
};

export function toInvocationErrorResponse(error: unknown): InvocationErrorResponse {
  if (isInvocationError(error)) {
    return {
      status: INVOCATION_ERROR_STATUS[error.kind],
      body: { error: error.message, kind: error.kind },
    };
  }

  return {
    status: 500,
    body: { error: 'Internal server error', kind: 'internal' },
  };
}

function isInvocationError(error: unknown): error is Pick<InvocationError, 'kind' | 'message'> {
  const candidate = error as { kind?: unknown; message?: unknown } | undefined;
  return (
    candidate !== null &&
    typeof candidate === 'object' &&
    typeof candidate.kind === 'string' &&
    typeof candidate.message === 'string' &&
    candidate.kind in INVOCATION_ERROR_STATUS
  );
}
