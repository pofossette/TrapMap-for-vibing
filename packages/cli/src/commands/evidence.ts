import type { KnowledgeListResponse } from '@trapmap/contracts';
import {
  evidenceLevelSchema,
  evidenceSourceTypeSchema,
  knowledgeListResponseSchema,
} from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '../lib/config.js';
import { apiRequest, requireSessionToken } from '../lib/http.js';
import { printResult } from '../lib/output.js';

/**
 * Evidence level to ANSI color mapping per UI-SPEC.
 */
const EVIDENCE_COLORS: Record<string, string> = {
  'verified-in-prod': '32', // green
  documented: '33', // yellow
  reproduced: '35', // magenta
  anecdotal: '90', // dim
};

/**
 * Apply ANSI color to text if terminal supports it.
 * Respects NO_COLOR environment variable and isTTY check.
 */
function withColor(text: string, colorCode: string): string {
  if (process.env.NO_COLOR || !process.stdout.isTTY) {
    return text;
  }
  return `\x1b[${colorCode}m${text}\x1b[0m`;
}

interface EvidenceCommandOptions {
  allowReview: boolean;
}

export function registerEvidenceCommands(program: Command, options: EvidenceCommandOptions): void {
  if (!options.allowReview) {
    return;
  }

  // Command: admin:evidence - List knowledge entries by evidence status
  program
    .command('admin:evidence')
    .description('List knowledge entries by evidence status')
    .option('--level <level>', 'Filter by evidence level')
    .option('--missing', 'Show only entries with missing evidence')
    .option('--json', 'Output JSON')
    .action(async (flags: { level?: string; missing?: boolean; json?: boolean }) => {
      const state = await loadCliState();
      requireSessionToken(state);

      const params = new URLSearchParams();
      if (flags.level !== undefined) {
        // Send as array param: evidenceLevel[]=value (matches z.array schema on server)
        params.append('evidenceLevel[]', flags.level);
      }
      if (flags.missing === true) {
        params.set('missingEvidence', 'true');
      }

      const queryString = params.toString();
      const path =
        queryString.length > 0 ? `/v1/knowledge/list?${queryString}` : '/v1/knowledge/list';

      const response = await apiRequest<KnowledgeListResponse>(state, {
        path,
      });

      const parsed = knowledgeListResponseSchema.parse(response.data);

      printResult(parsed, flags, (result) => {
        if (result.items.length === 0) {
          return 'No entries found';
        }
        return result.items
          .map((item) => {
            const evidenceStr =
              item.evidenceMeta !== null && item.evidenceMeta !== undefined
                ? `${withColor(
                    item.evidenceMeta.evidenceLevel,
                    EVIDENCE_COLORS[item.evidenceMeta.evidenceLevel] ?? '0',
                  )} (${item.evidenceMeta.sourceType})`
                : '(none)';
            return `${item.id} [${item.lifecycleState}] - ${item.shortcut} | Evidence: ${evidenceStr}`;
          })
          .join('\n');
      });
    });

  // Command: evidence:update - Update evidence metadata on an existing entry
  program
    .command('evidence:update')
    .description('Update evidence metadata on a knowledge entry')
    .argument('<id>', 'Knowledge entry identifier')
    .option('--level <level>', 'Evidence level (verified-in-prod|documented|reproduced|anecdotal)')
    .option(
      '--type <type>',
      'Source type (internal-experience|incident|doc|code|external-reference)',
    )
    .option('--ref <ref>', 'Source reference')
    .action(async (id: string, flags: { level?: string; ref?: string; type?: string }) => {
      const state = await loadCliState();
      requireSessionToken(state);

      // Validate level if provided
      if (flags.level !== undefined) {
        const result = evidenceLevelSchema.safeParse(flags.level);
        if (!result.success) {
          throw new Error(
            `Invalid evidence level: ${flags.level}. Must be one of: anecdotal, reproduced, documented, verified-in-prod`,
          );
        }
      }

      // Validate type if provided
      if (flags.type !== undefined) {
        const result = evidenceSourceTypeSchema.safeParse(flags.type);
        if (!result.success) {
          throw new Error(
            `Invalid source type: ${flags.type}. Must be one of: internal-experience, incident, doc, code, external-reference`,
          );
        }
      }

      await apiRequest(state, {
        method: 'PATCH',
        path: `/v1/knowledge/${id}/evidence`,
        body: {
          evidenceLevel: flags.level,
          sourceType: flags.type,
          sourceRef: flags.ref,
        },
      });

      const level = flags.level ?? 'unknown';
      const colorCode = EVIDENCE_COLORS[flags.level ?? ''] ?? '0';
      console.log(
        `Evidence updated: ${withColor(level, colorCode)} | ${flags.type ?? 'unchanged'}`,
      );
    });
}
