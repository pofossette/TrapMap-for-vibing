import type { KnowledgeListResponse } from '@trapmap/contracts';
import { knowledgeListResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

import { formatListResponse } from '@trapmap/cli/lib/artifact-bundle.js';
import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { printResult } from '@trapmap/cli/lib/output.js';
import type { OperationsCommandOptions } from './types.js';

export function registerListCommand(program: Command, options: OperationsCommandOptions): void {
  if (!options.allowList) return;

  program
    .command('list')
    .description('List knowledge entries with optional filters')
    .option('--scope <scope>', 'Filter by scope: global or project')
    .option('--state <state>', 'Filter by lifecycle state (comma-separated)')
    .option('--max-level <n>', 'Filter entries at or below this security level')
    .option('--owner <userId>', 'Filter by owner user ID')
    .option('--json', 'Output JSON')
    .action(
      async (flags: {
        json?: boolean;
        maxLevel?: string;
        owner?: string;
        scope?: string;
        state?: string;
      }) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const queryParams = new URLSearchParams();

        if (flags.scope !== undefined) {
          queryParams.set('scope', flags.scope);
        }

        if (flags.state !== undefined) {
          queryParams.set('lifecycleState', flags.state);
        }

        if (flags.maxLevel !== undefined) {
          queryParams.set('requiredLevelMax', flags.maxLevel);
        }

        if (flags.owner !== undefined) {
          queryParams.set('ownerUserId', flags.owner);
        }

        const path =
          queryParams.size > 0
            ? `/v1/operations/knowledge?${queryParams}`
            : '/v1/operations/knowledge';
        const response = await apiRequest<KnowledgeListResponse>(state, { path });
        const parsed = knowledgeListResponseSchema.parse(response.data);

        printResult(parsed, flags, (value) => formatListResponse(value));
      },
    );
}
