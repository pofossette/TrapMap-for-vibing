import type { SessionProvider } from '../session/session-provider.js';
import { ApiError } from './api-error.js';
import { resolveClientMaxRetries, resolveClientTimeoutMs } from './client-config.js';
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
 * Transport knobs (`timeoutMs`, `maxRetries`) resolve per-request first, then
 * from `TRAPMAP_CLIENT_TIMEOUT_MS` / `TRAPMAP_CLIENT_MAX_RETRIES`, and are
 * OFF by default (no timeout, single attempt — legacy behavior).
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

  const timeoutMs = options.timeoutMs ?? resolveClientTimeoutMs();
  const maxRetries = options.maxRetries ?? resolveClientMaxRetries() ?? 0;

  const doFetch = async (signal: AbortSignal | undefined): Promise<Response> => {
    try {
      return await fetch(url, {
        method: options.method ?? 'GET',
        headers,
        ...(credentials ? { credentials } : {}),
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        ...(signal ? { signal } : {}),
      });
    } catch (error) {
      if (signal?.aborted) {
        throw new ApiError(
          0,
          { cause: 'timeout', url },
          `Request to ${url} timed out after ${timeoutMs}ms`,
        );
      }
      // Fallback to Node http for localhost where fetch (undici) may ECONNREFUSED due to IPv6/keep-alive quirks
      const reason = error instanceof Error ? error.message : String(error);
      if (reason.includes('ECONNREFUSED') || reason.includes('fetch failed')) {
        try {
          const httpMod = await import('node:http');
          const httpsMod = await import('node:https');
          return await new Promise<Response>((resolve, reject) => {
            const request = httpMod.request;
            const httpsRequest = httpsMod.request;
            const isHttps = url.startsWith('https://');
            const reqFn = isHttps ? httpsRequest : request;
            const u = new URL(url);
            const req = reqFn(
              {
                hostname: u.hostname,
                port: u.port,
                path: u.pathname + u.search,
                method: options.method ?? 'GET',
                headers,
              },
              (res: any) => {
                const chunks: Buffer[] = [];
                res.on('data', (c: Buffer) => chunks.push(c));
                res.on('end', () => {
                  const headerRecord: Record<string, string> = {};
                  for (const [k, v] of Object.entries(
                    res.headers as Record<string, string | string[] | undefined>,
                  )) {
                    if (typeof v === 'string') headerRecord[k.toLowerCase()] = v;
                    else if (Array.isArray(v)) headerRecord[k.toLowerCase()] = v.join(', ');
                  }
                  resolve(
                    new Response(text, { status: res.statusCode ?? 500, headers: headerRecord }),
                  );
                });
              },
            );
            req.on('error', reject);
            if (options.body) req.write(JSON.stringify(options.body));
            req.end();
          });
        } catch (fallbackError) {
          const fbReason =
            fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
          throw new ApiError(0, { cause: fbReason, url }, `Request to ${url} failed: ${fbReason}`);
        }
      } else {
        throw new ApiError(0, { cause: reason, url }, `Request to ${url} failed: ${reason}`);
      }
    }
  };

  let response!: Response;
  for (let attempt = 0; ; attempt += 1) {
    const controller = timeoutMs !== undefined ? new AbortController() : undefined;
    const timer =
      controller !== undefined && timeoutMs !== undefined
        ? setTimeout(() => controller.abort(), timeoutMs)
        : undefined;
    try {
      response = await doFetch(controller?.signal);
    } catch (error) {
      if (timer !== undefined) clearTimeout(timer);
      // Retry network-level failures only when retries are enabled.
      if (attempt < maxRetries && error instanceof ApiError && error.statusCode === 0) {
        continue;
      }
      throw error;
    }
    if (timer !== undefined) clearTimeout(timer);
    // Retry server-side failures only when retries are enabled; 4xx still throws below.
    if (response.status >= 500 && attempt < maxRetries) {
      continue;
    }
    break;
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
