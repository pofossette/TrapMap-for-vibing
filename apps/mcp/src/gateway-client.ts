import { ApiError, apiRequest } from '@trapmap/client-core';

import type { McpConfig } from './config.js';

// fallow-ignore-next-line unused-export -- 语义化错误类型：B4/B5 工具与调用方按 statusCode 分支时消费
export class GatewayHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly payload: unknown,
  ) {
    super(`Gateway request failed with status ${statusCode}`);
    this.name = 'GatewayHttpError';
  }
}

export interface GatewayClient {
  request<T>(
    method: 'GET' | 'POST' | 'PATCH',
    path: string,
    opts?: { body?: unknown; query?: Record<string, string> },
  ): Promise<T>;
}

/**
 * Thin TrapMap gateway client for MCP tools (Task B3).
 * Wraps `@trapmap/client-core` `apiRequest` with the configured Bearer token
 * and normalizes `ApiError`s into {@link GatewayHttpError}.
 */
export function createGatewayClient(config: McpConfig): GatewayClient {
  const provider = {
    getBaseUrl: (): string => config.gatewayUrl,
    getSessionToken: (): string => config.accessToken,
  };

  return {
    async request(method, path, opts = {}) {
      const query =
        opts.query && Object.keys(opts.query).length > 0
          ? `?${new URLSearchParams(opts.query).toString()}`
          : '';
      try {
        const response = await apiRequest<T>(provider, {
          method,
          path: `${path}${query}`,
          ...(opts.body !== undefined ? { body: opts.body } : {}),
        });
        return response.data;
      } catch (err) {
        if (err instanceof ApiError) {
          throw new GatewayHttpError(err.statusCode, err.payload);
        }
        throw err;
      }
    },
  };
}
