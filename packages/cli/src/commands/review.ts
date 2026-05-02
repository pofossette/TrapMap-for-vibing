import type { KnowledgeEntryResponse, ReviewQueueResponse } from '@trapmap/contracts';
import {
  evidenceLevelSchema,
  evidenceSourceTypeSchema,
  knowledgeEntryResponseSchema,
  reviewQueueResponseSchema,
} from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '../lib/config.js';
import { apiRequest, requireSessionToken } from '../lib/http.js';
import { printResult } from '../lib/output.js';

interface ReviewCommandOptions {
  allowReview: boolean;
}

interface ReviewDecisionFlags {
  json?: boolean;
  notes: string;
  // Evidence flags
  sourceType?: string;
  sourceRef?: string;
  evidenceLevel?: string;
}

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

function formatQueue(response: ReviewQueueResponse): string {
  if (response.items.length === 0) {
    return 'Review queue is empty';
  }

  return response.items
    .map(({ entry, lastDecision }) =>
      [
        `${entry.id} [${entry.lifecycleState}]`,
        `Shortcut: ${entry.shortcut}`,
        `Required level: ${entry.requiredLevel}`,
        `Owner: ${entry.owner.handle}`,
        `Agent review: ${entry.agentReview?.status ?? 'none'}`,
        `Last decision: ${
          lastDecision ? `${lastDecision.decision} (${lastDecision.notes})` : 'none'
        }`,
      ].join('\n'),
    )
    .join('\n\n');
}

export function registerReviewCommands(program: Command, options: ReviewCommandOptions): void {
  if (!options.allowReview) {
    return;
  }

  program
    .command('review:queue')
    .description('Inspect the review queue for the active team')
    .option('--status <state>', 'Filter by lifecycle state')
    .option('--json', 'Output JSON')
    .action(async (flags: { json?: boolean; status?: string }) => {
      const state = await loadCliState();
      requireSessionToken(state);
      const path = flags.status
        ? `/v1/knowledge/review-queue?status=${encodeURIComponent(flags.status)}`
        : '/v1/knowledge/review-queue';
      const response = await apiRequest<ReviewQueueResponse>(state, {
        path,
      });
      const parsed = reviewQueueResponseSchema.parse(response.data);

      printResult(parsed, flags, (value) => formatQueue(value));
    });

  for (const decision of ['approve', 'reject'] as const) {
    const decisionLabel = `${decision.slice(0, 1).toUpperCase()}${decision.slice(1)}`;

    program
      .command(`review:${decision}`)
      .description(`${decisionLabel} a queued knowledge entry`)
      .argument('<entryId>', 'Knowledge entry identifier')
      .requiredOption('--notes <text>', 'Reviewer notes')
      .option(
        '--source-type <type>',
        'Evidence source type (internal-experience|incident|doc|code|external-reference)',
      )
      .option('--source-ref <ref>', 'Source reference (URL, doc ID, incident ID, etc.)')
      .option(
        '--evidence-level <level>',
        'Evidence level (anecdotal|reproduced|documented|verified-in-prod)',
      )
      .option('--json', 'Output JSON')
      .action(async (entryId: string, flags: ReviewDecisionFlags) => {
        const state = await loadCliState();
        requireSessionToken(state);

        // Build evidence object if flags provided
        interface EvidencePayload {
          sourceType: string;
          evidenceLevel: string;
          sourceRef?: string;
        }
        let evidence: EvidencePayload | undefined;

        if (flags.sourceType !== undefined || flags.evidenceLevel !== undefined) {
          // Validate source type using zod safeParse
          if (flags.sourceType !== undefined) {
            const result = evidenceSourceTypeSchema.safeParse(flags.sourceType);
            if (!result.success) {
              throw new Error(
                `Invalid source type: ${flags.sourceType}. Must be one of: internal-experience, incident, doc, code, external-reference`,
              );
            }
          }

          // Validate evidence level using zod safeParse
          if (flags.evidenceLevel !== undefined) {
            const result = evidenceLevelSchema.safeParse(flags.evidenceLevel);
            if (!result.success) {
              throw new Error(
                `Invalid evidence level: ${flags.evidenceLevel}. Must be one of: anecdotal, reproduced, documented, verified-in-prod`,
              );
            }
          }

          evidence = {
            sourceType: flags.sourceType ?? 'internal-experience',
            evidenceLevel: flags.evidenceLevel ?? 'anecdotal',
          };

          if (flags.sourceRef !== undefined) {
            evidence.sourceRef = flags.sourceRef;
          }
        }

        const response = await apiRequest<KnowledgeEntryResponse>(state, {
          method: 'POST',
          path: '/v1/knowledge/review',
          body: {
            entryId,
            decision,
            notes: flags.notes,
            ...(evidence !== undefined ? { evidence } : {}),
          },
        });
        const parsed = knowledgeEntryResponseSchema.parse(response.data);

        printResult(parsed, flags, ({ entry }) => {
          const lines = [`${decision}d ${entry.id}`, `Lifecycle: ${entry.lifecycleState}`];

          // Show evidence metadata with colors
          if (entry.evidenceMeta !== null && entry.evidenceMeta !== undefined) {
            const level = entry.evidenceMeta.evidenceLevel;
            const colorCode = EVIDENCE_COLORS[level] ?? '0';
            lines.push(
              `Evidence: ${withColor(level, colorCode)} (${entry.evidenceMeta.sourceType})`,
            );
            if (entry.evidenceMeta.sourceRef !== undefined) {
              lines.push(`Source: ${entry.evidenceMeta.sourceRef}`);
            }
          } else {
            lines.push('Evidence: (none)');
          }

          return lines.join('\n');
        });
      });
  }
}
