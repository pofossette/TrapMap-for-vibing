import type { SkillHistoryResponse } from '@trapmap/contracts';
import { skillHistoryResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { printCommandResult } from '@trapmap/cli/lib/output.js';

import { formatSkillHistoryResponse } from './formatters.js';

/**
 * Register the skill history subcommand (Phase 19 SKED-04).
 */
export function registerHistoryCommand(skill: Command): void {
  skill
    .command('history')
    .description('View revision history for a skill artifact')
    .argument('<artifactId>', 'Artifact ID to view history for')
    .option('--json', 'Output JSON')
    .action(
      async (
        artifactId: string,
        flags: {
          json?: boolean;
        },
      ) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const response = await apiRequest<SkillHistoryResponse>(state, {
          method: 'GET',
          path: `/v1/operations/artifacts/${artifactId}/history`,
        });

        const parsed = skillHistoryResponseSchema.parse(response.data);

        printCommandResult(
          {
            action: 'skill-history',
            success: true,
            summary: `History for ${parsed.artifactId} (${parsed.currentRevision} revision(s)).`,
            artifacts: [
              {
                id: parsed.artifactId,
                title: parsed.title,
                newState: parsed.lifecycleState,
                revision: parsed.currentRevision,
              },
            ],
            nextSteps: [],
          },
          parsed,
          state,
          flags,
          formatSkillHistoryResponse,
        );
      },
    );
}
