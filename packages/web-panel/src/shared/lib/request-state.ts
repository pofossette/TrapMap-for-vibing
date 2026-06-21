import type { RequestStatus } from '@trapmap/web-panel/shared/enum-types';

export type RequestState<T> =
  | {
      error: null;
      lastUpdatedAt: null;
      payload: T | null;
      status: 'idle';
    }
  | {
      error: null;
      lastUpdatedAt: string | null;
      payload: T | null;
      status: 'loading';
    }
  | {
      error: null;
      lastUpdatedAt: string;
      payload: T;
      status: 'success';
    }
  | {
      error: string;
      lastUpdatedAt: string | null;
      payload: T | null;
      status: 'error';
    };

export function createIdleRequestState<T>(payload: T | null = null): RequestState<T> {
  return {
    status: 'idle',
    payload,
    error: null,
    lastUpdatedAt: null,
  };
}

export function createLoadingRequestState<T>(previous: RequestState<T>): RequestState<T> {
  return {
    status: 'loading',
    payload: previous.payload,
    error: null,
    lastUpdatedAt: previous.lastUpdatedAt,
  };
}

export function createSuccessRequestState<T>(payload: T, at: string): RequestState<T> {
  return {
    status: 'success',
    payload,
    error: null,
    lastUpdatedAt: at,
  };
}

export function createErrorRequestState<T>(
  previous: RequestState<T>,
  error: string,
): RequestState<T> {
  return {
    status: 'error',
    payload: previous.payload,
    error,
    lastUpdatedAt: previous.lastUpdatedAt,
  };
}

export function isRequestSettled(status: RequestStatus): boolean {
  return status === 'success' || status === 'error';
}
