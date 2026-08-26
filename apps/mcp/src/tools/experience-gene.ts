import { geneSearchQuerySchema } from '@trapmap/contracts';
import { z } from 'zod';

import { createGatewayClient } from '../gateway-client.js';
import { defineTool } from './shared.js';

export const searchExperienceGenesTool = defineTool({
  name: 'trapmap_search_experience_genes',
  description:
    'Search governed Experience Genes and return the structured primary strategy plus distinct-source avoidance warnings.',
  inputSchema: {
    seed: z.string().min(1).max(2000).describe('Natural-language task or error seed'),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(5)
      .optional()
      .describe('Maximum ranked genes considered by the client (default 1)'),
    teamId: z
      .string()
      .min(1)
      .optional()
      .describe('Further narrow search to the authenticated team'),
    labels: z.array(z.string().min(1)).max(20).optional().describe('Required labels'),
    scopes: z
      .array(z.enum(['global', 'project']))
      .max(2)
      .optional()
      .describe('Allowed scopes'),
  },
  requiredRole: 'viewer',
  async handler(input, ctx) {
    const client = createGatewayClient(ctx.config);
    return client.request('POST', '/v1/retrieval/genes/search', {
      body: geneSearchQuerySchema.parse({
        seed: input.seed,
        filters: {
          ...(input.teamId === undefined ? {} : { teamId: input.teamId }),
          labels: input.labels ?? [],
          scopes: input.scopes ?? [],
        },
        maxResults: input.maxResults ?? 1,
        includeActivationHints: false,
      }),
    });
  },
});
