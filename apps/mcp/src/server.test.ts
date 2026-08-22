import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { loadMcpConfig } from './config.js';
import { createTrapmapMcpServer } from './server.js';
import { allTools } from './tools/registry.js';
import { defineTool } from './tools/shared.js';

const baseConfig = loadMcpConfig({ TRAPMAP_ACCESS_TOKEN: 'test-token' });

describe('createTrapmapMcpServer', () => {
  it('registers every tool from the registry with strict validation wired', async () => {
    const seen: string[] = [];
    const dummy = defineTool({
      name: 'trapmap_dummy_tool',
      description: 'probe',
      inputSchema: { query: z.string().min(1) },
      requiredRole: 'viewer',
      async handler(input) {
        seen.push(String(input.query));
        return { echoed: input.query };
      },
    });

    allTools.push(dummy);
    try {
      const { registeredTools } = createTrapmapMcpServer(baseConfig);
      expect(registeredTools).toContain('trapmap_dummy_tool');
    } finally {
      allTools.pop();
    }
    expect(seen).toEqual([]);
  });

  it('registers the B3 read tools', () => {
    expect(allTools.map((tool) => tool.name)).toEqual([
      'trapmap_search_knowledge',
      'trapmap_get_skill_manifest',
      'trapmap_read_skill_files',
    ]);
    expect(allTools.every((tool) => tool.requiredRole === 'viewer')).toBe(true);
  });
});
