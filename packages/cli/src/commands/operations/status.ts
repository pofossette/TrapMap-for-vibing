import type { CompatibilityStatusResponse } from '@trapmap/contracts';
import { compatibilityStatusResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { printResult } from '@trapmap/cli/lib/output.js';
import type { OperationsCommandOptions } from './types.js';

export function registerStatusCommand(program: Command, options: OperationsCommandOptions): void {
  if (!options.allowExport) return;

  // Compatibility status command (Phase 16-01: COMP-03)
  program
    .command('status')
    .description('Show migration and compatibility status')
    .option('--team <teamId>', 'Filter status by team ID')
    .option('--json', 'Output JSON')
    .action(async (flags: { team?: string; json?: boolean }) => {
      const state = await loadCliState();
      requireSessionToken(state);

      const queryParams = new URLSearchParams();
      if (flags.team) {
        queryParams.set('teamId', flags.team);
      }

      const path =
        queryParams.size > 0 ? `/v1/operations/status?${queryParams}` : '/v1/operations/status';

      const response = await apiRequest<CompatibilityStatusResponse>(state, { path });
      const parsed = compatibilityStatusResponseSchema.parse(response.data);

      printResult(parsed, flags, (value) =>
        [
          `Legacy entries: ${value.totalLegacyEntries}`,
          `Migrated: ${value.migratedEntriesCount}`,
          `Unmigrated: ${value.unmigratedEntriesCount}`,
          `Total artifacts: ${value.totalArtifacts}`,
          `  - skill-directory: ${value.artifactsBySourceKind['skill-directory']}`,
          `  - single-skill-md: ${value.artifactsBySourceKind['single-skill-md']}`,
          `  - legacy-knowledge: ${value.artifactsBySourceKind['legacy-knowledge']}`,
          `Coexistence active: ${value.coexistenceActive}`,
          `Sunset ready: ${value.sunsetReady}`,
          ...(value.sunsetBlockers.length > 0
            ? ['Blockers:', ...value.sunsetBlockers.map((b) => `  - ${b}`)]
            : []),
        ].join('\n'),
      );
    });
}
