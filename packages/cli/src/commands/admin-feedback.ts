import type {
  FeedbackListResponse,
  FeedbackBatchResponse,
} from '@trapmap/contracts';
import {
  feedbackListResponseSchema,
  feedbackBatchResponseSchema,
} from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '../lib/config.js';
import { apiRequest, requireSessionToken } from '../lib/http.js';
import { printResult } from '../lib/output.js';

export interface AdminFeedbackCommandOptions {
  allowManage: boolean;
}

/**
 * Formats a feedback list response for human-readable output.
 */
function formatFeedbackList(data: FeedbackListResponse): string {
  if (data.items.length === 0) {
    return 'No feedback found';
  }

  const lines: string[] = [];
  lines.push(`Found ${data.total} feedback items\n`);

  for (const item of data.items) {
    const age = `${Math.round(item.ageDays)}d`;
    const status = `[${item.status}]`;
    const type = item.problemType;
    const entry = item.entryShortcut.slice(0, 40);
    const desc = item.description.slice(0, 60);
    lines.push(
      `${item.id}  ${status.padEnd(12)}  ${age.padEnd(5)}  ${type.padEnd(15)}  ${entry}  "${desc}..."`,
    );
  }

  if (data.qualityScore) {
    lines.push(`\nQuality Score: ${Math.round(data.qualityScore.score)}/100`);
    lines.push(`  Incorrect: ${data.qualityScore.breakdown.incorrect}`);
    lines.push(`  Outdated: ${data.qualityScore.breakdown.outdated}`);
    lines.push(`  Context Mismatch: ${data.qualityScore.breakdown.contextMismatch}`);
    lines.push(`  Total Feedback: ${data.qualityScore.totalFeedback}`);
  }

  return lines.join('\n');
}

/**
 * Formats a feedback batch response for human-readable output.
 */
function formatFeedbackBatch(data: FeedbackBatchResponse): string {
  const lines: string[] = [];
  const mode = data.dryRun ? 'DRY RUN - ' : '';
  lines.push(`${mode}Action: ${data.action}`);
  lines.push(`Eligible: ${data.totalEligible}, Ineligible: ${data.totalIneligible}`);
  if (data.appliedAt) {
    lines.push(`Applied at: ${data.appliedAt}`);
  }
  lines.push('');

  for (const item of data.items) {
    const status = item.eligible ? '✓' : '✗';
    const reason = item.ineligibilityReason
      ? ` (${item.ineligibilityReason})`
      : '';
    lines.push(
      `${status} ${item.feedbackId}: ${item.changeDescription}${reason}`,
    );
  }

  return lines.join('\n');
}

export function registerAdminFeedbackCommands(
  program: Command,
  options: AdminFeedbackCommandOptions,
): void {
  if (!options.allowManage) return;

  // feedback-list command: List feedback queue with filters
  program
    .command('feedback-list')
    .description('List feedback queue for admin review')
    .option(
      '--status <status>',
      'Filter by status (comma-separated: new,triaged,resolved,dismissed)',
    )
    .option(
      '--type <type>',
      'Filter by problem type (comma-separated: incorrect,outdated,context-mismatch,incomplete,other)',
    )
    .option('--entry <entryId>', 'Filter by entry ID')
    .option('--age-min <days>', 'Minimum age in days', parseInt)
    .option('--age-max <days>', 'Maximum age in days', parseInt)
    .option('--limit <n>', 'Maximum results', '25')
    .option('--json', 'Output JSON')
    .action(
      async (flags: {
        status?: string;
        type?: string;
        entry?: string;
        ageMin?: number;
        ageMax?: number;
        limit: string;
        json?: boolean;
      }) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const queryParams = new URLSearchParams();

        if (flags.status) {
          flags.status.split(',').forEach((s: string) => {
            queryParams.append('status', s.trim());
          });
        }
        if (flags.type) {
          flags.type.split(',').forEach((t: string) => {
            queryParams.append('problemType', t.trim());
          });
        }
        if (flags.entry) {
          queryParams.set('entryId', flags.entry);
        }
        if (flags.ageMin !== undefined) {
          queryParams.set('ageMinDays', String(flags.ageMin));
        }
        if (flags.ageMax !== undefined) {
          queryParams.set('ageMaxDays', String(flags.ageMax));
        }
        queryParams.set('limit', flags.limit);

        const path = `/v1/admin/feedback?${queryParams}`;
        const response = await apiRequest<FeedbackListResponse>(state, {
          path,
        });
        const parsed = feedbackListResponseSchema.parse(response.data);

        printResult(parsed, flags, formatFeedbackList);
      },
    );

  // feedback-batch command: Process feedback in bulk
  program
    .command('feedback-batch')
    .description('Process feedback items in bulk')
    .requiredOption(
      '--action <action>',
      'Action: resolve, dismiss, triage, request-info, transition',
    )
    .requiredOption(
      '--feedback-ids <ids>',
      'Comma-separated feedback IDs',
    )
    .option('--notes <notes>', 'Notes to add to all processed items')
    .option(
      '--target-state <state>',
      'Target decay state (for transition action): active, review-due, stale, expired',
    )
    .option('--dry-run', 'Show what would change without applying')
    .option('--json', 'Output JSON')
    .action(
      async (flags: {
        action: string;
        feedbackIds: string;
        notes?: string;
        targetState?: string;
        dryRun?: boolean;
        json?: boolean;
      }) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const ids = flags.feedbackIds.split(',').map((id: string) => id.trim());
        const body: Record<string, unknown> = {
          action: flags.action,
          feedbackIds: ids,
          dryRun: !!flags.dryRun,
        };

        if (flags.notes) {
          body.notes = flags.notes;
        }
        if (flags.targetState) {
          body.targetDecayState = flags.targetState;
        }

        const response = await apiRequest<FeedbackBatchResponse>(state, {
          method: 'POST',
          path: '/v1/admin/feedback/batch',
          body,
        });
        const parsed = feedbackBatchResponseSchema.parse(response.data);

        printResult(parsed, flags, formatFeedbackBatch);
      },
    );
}
