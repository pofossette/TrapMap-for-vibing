import { z } from 'zod';

import { createGatewayClient } from '../gateway-client.js';
import { type BundleFile, bundleFiles, firstBundle } from './bundle.js';
import { defineTool } from './shared.js';

type ScriptPolicy = 'blocked' | 'reference-only' | 'needs-approval' | 'client-executable';

const POLICY_RANK: Record<ScriptPolicy, number> = {
  blocked: 0,
  'reference-only': 1,
  'needs-approval': 2,
  'client-executable': 3,
};

const POLICY_VALUES = Object.keys(POLICY_RANK) as ScriptPolicy[];

/**
 * Four-state activation policy, client side (mirrors
 * apps/cli/src/lib/activation-policy.ts): effective = min(serverDefault, localOverride).
 * Unknown server values degrade to the most conservative reading policy.
 */
export function effectivePolicy(serverPolicy: unknown): ScriptPolicy {
  const localRaw = process.env.TRAPMAP_MCP_SCRIPT_POLICY;
  const local: ScriptPolicy =
    typeof localRaw === 'string' && (POLICY_VALUES as string[]).includes(localRaw)
      ? (localRaw as ScriptPolicy)
      : 'client-executable';
  const server: ScriptPolicy =
    typeof serverPolicy === 'string' && (POLICY_VALUES as string[]).includes(serverPolicy)
      ? (serverPolicy as ScriptPolicy)
      : 'reference-only';
  return POLICY_RANK[server] <= POLICY_RANK[local] ? server : local;
}

function filePolicy(file: BundleFile): ScriptPolicy {
  if (file.activationOnly === true) return 'blocked';
  return effectivePolicy(file.kind === 'script' ? 'needs-approval' : 'reference-only');
}

interface CollectedFiles {
  delivered: Array<Record<string, unknown>>;
  skipped: Array<{ path: string; reason: string }>;
}

// fallow-ignore-next-line complexity -- 单遍「匹配→策略分类→缺失回填」循环；再拆会打散同一语义
function collectRequestedFiles(
  bundle: Record<string, unknown>,
  requestedPaths: readonly string[],
): CollectedFiles {
  const requested = new Set(requestedPaths);
  const collected: CollectedFiles = { delivered: [], skipped: [] };

  for (const file of bundleFiles(bundle)) {
    const path = String(file.path ?? '');
    if (!requested.has(path)) continue;
    const policy = filePolicy(file);
    if (policy === 'blocked') {
      collected.skipped.push({ path, reason: 'blocked by activation policy' });
      continue;
    }
    collected.delivered.push({
      path,
      kind: file.kind ?? null,
      content: typeof file.content === 'string' ? file.content : String(file.content ?? ''),
      effectivePolicy: policy,
    });
  }

  for (const path of requestedPaths) {
    if (
      !collected.delivered.some((f) => f.path === path) &&
      !collected.skipped.some((s) => s.path === path)
    ) {
      collected.skipped.push({ path, reason: 'not present in artifact bundle' });
    }
  }
  return collected;
}

/**
 * trapmap_read_skill_files — Task B3.
 * Fetch specific files from an artifact bundle. Enforces the four-state
 * activation policy client-side: `blocked` paths are refused outright and
 * scripts carry their effective policy in the response.
 */
export const readSkillFilesTool = defineTool({
  name: 'trapmap_read_skill_files',
  description:
    'Read specific files from a skill artifact by path. Blocked files are rejected; scripts are governed by the activation policy (min of server default and TRAPMAP_MCP_SCRIPT_POLICY override).',
  inputSchema: {
    artifactId: z.string().min(1).describe('Skill artifact id'),
    paths: z.array(z.string().min(1)).min(1).describe('File paths to fetch (e.g. ["SKILL.md"])'),
  },
  requiredRole: 'viewer',
  async handler(input, ctx) {
    const client = createGatewayClient(ctx.config);
    const response = await client.request('POST', '/v1/operations/artifacts/export', {
      body: { artifactId: input.artifactId, format: 'bundle' },
    });
    const bundle = firstBundle(response);
    if (!bundle) throw new Error(`Artifact not found: ${String(input.artifactId)}`);
    const collected = collectRequestedFiles(bundle, input.paths);
    return {
      artifactId: input.artifactId,
      files: collected.delivered,
      skipped: collected.skipped,
    };
  },
});
