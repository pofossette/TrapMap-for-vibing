import type { SkillReviewDecisionResponse, SkillReviewQueueResponse } from '@trapmap/contracts';
import {
  skillReviewDecisionResponseSchema,
  skillReviewQueueResponseSchema,
} from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { printCommandResult } from '@trapmap/cli/lib/output.js';

import { formatSkillReviewDecisionResponse, formatSkillReviewQueue } from './formatters.js';

/**
 * Register the skill review subcommands (Phase 20 SKED-03):
 *   review:queue, review:approve, review:reject
 */
export function registerReviewCommands(skill: Command): void {
  skill
    .command('review:queue')
    .description('View pending skill edits for review')
    .option('--json', 'Output JSON')
    .action(async (flags: { json?: boolean }) => {
      const state = await loadCliState();
      requireSessionToken(state);

      const response = await apiRequest<SkillReviewQueueResponse>(state, {
        method: 'GET',
        path: '/v1/operations/artifacts/review-queue',
      });

      const parsed = skillReviewQueueResponseSchema.parse(response.data);

      printCommandResult(
        {
          action: 'review-queue',
          success: true,
          summary:
            parsed.items.length > 0
              ? `${parsed.items.length} item(s) pending review.`
              : 'Review queue is empty.',
          artifacts: parsed.items.map((item) => ({
            id: item.artifact.id,
            title: item.artifact.title,
            newState: item.artifact.lifecycleState,
          })),
          nextSteps: [],
        },
        parsed,
        state,
        flags,
        formatSkillReviewQueue,
      );
    });

  skill
    .command('review:approve')
    .description('Approve a pending skill edit')
    .argument('<artifactId>', 'Artifact ID to approve')
    .requiredOption('--notes <text>', 'Review notes (required)')
    .option('--json', 'Output JSON')
    .action(
      async (
        artifactId: string,
        flags: {
          notes: string;
          json?: boolean;
        },
      ) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const response = await apiRequest<SkillReviewDecisionResponse>(state, {
          method: 'POST',
          path: `/v1/operations/artifacts/${artifactId}/review`,
          body: {
            artifactId,
            decision: 'approve',
            notes: flags.notes,
          },
        });

        const parsed = skillReviewDecisionResponseSchema.parse(response.data);

        printCommandResult(
          {
            action: 'review-approve',
            success: true,
            summary: `Approved ${parsed.artifact.id} (${parsed.artifact.title}).`,
            artifacts: [
              { id: parsed.artifact.id, title: parsed.artifact.title, newState: parsed.newState },
            ],
            previousState: parsed.previousState,
            transition: { from: parsed.previousState, to: parsed.newState },
            nextSteps: [],
          },
          parsed,
          state,
          flags,
          formatSkillReviewDecisionResponse,
        );
      },
    );

  skill
    .command('review:reject')
    .description('Reject a pending skill edit')
    .argument('<artifactId>', 'Artifact ID to reject')
    .requiredOption('--notes <text>', 'Review notes (required)')
    .option('--json', 'Output JSON')
    .action(
      async (
        artifactId: string,
        flags: {
          notes: string;
          json?: boolean;
        },
      ) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const response = await apiRequest<SkillReviewDecisionResponse>(state, {
          method: 'POST',
          path: `/v1/operations/artifacts/${artifactId}/review`,
          body: {
            artifactId,
            decision: 'reject',
            notes: flags.notes,
          },
        });

        const parsed = skillReviewDecisionResponseSchema.parse(response.data);

        printCommandResult(
          {
            action: 'review-reject',
            success: true,
            summary: `Rejected ${parsed.artifact.id} (${parsed.artifact.title}).`,
            artifacts: [
              { id: parsed.artifact.id, title: parsed.artifact.title, newState: parsed.newState },
            ],
            previousState: parsed.previousState,
            transition: { from: parsed.previousState, to: parsed.newState },
            nextSteps: [],
          },
          parsed,
          state,
          flags,
          formatSkillReviewDecisionResponse,
        );
      },
    );
}
