import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { printAdaptiveResult } from '@trapmap/cli/lib/output.js';
import type { SkillLookupResponse } from '@trapmap/contracts';
import { skillLookupResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

import { formatSkillLookupResponse } from './formatters.js';

/**
 * Register the skill search-by-content subcommand (Phase 18).
 */
export function registerSearchCommand(skill: Command): void {
  skill
    .command('search-by-content')
    .description('Search for skills by content text')
    .argument('<text>', 'Search text')
    .option('--max-results <n>', 'Maximum number of matches to return', '10')
    .option('--json', 'Output JSON')
    .action(
      async (
        text: string,
        flags: {
          maxResults: string;
          json?: boolean;
        },
      ) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const body = {
          text,
          maxResults: Number.parseInt(flags.maxResults, 10),
        };

        const response = await apiRequest<SkillLookupResponse>(state, {
          method: 'POST',
          path: '/v1/retrieval/skills/search-by-content',
          body,
        });

        const parsed = skillLookupResponseSchema.parse(response.data);

        printAdaptiveResult('skill-lookup', parsed, state, flags, formatSkillLookupResponse);
      },
    );
}
