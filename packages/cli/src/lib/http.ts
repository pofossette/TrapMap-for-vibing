import type { CliState } from './config.js';

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
  serverUrl?: string;
  sessionToken?: string | null;
}

export interface ApiResponse<T> {
  data: T;
  sessionToken: string | null;
}

export async function apiRequest<T>(
  state: CliState,
  options: ApiRequestOptions,
): Promise<ApiResponse<T>> {
  const url = new URL(options.path, options.serverUrl ?? state.serverUrl).toString();
  const headers: Record<string, string> = {};

  if (options.body) {
    headers['content-type'] = 'application/json';
  }

  if (options.sessionToken ?? state.sessionToken) {
    headers.authorization = `Bearer ${options.sessionToken ?? state.sessionToken}`;
  }

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });

  const sessionToken = response.headers.get('x-session-token');
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as T | { message?: string }) : null;

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
  if (!state.sessionToken) {
    throw new Error('Not authenticated. Run `skill-shareer login` first.');
  }

  return state.sessionToken;
}
