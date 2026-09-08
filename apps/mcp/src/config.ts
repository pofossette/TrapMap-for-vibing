import { z } from 'zod';

import { DEFAULT_GATEWAY_URL } from '@trapmap/client-core';

/**
 * MCP server configuration (Task B2).
 * - `TRAPMAP_GATEWAY_URL`: gateway base URL (default local light profile).
 * - `TRAPMAP_ACCESS_TOKEN`: TrapMap access token used as Bearer credential.
 */
const mcpConfigSchema = z.object({
  gatewayUrl: z.string().url().default(DEFAULT_GATEWAY_URL),
  accessToken: z.string().min(1),
});

export type McpConfig = z.infer<typeof mcpConfigSchema>;

export function loadMcpConfig(env: Record<string, string | undefined>): McpConfig {
  return mcpConfigSchema.parse({
    gatewayUrl: env.TRAPMAP_GATEWAY_URL,
    accessToken: env.TRAPMAP_ACCESS_TOKEN,
  });
}
