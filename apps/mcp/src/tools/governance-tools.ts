import { z } from 'zod';

import { createGatewayClient } from '../gateway-client.js';
import { defineTool } from './shared.js';

/**
 * Governance tool group (Task B5) — reviewer/operator surfaces over the
 * artifact + knowledge + remediation review flows.
 */

export const listReviewQueueTool = defineTool({
  name: 'trapmap_list_review_queue',
  description: 'List skill artifacts waiting in the governance review queue.',
  inputSchema: {},
  requiredRole: 'reviewer',
  async handler(_input, ctx) {
    const client = createGatewayClient(ctx.config);
    return client.request('GET', '/v1/operations/artifacts/review-queue');
  },
});

export const getReviewDetailTool = defineTool({
  name: 'trapmap_get_review_detail',
  description: 'Get the lifecycle history of a skill artifact under review.',
  inputSchema: {
    artifactId: z.string().min(1).describe('Skill artifact id'),
  },
  requiredRole: 'reviewer',
  async handler(input, ctx) {
    const client = createGatewayClient(ctx.config);
    return client.request(
      'GET',
      `/v1/operations/artifacts/${encodeURIComponent(input.artifactId)}/history`,
    );
  },
});

export const reviewDecisionTool = defineTool({
  name: 'trapmap_review_decision',
  description:
    'Approve or reject a skill artifact (operator decision). Approving activates the artifact; rejecting sends it back.',
  inputSchema: {
    artifactId: z.string().min(1).describe('Skill artifact id'),
    decision: z.enum(['approve', 'reject']).describe('Review outcome'),
    note: z.string().optional().describe('Decision note for the audit trail'),
  },
  requiredRole: 'operator',
  async handler(input, ctx) {
    const client = createGatewayClient(ctx.config);
    return client.request('POST', '/v1/artifacts/review', {
      body: {
        artifactId: input.artifactId,
        decision: input.decision,
        ...(input.note ? { note: input.note } : {}),
      },
    });
  },
});

export const completeRemediationTool = defineTool({
  name: 'trapmap_complete_remediation',
  description: 'Mark a feedback remediation for a knowledge entry as complete (operator action).',
  inputSchema: {
    entryId: z.string().min(1).describe('Knowledge entry id'),
    actorNote: z.string().optional().describe('Completion note'),
  },
  requiredRole: 'operator',
  async handler(input, ctx) {
    const client = createGatewayClient(ctx.config);
    return client.request(
      'POST',
      `/v1/operations/feedback/remediation/${encodeURIComponent(input.entryId)}/complete`,
      {
        body: {
          ...(input.actorNote ? { note: input.actorNote } : {}),
        },
      },
    );
  },
});
