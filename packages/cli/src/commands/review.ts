import type { KnowledgeEntryResponse, ReviewQueueResponse } from '@skill-shareer/contracts';
import { knowledgeEntryResponseSchema, reviewQueueResponseSchema } from '@skill-shareer/contracts';
import type { Command } from 'commander';

import { loadCliState } from '../lib/config.js';
import { apiRequest, requireSessionToken } from '../lib/http.js';
import { printResult } from '../lib/output.js';

interface ReviewCommandOptions {
  allowReview: boolean;
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
      .option('--json', 'Output JSON')
      .action(async (entryId: string, flags: { json?: boolean; notes: string }) => {
        const state = await loadCliState();
        requireSessionToken(state);
        const response = await apiRequest<KnowledgeEntryResponse>(state, {
          method: 'POST',
          path: '/v1/knowledge/review',
          body: {
            entryId,
            decision,
            notes: flags.notes,
          },
        });
        const parsed = knowledgeEntryResponseSchema.parse(response.data);

        printResult(parsed, flags, ({ entry }) =>
          [`${decision}d ${entry.id}`, `Lifecycle: ${entry.lifecycleState}`].join('\n'),
        );
      });
  }
}
