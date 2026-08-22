/**
 * @trapmap/app-mcp — TrapMap MCP server entry point (stdio transport).
 *
 * Usage by agent hosts (Claude Code, Codex, OpenCode, …):
 *   TRAPMAP_GATEWAY_URL=http://127.0.0.1:4000 \
 *   TRAPMAP_ACCESS_TOKEN=<token> \
 *   <agent> mcp add trapmap -- pnpm --filter @trapmap/app-mcp start
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';

import { loadMcpConfig } from './config.js';
import { createTrapmapMcpServer } from './server.js';

/** Package identity (kept for diagnostics and tests). */
export function createAppInfo(): { name: string; version: string } {
  return { name: '@trapmap/app-mcp', version: '0.1.0' };
}

async function main(): Promise<void> {
  const config = loadMcpConfig(process.env);
  const { mcpServer } = createTrapmapMcpServer(config);

  await mcpServer.connect(new StdioServerTransport());

  const shutdown = async (): Promise<void> => {
    await mcpServer.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  await main();
}
