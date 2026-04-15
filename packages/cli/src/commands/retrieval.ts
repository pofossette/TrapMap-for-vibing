import type { RetrievalResponse } from '@skill-shareer/contracts';
import { retrievalResponseSchema } from '@skill-shareer/contracts';
import type { Command } from 'commander';

import { loadCliState } from '../lib/config.js';
import { apiRequest, requireSessionToken } from '../lib/http.js';
import { collectValues, resolveTextInput } from '../lib/input.js';
import { printResult } from '../lib/output.js';

interface RetrievalCommandOptions {
  allowSearch: boolean;
}

function formatMatch(match: {
  entryId: string;
  shortcut: string;
  detail: string;
  labels: string[];
  score: number;
  reason: string;
  citation?: {
    source: {
      entryId: string;
      scope: string;
      shortcut: string;
    };
    snippet: string;
    tags: string[];
    recallChannels: string[];
    scores: {
      semantic: number | null;
      keyword: number | null;
      graph: number | null;
      preRerank: number;
      final: number;
    };
  };
}): string {
  const lines = [
    `${match.entryId}`,
    `Shortcut: ${match.shortcut}`,
    `Labels: ${match.labels.join(', ')}`,
    `Score: ${match.score.toFixed(2)}`,
    `Reason: ${match.reason}`,
  ];

  // Add citation information if available (hybrid/graph-assisted modes)
  if (match.citation) {
    lines.push(`Channels: ${match.citation.recallChannels.join(', ')}`);
    lines.push(`Source: ${match.citation.source.entryId} (${match.citation.source.scope})`);
  }

  return lines.join('\n');
}

function formatRetrievalResponse(response: RetrievalResponse): string {
  const sections: string[] = [];

  if (response.globalConstraints.length > 0) {
    sections.push('Global constraints');
    sections.push(response.globalConstraints.map(formatMatch).join('\n\n'));
  }

  if (response.projectKnowledge.length > 0) {
    if (sections.length > 0) {
      sections.push('');
    }
    sections.push('Project knowledge');
    sections.push(response.projectKnowledge.map(formatMatch).join('\n\n'));
  }

  if (response.refinementSummary) {
    if (sections.length > 0) {
      sections.push('');
    }
    sections.push('Refinement summary');
    sections.push(response.refinementSummary);
  }

  if (response.summary) {
    if (sections.length > 0) {
      sections.push('');
    }
    sections.push('Summary');
    sections.push(response.summary.text);
  }

  if (sections.length === 0) {
    return 'No results found';
  }

  return sections.join('\n');
}

export function registerRetrievalCommands(
  program: Command,
  options: RetrievalCommandOptions,
): void {
  if (!options.allowSearch) {
    return;
  }

  program
    .command('search')
    .description('Search knowledge base using semantic retrieval')
    .argument('[seed]', 'Search seed text or query')
    .option('--label <label>', 'Filter by label', collectValues, [])
    .option('--scope <scope>', 'Filter by scope (global or project)')
    .option('--max-results <n>', 'Maximum number of results to return', '10')
    .option('--no-refinement', 'Disable LLM refinement')
    .option('--summary', 'Enable summary generation')
    .option('--mode <mode>', 'Query mode (semantic, hybrid, graph-assisted)', 'semantic')
    .option('--stdin', 'Read search seed from stdin')
    .option('--json', 'Output JSON')
    .action(
      async (
        seed: string | undefined,
        flags: {
          label: string[];
          scope?: string;
          maxResults: string;
          refinement?: boolean;
          summary?: boolean;
          mode?: string;
          stdin?: boolean;
          json?: boolean;
        },
      ) => {
        const state = await loadCliState();
        requireSessionToken(state);

        // Resolve seed text from argument or stdin
        const searchSeed = await resolveTextInput(
          {
            ...(seed !== undefined ? { text: seed } : {}),
            ...(flags.stdin !== undefined ? { stdin: flags.stdin } : {}),
          },
          'seed',
        );

        // Build filters
        const filters: Record<string, unknown> = {
          labels: flags.label,
        };

        if (flags.scope) {
          filters.scopes = [flags.scope];
        }

        // Build request body
        const body = {
          seed: searchSeed,
          filters,
          maxResults: Number.parseInt(flags.maxResults, 10),
          includeRefinement: flags.refinement ?? true,
          includeSummary: flags.summary ?? false,
          mode: flags.mode ?? 'semantic',
        };

        const response = await apiRequest<RetrievalResponse>(state, {
          method: 'POST',
          path: '/v1/retrieval/search',
          body,
        });

        const parsed = retrievalResponseSchema.parse(response.data);

        printResult(parsed, flags, formatRetrievalResponse);
      },
    );
}
