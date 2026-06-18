import { ApiError as ClientApiError, apiRequest as clientApiRequest } from '@trapmap/client-core';
import type { ApiResponse as ClientApiResponse, RequestOptions } from '@trapmap/client-core';

import { CliSessionProvider } from './client-core-adapter.js';
import type { CliState } from './config.js';

// ---------------------------------------------------------------------------
// Re-exports
//
// Existing CLI code imports `ApiError` and `ApiResponse` from this module.
// We re-export the canonical types from client-core to avoid divergence.
// ---------------------------------------------------------------------------

export { ClientApiError as ApiError };
export type { ClientApiResponse as ApiResponse };

/** CLI-level request options (backward compatible with the pre-extraction shape). */
export interface ApiRequestOptions {
  body?: unknown;
  method?: RequestOptions['method'];
  path: string;
  /** @deprecated Use the provider's base URL. Kept for backward compat. */
  gatewayUrl?: string;
  /** @deprecated Use the provider's session token. Kept for backward compat. */
  sessionToken?: string | null;
}

// ---------------------------------------------------------------------------
// CLI wrapper -- preserves the original `apiRequest(state, options)` call-site
// while delegating to client-core underneath.
// ---------------------------------------------------------------------------

/**
 * CLI-compatible wrapper around the generic {@link clientApiRequest}.
 *
 * Accepts a {@link CliState} (as the existing commands do) and adapts it to
 * the client-core `SessionProvider` contract.  Any per-request overrides
 * (`gatewayUrl`, `sessionToken`) are forwarded as `baseUrl` / `sessionToken`
 * overrides.
 */
export async function apiRequest<T>(
  state: CliState,
  options: ApiRequestOptions,
): Promise<ClientApiResponse<T>> {
  const provider = new CliSessionProvider(state);

  const req: RequestOptions = {
    path: options.path,
    ...(options.method != null ? { method: options.method } : {}),
    ...(options.body != null ? { body: options.body } : {}),
    ...(options.sessionToken != null ? { sessionToken: options.sessionToken } : {}),
    ...(options.gatewayUrl != null ? { baseUrl: options.gatewayUrl } : {}),
  };

  return clientApiRequest<T>(provider, req);
}

// ---------------------------------------------------------------------------
// requireSessionToken -- remains CLI-specific (error message references the
// `trapmap login` command).
// ---------------------------------------------------------------------------

export function requireSessionToken(state: CliState): string {
  if (typeof state.sessionToken !== 'string' || state.sessionToken.length === 0) {
    throw new Error('Not authenticated. Run `trapmap login` first.');
  }

  return state.sessionToken;
}
