import type {
  MaintenanceBatchOperationResponse,
  MaintenanceEntryListResponse,
} from '@trapmap/contracts';
import {
  maintenanceBatchOperationResponseSchema,
  maintenanceEntryListResponseSchema,
} from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { printCommandResult } from '@trapmap/cli/lib/output.js';

export interface MaintenanceCommandOptions {
  allowManage: boolean;
}

/**
 * Formats a maintenance entry list response for human-readable output.
 */
function formatMaintenanceList(data: MaintenanceEntryListResponse): string {
  if (data.items.length === 0) {
    return 'No entries found';
  }

  const lines: string[] = [];
  lines.push(`Found ${data.total} entries`);

  for (const item of data.items) {
    const maintainer = item.maintainer?.handle ?? 'unassigned';
    const reviewBy = item.reviewBy ?? 'none';
    lines.push(`${item.id}  [${maintainer}]  [${reviewBy}]  ${item.shortcut.slice(0, 50)}`);
  }

  return lines.join('\n');
}

/**
 * Formats a maintenance batch operation response for human-readable output.
 */
function formatMaintenanceBatch(data: MaintenanceBatchOperationResponse): string {
  const lines: string[] = [];
  const mode = data.dryRun ? 'DRY RUN - ' : '';
  lines.push(`${mode}Action: ${data.action}`);
  lines.push(`Eligible: ${data.totalEligible}, Ineligible: ${data.totalIneligible}`);
  if (data.appliedAt != null) {
    lines.push(`Applied at: ${data.appliedAt}`);
  }
  lines.push('');

  for (const item of data.items) {
    const status = item.eligible ? '\u2713' : '\u2717';
    const reason = item.ineligibilityReason != null ? ` (${item.ineligibilityReason})` : '';
    lines.push(`${status} ${item.entryId}: ${item.proposedChange}${reason}`);
  }

  return lines.join('\n');
}

export function registerMaintenanceCommands(
  program: Command,
  options: MaintenanceCommandOptions,
): void {
  if (!options.allowManage) return;

  // maintenance-list command: List entries needing maintenance attention
  program
    .command('maintenance-list')
    .description('List entries needing maintenance attention')
    .option('--missing-owner', 'Filter to entries without an assigned maintainer')
    .option('--overdue', 'Filter to entries past their review-by date')
    .option('--stale', 'Filter to entries with stale verification')
    .option('--stale-days <n>', 'Days since last verification to consider stale', Number.parseInt)
    .option('--scope <scope>', 'Filter by scope (global or project)')
    .option('--label <labels>', 'Filter by labels (comma-separated)')
    .option('--limit <n>', 'Maximum entries to return', '25')
    .option('--json', 'Output JSON')
    .action(
      async (flags: {
        missingOwner?: boolean;
        overdue?: boolean;
        stale?: boolean;
        staleDays?: number;
        scope?: string;
        label?: string;
        limit: string;
        json?: boolean;
      }) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const queryParams = new URLSearchParams();

        if (flags.missingOwner) {
          queryParams.set('missingOwner', 'true');
        }
        if (flags.overdue) {
          queryParams.set('reviewOverdue', 'true');
        }
        if (flags.stale) {
          queryParams.set('staleVerification', 'true');
        }
        if (flags.staleDays !== undefined) {
          queryParams.set('staleDays', String(flags.staleDays));
        }
        if (flags.scope) {
          queryParams.set('scope', flags.scope);
        }
        if (flags.label) {
          for (const l of flags.label.split(',')) {
            queryParams.append('labels', l.trim());
          }
        }
        queryParams.set('limit', flags.limit);

        const path = `/v1/operations/maintenance/entries?${queryParams}`;
        const response = await apiRequest<MaintenanceEntryListResponse>(state, { path });
        const parsed = maintenanceEntryListResponseSchema.parse(response.data);

        printCommandResult(
          {
            action: 'maintenance-list',
            success: true,
            summary:
              parsed.items.length > 0
                ? `${parsed.items.length} entry/entries need attention`
                : 'No entries found',
            artifacts: parsed.items.map((item) => ({
              id: item.id,
              title: item.shortcut,
              newState: item.decayState ?? undefined,
            })),
            nextSteps: [],
          },
          parsed,
          state,
          flags,
          formatMaintenanceList,
        );
      },
    );

  // maintenance-assign command: Assign maintainer to entries
  program
    .command('maintenance-assign')
    .description('Assign maintainer to entries')
    .requiredOption('--entries <ids>', 'Comma-separated entry IDs')
    .requiredOption('--owner <userId>', 'User ID of the new maintainer')
    .option('--owner-handle <handle>', 'Handle of the new maintainer')
    .option('--dry-run', 'Show what would change without applying')
    .option('--json', 'Output JSON')
    .action(
      async (flags: {
        entries: string;
        owner: string;
        ownerHandle?: string;
        dryRun?: boolean;
        json?: boolean;
      }) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const entryIds = flags.entries.split(',').map((id: string) => id.trim());
        const body: Record<string, unknown> = {
          action: 'assign-owner',
          entryIds,
          dryRun: !!flags.dryRun,
          newMaintainerId: flags.owner,
        };

        if (flags.ownerHandle) {
          body.newMaintainerHandle = flags.ownerHandle;
        }

        const response = await apiRequest<MaintenanceBatchOperationResponse>(state, {
          method: 'POST',
          path: '/v1/operations/maintenance/batch',
          body,
        });
        const parsed = maintenanceBatchOperationResponseSchema.parse(response.data);

        printCommandResult(
          {
            action: 'maintenance-assign',
            success: true,
            summary: `${parsed.action}: ${parsed.totalEligible} eligible, ${parsed.totalIneligible} ineligible`,
            artifacts: parsed.items.map((item) => ({
              id: item.entryId,
              title: item.shortcut,
              eligible: item.eligible,
            })),
            nextSteps: [],
          },
          parsed,
          state,
          flags,
          formatMaintenanceBatch,
        );
      },
    );

  // maintenance-verify command: Mark entries as re-verified
  program
    .command('maintenance-verify')
    .description('Mark entries as re-verified')
    .requiredOption('--entries <ids>', 'Comma-separated entry IDs')
    .option('--extend-days <n>', 'Days to extend review-by deadline', Number.parseInt, 90)
    .option('--dry-run', 'Show what would change without applying')
    .option('--json', 'Output JSON')
    .action(
      async (flags: {
        entries: string;
        extendDays: number;
        dryRun?: boolean;
        json?: boolean;
      }) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const entryIds = flags.entries.split(',').map((id: string) => id.trim());
        const body: Record<string, unknown> = {
          action: 'mark-verified',
          entryIds,
          dryRun: !!flags.dryRun,
          extendDays: flags.extendDays,
        };

        const response = await apiRequest<MaintenanceBatchOperationResponse>(state, {
          method: 'POST',
          path: '/v1/operations/maintenance/batch',
          body,
        });
        const parsed = maintenanceBatchOperationResponseSchema.parse(response.data);

        printCommandResult(
          {
            action: 'maintenance-verify',
            success: true,
            summary: `${parsed.action}: ${parsed.totalEligible} eligible, ${parsed.totalIneligible} ineligible`,
            artifacts: parsed.items.map((item) => ({
              id: item.entryId,
              title: item.shortcut,
              eligible: item.eligible,
            })),
            nextSteps: [],
          },
          parsed,
          state,
          flags,
          formatMaintenanceBatch,
        );
      },
    );
}
