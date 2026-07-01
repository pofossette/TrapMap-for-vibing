import type { ApplyResolutionResponse } from '@trapmap/contracts';
import { applyResolutionResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { printCommandResult } from '@trapmap/cli/lib/output.js';
import { sanitizeForDisplay } from '@trapmap/cli/lib/sanitize.js';
import { formatApplyResolutionText } from '@trapmap/cli/lib/skill-utils.js';

/**
 * Register the skill apply subcommand.
 */
export function registerApplyCommand(skill: Command): void {
  skill
    .command('apply')
    .description('Apply a skill candidate to publish or merge')
    .argument('<candidateId>', 'Candidate ID to apply')
    .option('--json', 'Output JSON')
    .action(async (candidateId: string, flags: { json?: boolean }) => {
      const state = await loadCliState();
      requireSessionToken(state);

      const response = await apiRequest<ApplyResolutionResponse>(state, {
        method: 'POST',
        path: `/v1/candidates/${sanitizeForDisplay(candidateId)}/apply-resolution`,
      });

      const parsed = applyResolutionResponseSchema.parse(response.data);

      printCommandResult(
        {
          action: 'skill-apply',
          success: true,
          summary: `Applied resolution for ${parsed.candidateId}: ${parsed.outcome.decision}.`,
          artifacts: [
            {
              id: parsed.candidateId,
              newState: parsed.status,
              ...(parsed.outcome.decision === 'independent'
                ? { publishedAs: parsed.outcome.entityType }
                : { mergedInto: parsed.outcome.mergedIntoEntityId }),
            },
          ],
          nextSteps: [],
        },
        parsed,
        state,
        flags,
        formatApplyResolutionText,
      );
    });
}
