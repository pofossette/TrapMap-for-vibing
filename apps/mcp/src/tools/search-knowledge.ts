import { z } from 'zod';

import { createGatewayClient } from '../gateway-client.js';
import { defineTool } from './shared.js';

/**
 * trapmap_search_knowledge — POST /v1/retrieval/search (Task B3).
 * Returns metadata-only retrieval matches (never full file payloads).
 */
export const searchKnowledgeTool = defineTool({
  name: 'trapmap_search_knowledge',
  description:
    'Search the TrapMap governed knowledge/skill repository by content. Returns metadata-only matches (titles, capsules, activation hints) — never full file contents.',
  inputSchema: {
    query: z.string().min(1).describe('Natural-language search text'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum matches (default server-side)'),
    teamId: z.string().min(1).optional().describe('Scope the search to a team'),
  },
  requiredRole: 'viewer',
  async handler(input, ctx) {
    const client = createGatewayClient(ctx.config);
    return client.request('POST', '/v1/retrieval/search', {
      body: {
        query: input.query,
        ...(typeof input.limit === 'number' ? { limit: input.limit } : {}),
        ...(typeof input.teamId === 'string' ? { teamId: input.teamId } : {}),
      },
    });
  },
});
