import type { LegacyMigrationResponse } from '@trapmap/contracts';
import { legacyMigrationResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '../../lib/config.js';
import { apiRequest, requireSessionToken } from '../../lib/http.js';
import { printResult } from '../../lib/output.js';
import type { OperationsCommandOptions } from './types.js';

export function registerMigrateCommand(program: Command, options: OperationsCommandOptions): void {
  if (!options.allowImport) return;

  // Migration command (Phase 16-01: ARTF-04, COMP-03)
  program
    .command('migrate')
    .description('Migrate legacy knowledge entries to minimal skill artifacts')
    .option('--entries <ids>', 'Comma-separated entry IDs to migrate (explicit mode)')
    .option('--all-approved', 'Migrate all approved entries (bounded by --limit)')
    .option('--all-team <teamId>', 'Migrate all entries for a specific team')
    .option('--limit <n>', 'Maximum entries to migrate (default 50)', (val) => Number(val))
    .option('--json', 'Output JSON')
    .action(
      async (flags: {
        entries?: string;
        allApproved?: boolean;
        allTeam?: string;
        limit?: number;
        json?: boolean;
      }) => {
        const state = await loadCliState();
        requireSessionToken(state);

        // Determine migration mode
        let mode: 'explicit' | 'all-approved' | 'all-team';
        let entryIds: string[] | undefined;
        let teamId: string | undefined;

        if (flags.entries) {
          mode = 'explicit';
          entryIds = flags.entries.split(',').map((id) => id.trim());
        } else if (flags.allApproved) {
          mode = 'all-approved';
        } else if (flags.allTeam) {
          mode = 'all-team';
          teamId = flags.allTeam;
        } else {
          throw new Error('Must specify --entries, --all-approved, or --all-team');
        }

        const body: {
          mode: typeof mode;
          entryIds?: string[];
          teamId?: string;
          limit?: number;
        } = { mode };

        if (entryIds) {
          body.entryIds = entryIds;
        }
        if (teamId) {
          body.teamId = teamId;
        }
        if (flags.limit) {
          body.limit = flags.limit;
        }

        const response = await apiRequest<LegacyMigrationResponse>(state, {
          method: 'POST',
          path: '/v1/operations/migrate',
          body,
        });
        const parsed = legacyMigrationResponseSchema.parse(response.data);

        printResult(parsed, flags, (value) =>
          [
            `Migrated ${value.migratedCount} entries, skipped ${value.skippedCount}, failed ${value.failedCount}`,
            `Remaining legacy entries: ${value.remainingLegacyCount}`,
            ...value.results.map(
              (r) =>
                `  ${r.success ? '✓' : '✗'} ${r.entryId}: ${r.success ? r.artifactId : (r.skipReason ?? r.error ?? 'Unknown error')}`,
            ),
          ].join('\n'),
        );
      },
    );
}
