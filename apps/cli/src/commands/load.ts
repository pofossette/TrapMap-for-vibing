import type { GraphPlanSearchResponse } from '@trapmap/contracts';
import { graphPlanSearchResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { collectValues, resolveSearchSeed } from '@trapmap/cli/lib/input.js';
import { formatLoadContext } from '@trapmap/cli/lib/markdown-formatter.js';
import { printAdaptiveResult } from '@trapmap/cli/lib/output.js';

interface LoadCommandOptions {
  allowSearch: boolean;
}

export function registerLoadCommand(program: Command, options: LoadCommandOptions): void {
  if (!options.allowSearch) return;

  program
    .command('load')
    .description('Retrieve and format knowledge context for agent consumption')
    .argument('[seed]', 'Search seed text or query')
    .option('--scope <scope>', 'Filter by scope (global or project)')
    .option('--label <label>', 'Filter by label (repeatable)', collectValues, [])
    .option('--skill-budget <n>', 'Maximum skills in plan (default: 3)', '3')
    .option('--max-depth <n>', 'Maximum graph expansion depth (default: 2)', '2')
    .option('--fallback <mode>', 'Fallback mode: auto, v2-capsule, v1-graph-assisted', 'auto')
    .option('--stdin', 'Read seed from stdin')
    .option('--json', 'Output raw JSON instead of markdown')
    .action(
      async (
        seed: string | undefined,
        flags: {
          scope?: string;
          label: string[];
          skillBudget: string;
          maxDepth: string;
          fallback: string;
          stdin?: boolean;
          json?: boolean;
        },
      ) => {
        const state = await loadCliState();
        requireSessionToken(state);

        // Resolve seed text from argument or stdin
        const searchSeed = await resolveSearchSeed(seed, flags);

        if (!searchSeed.trim()) {
          throw new Error('Seed text is required. Provide a seed argument or use --stdin.');
        }

        // Build filters
        const filters: Record<string, unknown> = {
          labels: flags.label,
        };

        if (flags.scope) {
          filters.scopes = [flags.scope];
        }

        // Parse and validate integer options
        const skillBudget = Number.parseInt(flags.skillBudget, 10);
        const maxDepth = Number.parseInt(flags.maxDepth, 10);
        if (Number.isNaN(skillBudget) || Number.isNaN(maxDepth)) {
          throw new Error('--skill-budget and --max-depth must be valid integers.');
        }

        // Build v3 GraphRAG-lite query
        const body = {
          seed: searchSeed,
          filters,
          skillBudget,
          maxDepth,
          fallbackMode: flags.fallback,
        };

        // Call v3 retrieval endpoint
        const response = await apiRequest<GraphPlanSearchResponse>(state, {
          method: 'POST',
          path: '/v3/retrieval/search',
          body,
        });

        const parsed = graphPlanSearchResponseSchema.parse(response.data);

        // Output formatted markdown or raw JSON
        printAdaptiveResult(
          'graph-plan',
          parsed,
          state,
          flags.json ? { json: true } : {},
          formatLoadContext,
        );
      },
    );
}
