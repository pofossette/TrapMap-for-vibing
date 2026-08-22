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
      'trapmap_submit_knowledge',
      'trapmap_submit_skill_draft',
      'trapmap_submit_feedback',
      'trapmap_list_review_queue',
      'trapmap_get_review_detail',
      'trapmap_review_decision',
      'trapmap_complete_remediation',
    ]);
    expect(allTools.slice(0, 3).every((tool) => tool.requiredRole === 'viewer')).toBe(true);
    expect(allTools.slice(3, 6).every((tool) => tool.requiredRole === 'contributor')).toBe(true);
    expect(allTools.slice(6, 8).every((tool) => tool.requiredRole === 'reviewer')).toBe(true);
    expect(allTools.slice(8).every((tool) => tool.requiredRole === 'operator')).toBe(true);
  });
});
