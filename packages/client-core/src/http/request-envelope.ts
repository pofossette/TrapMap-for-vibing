/**
 * Request and response envelope types shared by all gateway consumers.
 */

/** Allowed HTTP methods for gateway requests. */
export type HttpMethod = 'GET' | 'POST' | 'PATCH';

/** Options accepted by {@link apiRequest}. */
export interface RequestOptions {
  /** URL path relative to the gateway base (e.g. "/v1/knowledge"). */
  path: string;
  /** HTTP method.  Defaults to GET. */
  method?: HttpMethod;
  /** JSON-serialisable request body.  Ignored for GET. */
  body?: unknown;
  /**
   * Explicit session token to use for this request.
   * Takes precedence over the token from the {@link SessionProvider}.
   */
  sessionToken?: string | null;
  /**
   * Explicit base URL override for this single request.
   * Takes precedence over the provider's `getBaseUrl()`.
   */
  baseUrl?: string;
  /**
   * Fetch credentials mode for this request.
   * When `include`, the browser will send cookies even cross-site.
   * Defaults to `same-origin` (omit the option). The gateway cookie
   * preference branch uses `include` when no bearer token is present,
   * without mutating global fetch, so concurrent requests remain isolated.
   */
  credentials?: RequestCredentials;
}

/** Wrapper returned by {@link apiRequest} on success. */
export interface ApiResponse<T> {
  /** Parsed response payload. */
  data: T;
  /** Session token echoed by the server via `x-session-token`, or null. */
  sessionToken: string | null;
}
