import type { BatchOperationResponse, DecayEntryListResponse } from '@trapmap/contracts';
import { batchOperationResponseSchema, decayEntryListResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { printCommandResult } from '@trapmap/cli/lib/output.js';

export interface DecayCommandOptions {
  allowManage: boolean;
}

/**
 * Formats a decay entry list response for human-readable output.
 */
export function formatDecayList(data: DecayEntryListResponse): string {
  if (data.items.length === 0) {
    return 'No entries found';
  }

  const lines: string[] = [];
  lines.push(`Found ${data.total} entries`);

  for (const item of data.items) {
    const state =
      item.decayState === null
        ? 'unknown'
        : item.decayState === undefined
          ? 'undefined'
          : item.decayState;
    const age = item.ageDays !== null ? `${Math.round(item.ageDays)}d` : 'n/a';
    const labels = item.labels.length > 0 ? ` [${item.labels.join(', ')}]` : '';
    lines.push(`${item.id}  [${state}]  ${age}  ${item.shortcut.slice(0, 50)}${labels}`);
  }

  return lines.join('\n');
}

/**
 * Formats a batch operation response for human-readable output.
 */
export function formatBatchResult(data: BatchOperationResponse): string {
  const lines: string[] = [];
  const mode = data.dryRun ? 'DRY RUN - ' : '';
  lines.push(`${mode}Action: ${data.action}`);
  lines.push(`Eligible: ${data.totalEligible}, Ineligible: ${data.totalIneligible}`);
  if (data.appliedAt != null) {
    lines.push(`Applied at: ${data.appliedAt}`);
  }
  lines.push('');

  for (const item of data.items) {
    const status = item.eligible ? '✓' : '✗';
    const reason = item.ineligibilityReason != null ? ` (${item.ineligibilityReason})` : '';
    lines.push(`${status} ${item.entryId}: ${item.changeDescription}${reason}`);
  }

  return lines.join('\n');
}

export function registerDecayCommands(program: Command, options: DecayCommandOptions): void {
  if (!options.allowManage) return;

  // decay-stale command: List entries filtered by decay state
  program
    .command('decay-stale')
    .description('List knowledge entries by decay state')
    .option(
      '--state <states>',
      'Filter by decay state (comma-separated: active,review-due,stale,expired,superseded)',
    )
    .option('--age-min <days>', 'Minimum age in days', Number.parseInt)
    .option('--age-max <days>', 'Maximum age in days', Number.parseInt)
    .option('--label <labels>', 'Filter by labels (comma-separated)')
    .option('--scope <scope>', 'Filter by scope (global or project)')
    .option('--limit <n>', 'Maximum entries to return', '25')
    .option('--json', 'Output JSON')
    .action(
      async (flags: {
        state?: string;
        ageMin?: number;
        ageMax?: number;
        label?: string;
        scope?: string;
        limit: string;
        json?: boolean;
      }) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const queryParams = new URLSearchParams();

        if (flags.state) {
          for (const s of flags.state.split(',')) {
            queryParams.append('decayStates', s.trim());
          }
        }
        if (flags.ageMin !== undefined) {
          queryParams.set('ageMinDays', String(flags.ageMin));
        }
        if (flags.ageMax !== undefined) {
          queryParams.set('ageMaxDays', String(flags.ageMax));
        }
        if (flags.label) {
          for (const l of flags.label.split(',')) {
            queryParams.append('labels', l.trim());
          }
        }
        if (flags.scope) {
          queryParams.set('scope', flags.scope);
        }
        queryParams.set('limit', flags.limit);

        const path = `/v1/operations/decay/entries?${queryParams}`;
        const response = await apiRequest<DecayEntryListResponse>(state, { path });
        const parsed = decayEntryListResponseSchema.parse(response.data);

        printCommandResult(
          {
            action: 'decay-stale',
            success: true,
            summary: `Found ${parsed.total} entries.`,
            artifacts: parsed.items.map((item) => ({
              id: item.id,
              decayState: item.decayState,
            })),
            nextSteps: [],
          },
          parsed,
          state,
          flags,
          formatDecayList,
        );
      },
    );

  // decay-batch command: Apply batch operations
  program
    .command('decay-batch')
    .description('Apply batch operations to decayed entries')
    .requiredOption('--action <action>', 'Action: extend, mark-review, deactivate, supersede')
    .requiredOption('--entries <ids>', 'Comma-separated entry IDs')
    .option('--extend-days <n>', 'Days to extend lifecycle (for extend action)', Number.parseInt)
    .option('--replacement <id>', 'Replacement entry ID (for supersede action)')
    .option('--dry-run', 'Show what would change without applying')
    .option('--json', 'Output JSON')
    .action(
      async (flags: {
        action: string;
        entries: string;
        extendDays?: number;
        replacement?: string;
        dryRun?: boolean;
        json?: boolean;
      }) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const entryIds = flags.entries.split(',').map((id: string) => id.trim());
        const body: Record<string, unknown> = {
          action: flags.action,
          entryIds,
          dryRun: !!flags.dryRun,
        };

        if (flags.extendDays !== undefined) {
          body.extendDays = flags.extendDays;
        }
        if (flags.replacement) {
          body.replacementId = flags.replacement;
        }

        const response = await apiRequest<BatchOperationResponse>(state, {
          method: 'POST',
          path: '/v1/operations/decay/batch',
          body,
        });
        const parsed = batchOperationResponseSchema.parse(response.data);

        printCommandResult(
          {
            action: 'decay-batch',
            success: true,
            summary: `${parsed.dryRun ? 'DRY RUN: ' : ''}Action ${parsed.action} — ${parsed.totalEligible} eligible, ${parsed.totalIneligible} ineligible.`,
            artifacts: parsed.items.map((item) => ({
              id: item.entryId,
              eligible: item.eligible,
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

  // decay-search command: Search entries with decay state facet
  program
    .command('decay-search')
    .description('Search entries matching patterns with lifecycle state facet')
    .argument('[pattern]', 'Search pattern')
    .option('--state <states>', 'Filter by decay state (comma-separated)')
    .option('--label <labels>', 'Filter by labels (comma-separated)')
    .option('--scope <scope>', 'Filter by scope')
    .option('--limit <n>', 'Maximum results', '25')
    .option('--json', 'Output JSON')
    .action(
      async (
        pattern: string | undefined,
        flags: {
          state?: string;
          label?: string;
          scope?: string;
          limit: string;
          json?: boolean;
        },
      ) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const body: Record<string, unknown> = {
          pattern: pattern ?? '',
          limit: Number.parseInt(flags.limit, 10),
        };

        if (flags.state) {
          body.decayStates = flags.state.split(',').map((s: string) => s.trim());
        }
        if (flags.label) {
          body.labels = flags.label.split(',').map((l: string) => l.trim());
        }
        if (flags.scope) {
          body.scope = flags.scope;
        }

        const response = await apiRequest<DecayEntryListResponse>(state, {
          method: 'POST',
          path: '/v1/operations/decay/search',
          body,
        });
        const parsed = decayEntryListResponseSchema.parse(response.data);

        printCommandResult(
          {
            action: 'decay-search',
            success: true,
            summary: `Found ${parsed.total} entries.`,
            artifacts: parsed.items.map((item) => ({
              id: item.id,
              decayState: item.decayState,
            })),
            nextSteps: [],
          },
          parsed,
          state,
          flags,
          formatDecayList,
        );
      },
    );
}
