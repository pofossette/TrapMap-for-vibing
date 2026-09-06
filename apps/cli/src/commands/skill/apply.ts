import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { sanitizeForDisplay } from '@trapmap/cli/lib/sanitize.js';
import { formatApplyResolutionText } from '@trapmap/cli/lib/skill-utils.js';
import type { ApplyResolutionResponse } from '@trapmap/contracts';
import { applyResolutionResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';
import { printApplyResolutionResult } from './apply-resolution-result.js';

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

      printApplyResolutionResult(parsed, state, flags, 'skill-apply', formatApplyResolutionText);
    });
}
