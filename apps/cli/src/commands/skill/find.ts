import type { CandidateListResponse } from '@trapmap/contracts';
import { candidateListResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { printCommandResult } from '@trapmap/cli/lib/output.js';
import { formatCandidateTable } from '@trapmap/cli/lib/skill-utils.js';

/**
 * Register the skill find subcommand.
 */
export function registerFindCommand(skill: Command): void {
  skill
    .command('find')
    .description('Find skill candidates, optionally filtering by fingerprint')
    .argument('[fingerprint]', 'Fingerprint to filter by (optional)')
    .option('--json', 'Output JSON')
    .action(async (fingerprint: string | undefined, flags: { json?: boolean }) => {
      const state = await loadCliState();
      requireSessionToken(state);

      const response = await apiRequest<CandidateListResponse>(state, {
        method: 'GET',
        path: '/v1/candidates',
      });

      const parsed = candidateListResponseSchema.parse(response.data);

      let candidates = parsed.items;
      if (fingerprint) {
        candidates = candidates.filter((c) => c.analysisSnapshot?.fingerprint === fingerprint);
      }

      const filtered = { ...parsed, items: candidates };

      printCommandResult(
        {
          action: 'skill-find',
          success: true,
          summary: `${candidates.length} candidate(s) found${fingerprint ? ` matching fingerprint ${fingerprint}` : ''}.`,
          artifacts: candidates.map((c) => ({
            id: c.id,
            title: c.sourceType,
            newState: c.status,
          })),
          nextSteps: [],
        },
        filtered,
        state,
        flags,
        (value) => formatCandidateTable(value.items),
      );
    });
}
