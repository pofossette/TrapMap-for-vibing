import { resolveCliGatewayUrl, type CliState } from './config.js';

export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly payload: unknown,
    message: string,
  ) {
    super(message);
  }
}

export interface ApiRequestOptions {
  body?: unknown;
  method?: 'GET' | 'POST' | 'PATCH';
  path: string;
  gatewayUrl?: string;
  sessionToken?: string | null;
}

export interface ApiResponse<T> {
  data: T;
  sessionToken: string | null;
}

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

export async function apiRequest<T>(
  state: CliState,
  options: ApiRequestOptions,
): Promise<ApiResponse<T>> {
  const url = new URL(options.path, options.gatewayUrl ?? resolveCliGatewayUrl(state)).toString();
  const headers: Record<string, string> = {};

  if (options.body) {
    headers['content-type'] = 'application/json';
  }

  if (options.sessionToken ?? state.sessionToken) {
    headers.authorization = `Bearer ${options.sessionToken ?? state.sessionToken}`;
  }

  let response: Response;

  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers,
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
    data: payload as T,
    sessionToken,
  };
}

export function requireSessionToken(state: CliState): string {
  if (typeof state.sessionToken !== 'string' || state.sessionToken.length === 0) {
    throw new Error('Not authenticated. Run `trapmap login` first.');
  }

  return state.sessionToken;
}
