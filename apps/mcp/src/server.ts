import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import type { McpConfig } from './config.js';
import { allTools } from './tools/registry.js';
import type { AuditLogger, ToolContext } from './tools/shared.js';

const noopLogger: AuditLogger = {
  info: () => {},
  error: () => {},
};

export interface TrapmapMcpServer {
  mcpServer: McpServer;
  /** Names of tools wired into this server instance (test/inspection surface). */
  registeredTools: string[];
}

/**
 * Create the TrapMap MCP server (Task B2).
 *
 * Every tool from the registry is wrapped with:
 * - strict input validation (unknown keys rejected before handlers run),
 * - uniform error mapping (handler throws → MCP isError result),
 * so individual tool handlers stay thin.
 */
export function createTrapmapMcpServer(
  config: McpConfig,
  deps?: { fetchImpl?: typeof fetch; logger?: AuditLogger },
): TrapmapMcpServer {
  const mcpServer = new McpServer({ name: 'trapmap-mcp', version: '0.1.0' });
  const ctx: ToolContext = {
    config,
    logger: deps?.logger ?? noopLogger,
    ...(deps?.fetchImpl !== undefined ? { fetchImpl: deps.fetchImpl } : {}),
  };

  const registeredTools: string[] = [];
  for (const tool of allTools) {
    registeredTools.push(tool.name);
    const schema = z.object(tool.inputSchema).strict();
    mcpServer.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.inputSchema },
      async (args: unknown) => {
        try {
          const parsed = schema.parse(args ?? {});
          const output = await tool.handler(parsed as Record<string, unknown>, ctx);
          return { content: [{ type: 'text' as const, text: JSON.stringify(output) }] };
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          return {
            isError: true as const,
            content: [{ type: 'text' as const, text: message }],
          };
        }
      },
    );
  }

  return { mcpServer, registeredTools };
}
