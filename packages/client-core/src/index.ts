/**
 * @trapmap/client-core -- shared gateway transport for TrapMap clients.
 *
 * This package provides the HTTP gateway access layer consumed by the CLI
 * and any future client (web panel, SDK).  It is browser-compatible and
 * depends only on the standard `fetch` API.
 *
 * Usage:
 *
 * ```ts
 * import { apiRequest, ApiError } from '@trapmap/client-core';
 *
 * const provider = {
 *   getBaseUrl: () => 'http://127.0.0.1:4000',
 *   getSessionToken: () => storedToken,
 * };
 *
 * const { data, sessionToken } = await apiRequest(provider, {
 *   path: '/v1/auth/session',
 * });
 * ```
 */

export { ApiError } from './http/api-error.js';
export { apiRequest } from './http/api-request.js';
export type { ApiResponse, HttpMethod, RequestOptions } from './http/request-envelope.js';
export type { SessionProvider } from './session/session-provider.js';
