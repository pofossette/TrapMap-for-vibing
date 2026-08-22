import { z } from 'zod';

import { createGatewayClient } from '../gateway-client.js';
import { defineTool } from './shared.js';

/**
 * trapmap_submit_feedback — Task B4.
 * Files feedback against an existing knowledge entry.
 */
export const submitFeedbackTool = defineTool({
  name: 'trapmap_submit_feedback',
  description: 'File structured feedback against an existing TrapMap knowledge entry.',
  inputSchema: {
    entryId: z.string().min(1).describe('Knowledge entry id'),
    problemType: z.string().min(1).describe('Feedback category'),
    description: z.string().min(1).describe('What is wrong / what should change'),
  },
  requiredRole: 'contributor',
  async handler(input, ctx) {
    const client = createGatewayClient(ctx.config);
    return client.request('POST', '/v1/feedback', {
      body: {
        entryId: input.entryId,
        problemType: input.problemType,
        description: input.description,
      },
    });
  },
});
