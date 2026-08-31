import type { SessionProvider } from '../session/session-provider.js';
import { ApiError } from './api-error.js';
import type { ApiResponse, RequestOptions } from './request-envelope.js';

function parseResponsePayload<T>(text: string, url: string): T | { message?: string } | null {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as T | { message?: string };
  } catch (error) {
    throw new ApiError(
      502,
      { rawBody: text },
      `Invalid JSON response from ${url}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Execute an HTTP request against the TrapMap gateway.
 *
 * This is the primary transport primitive shared by every client (CLI, web
 * panel, tests).  It resolves the target URL and credentials from the supplied
 * {@link SessionProvider} and returns a typed {@link ApiResponse}.
 *
 * @param provider - Supplies base URL and session credentials.
 * @param options  - Per-request options (path, method, body, overrides).
 */
export async function apiRequest<T>(
  provider: SessionProvider,
  options: RequestOptions,
): Promise<ApiResponse<T>> {
  const url = new URL(options.path, options.baseUrl ?? provider.getBaseUrl()).toString();
  const headers: Record<string, string> = {};

  if (options.body) {
    headers['content-type'] = 'application/json';
  }

  const token = options.sessionToken ?? provider.getSessionToken();

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const credentials = options.credentials ?? provider.getFetchOptions?.()?.credentials;

  let response: Response;

  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
      ...(credentials ? { credentials } : {}),
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new ApiError(0, { cause: reason, url }, `Request to ${url} failed: ${reason}`);
  }

  const sessionToken = response.headers.get('x-session-token');
  const text = await response.text();
  const payload = parseResponsePayload<T>(text, url);

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'message' in payload
        ? String(payload.message)
        : `Request failed with status ${response.status}`;
    throw new ApiError(response.status, payload, message);
  }

  return {
    // Note: T is a compile-time type hint only. Runtime type validation is not performed.
    data: payload as T,
    sessionToken,
  };
}
