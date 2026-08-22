import { z } from 'zod';

import { createGatewayClient } from '../gateway-client.js';
import { bundleFiles, firstBundle } from './bundle.js';
import { defineTool } from './shared.js';

/** Strip file contents — manifests are metadata-only. */
function toManifestEntry(file: Record<string, unknown>): Record<string, unknown> {
  const entry: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(file)) {
    if (key !== 'content') entry[key] = value;
  }
  return entry;
}

/**
 * trapmap_get_skill_manifest — Task B3.
 * Exports the artifact bundle server-side and returns a metadata-only view
 * (title/lifecycle/file list with activation policy hints), no file contents.
 */
export const getSkillManifestTool = defineTool({
  name: 'trapmap_get_skill_manifest',
  description:
    'Get the governance metadata and file manifest for a skill artifact (no file contents). Use trapmap_read_skill_files to fetch specific files.',
  inputSchema: {
    artifactId: z.string().min(1).describe('Skill artifact id'),
  },
  requiredRole: 'viewer',
  async handler(input, ctx) {
    const client = createGatewayClient(ctx.config);
    const response = await client.request('POST', '/v1/operations/artifacts/export', {
      body: { artifactId: input.artifactId, format: 'bundle' },
    });
    const bundle = firstBundle(response);
    if (!bundle) {
      throw new Error(`Artifact not found: ${String(input.artifactId)}`);
    }
    return { ...bundle, files: bundleFiles(bundle).map(toManifestEntry) };
  },
});
