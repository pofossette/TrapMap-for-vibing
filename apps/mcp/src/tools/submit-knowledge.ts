import { z } from 'zod';

import { createGatewayClient } from '../gateway-client.js';
import { defineTool } from './shared.js';

/**
 * trapmap_submit_knowledge — Task B4 (draft-only write path).
 * Submissions always enter the governance review queue: no lifecycle_state
 * is accepted or sent, and actorId comes exclusively from the gateway session.
 */
export const submitKnowledgeTool = defineTool({
  name: 'trapmap_submit_knowledge',
  description:
    'Submit a new knowledge entry as a DRAFT into the TrapMap governance queue. It is NOT published until a reviewer approves it.',
  inputSchema: {
    title: z.string().min(1).describe('Entry title'),
    content: z.string().min(1).describe('Entry body content'),
    labels: z.array(z.string().min(1)).optional().describe('Optional labels'),
    teamId: z.string().min(1).optional().describe('Target team'),
  },
  requiredRole: 'contributor',
  async handler(input, ctx) {
    const client = createGatewayClient(ctx.config);
    return client.request('POST', '/v1/knowledge', {
      body: {
        title: input.title,
        content: input.content,
        ...(input.labels ? { labels: input.labels } : {}),
        ...(input.teamId ? { teamId: input.teamId } : {}),
      },
    });
  },
});
