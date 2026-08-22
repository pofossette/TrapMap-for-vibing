import { z } from 'zod';

import { createGatewayClient } from '../gateway-client.js';
import { defineTool } from './shared.js';

/**
 * trapmap_submit_skill_draft — Task B4 (draft-only write path).
 * Builds an import bundle that lands in `pending` review — the gateway's
 * import pipeline never auto-approves, so agent-submitted skills always
 * require human/reviewer action before activation.
 */
export const submitSkillDraftTool = defineTool({
  name: 'trapmap_submit_skill_draft',
  description:
    'Submit a skill artifact DRAFT for governance review. The draft enters pending review and must be approved before activation; it is never auto-published.',
  inputSchema: {
    slug: z.string().min(1).describe('Skill slug (kebab-case)'),
    title: z.string().min(1).describe('Skill title'),
    files: z
      .array(z.object({ path: z.string().min(1), content: z.string() }))
      .min(1)
      .describe('Draft files (SKILL.md first)'),
  },
  requiredRole: 'contributor',
  async handler(input, ctx) {
    const client = createGatewayClient(ctx.config);
    const bundle = {
      slug: input.slug,
      title: input.title,
      files: input.files.map((file) => ({
        path: file.path,
        content: file.content,
        kind: file.path.endsWith('.md') ? 'doc' : 'script',
      })),
    };
    return client.request('POST', '/v1/operations/artifacts/import', {
      body: { bundles: [bundle] },
    });
  },
});
