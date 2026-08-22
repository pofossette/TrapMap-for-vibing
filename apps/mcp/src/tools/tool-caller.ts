import type { Role } from '../permissions.js';
import { assertRole } from '../permissions.js';
import { loadMcpConfig } from '../config.js';

const config = loadMcpConfig({ TRAPMAP_ACCESS_TOKEN: 'test-token' });

/** Build a caller that runs a registered tool as a session with the given role. */
export function makeToolCaller(role: Role = 'viewer') {
  return async function callTool(name: string, args: unknown): Promise<unknown> {
    const { allTools } = await import('./registry.js');
    const tool = allTools.find((t) => t.name === name);
    if (!tool) throw new Error(`tool ${name} not registered`);
    assertRole(role, tool.requiredRole);
    return tool.handler(args as Record<string, unknown>, {
      config,
      logger: { info: () => {}, error: () => {} },
      role,
    }) as Promise<unknown>;
  };
}
