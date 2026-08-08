import type { FeedbackBatchResponse, FeedbackListResponse } from '@trapmap/contracts';
import { feedbackBatchResponseSchema, feedbackListResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { printCommandResult } from '@trapmap/cli/lib/output.js';
import { formatBatchResultHeader } from '@trapmap/cli/lib/batch-result.js';

export interface FeedbackAdminCommandOptions {
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
  lines.push(`Found ${data.total} feedback items`);

  for (const item of data.items) {
    const age = `${Math.round(item.ageDays)}d`;
    const status = item.status;
    lines.push(
      `${item.id}  [${status}]  ${age}  ${item.entryShortcut.slice(0, 40)}  ${item.problemType}`,
    );
  }

  return lines.join('\n');
}

/**
 * Formats a batch operation response for human-readable output.
 */
function formatBatchResult(data: FeedbackBatchResponse): string {
  const lines = formatBatchResultHeader(data);

  for (const item of data.items) {
    const status = item.eligible ? '✓' : '✗';
    const reason = item.reason != null ? ` (${item.reason})` : '';
    const transition = item.transitionApplied ? ' [transitioned]' : '';
    lines.push(`${status} ${item.feedbackId}${transition}${reason}`);
  }

  return lines.join('\n');
}

export function registerFeedbackAdminCommands(
  program: Command,
  options: FeedbackAdminCommandOptions,
): void {
  if (!options.allowManage) return;

  // feedback-list command: List feedback queue with filters
  program
    .command('feedback-list')
    .description('List feedback queue items with optional filters')
    .option(
      '--status <statuses>',
      'Filter by status (comma-separated: new,triaged,resolved,dismissed)',
    )
    .option(
      '--type <types>',
      'Filter by problem type (comma-separated: incorrect,outdated,context-mismatch,incomplete,other)',
    )
    .option('--entry <id>', 'Filter by entry ID')
    .option('--entry-type <type>', 'Filter by entry type (trap or skill)')
    .option('--min-age <days>', 'Minimum age in days', Number.parseInt)
    .option('--max-age <days>', 'Maximum age in days', Number.parseInt)
    .option('--limit <n>', 'Maximum items to return', '25')
    .option('--json', 'Output JSON')
    .action(
      async (flags: {
        status?: string;
        type?: string;
        entry?: string;
        entryType?: string;
        minAge?: number;
        maxAge?: number;
        limit: string;
        json?: boolean;
      }) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const queryParams = new URLSearchParams();

        if (flags.status) {
          for (const s of flags.status.split(',')) {
            queryParams.append('status', s.trim());
          }
        }
        if (flags.type) {
          for (const t of flags.type.split(',')) {
            queryParams.append('problemType', t.trim());
          }
        }
        if (flags.entry) {
          queryParams.set('entryId', flags.entry);
        }
        if (flags.entryType) {
          queryParams.set('entryType', flags.entryType);
        }
        if (flags.minAge !== undefined) {
          queryParams.set('minAgeDays', String(flags.minAge));
        }
        if (flags.maxAge !== undefined) {
          queryParams.set('maxAgeDays', String(flags.maxAge));
        }
        queryParams.set('limit', flags.limit);

        const path = `/v1/operations/feedback?${queryParams}`;
        const response = await apiRequest<FeedbackListResponse>(state, { path });
        const parsed = feedbackListResponseSchema.parse(response.data);

        printCommandResult(
          {
            action: 'feedback-list',
            success: true,
            summary:
              parsed.items.length > 0
                ? `${parsed.items.length} feedback item(s) found`
                : 'No feedback found',
            artifacts: parsed.items.map((item) => ({
              id: item.id,
              title: item.entryShortcut,
              newState: item.status,
            })),
            nextSteps: [],
          },
          parsed,
          state,
          flags,
          formatFeedbackList,
        );
      },
    );

  // feedback-batch command: Apply batch operations
  program
    .command('feedback-batch')
    .description('Apply batch operations to feedback items')
    .requiredOption('--action <action>', 'Action: resolve, dismiss, triage, transition')
    .requiredOption('--ids <ids>', 'Comma-separated feedback IDs')
    .option('--notes <text>', 'Admin notes for the action')
    .option('--transition-target <state>', 'Target decay state (for transition action)')
    .option('--dry-run', 'Show what would change without applying')
    .option('--json', 'Output JSON')
    .action(
      async (flags: {
        action: string;
        ids: string;
        notes?: string;
        transitionTarget?: string;
        dryRun?: boolean;
        json?: boolean;
      }) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const feedbackIds = flags.ids.split(',').map((id: string) => id.trim());
        const body: Record<string, unknown> = {
          action: flags.action,
          feedbackIds,
          dryRun: !!flags.dryRun,
        };

        if (flags.notes) {
          body.notes = flags.notes;
        }
        if (flags.transitionTarget) {
          body.transitionTarget = flags.transitionTarget;
        }

        const response = await apiRequest<FeedbackBatchResponse>(state, {
          method: 'POST',
          path: '/v1/operations/feedback/batch',
          body,
        });
        const parsed = feedbackBatchResponseSchema.parse(response.data);

        printCommandResult(
          {
            action: 'feedback-batch',
            success: true,
            summary: `${parsed.action}: ${parsed.totalEligible} eligible, ${parsed.totalIneligible} ineligible`,
            artifacts: parsed.items.map((item) => ({
              id: item.feedbackId,
              eligible: item.eligible,
              reason: item.reason,
            })),
            nextSteps: [],
          },
          parsed,
          state,
          flags,
          formatBatchResult,
        );
      },
    );
}
