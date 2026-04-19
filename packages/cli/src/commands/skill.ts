import type { SkillLookupResponse } from '@trapmap/contracts';
import { skillLookupResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '../lib/config.js';
import { apiRequest, requireSessionToken } from '../lib/http.js';
import { printResult } from '../lib/output.js';

interface SkillCommandOptions {
  allowSearch: boolean;
}

/**
 * Format a skill lookup match for text output (Phase 18 SKED-01).
 * Renders artifact-first results without capsule content.
 */
function formatSkillMatch(match: {
  artifactId: string;
  title: string;
  slug: string;
  labels: string[];
  scope: string;
  requiredLevel: number;
  sourceKind: string;
  score: number;
  reason: string;
}): string {
  const lines = [
    `${match.artifactId}`,
    `Title: ${match.title}`,
    `Slug: ${match.slug}`,
    `Labels: ${match.labels.join(', ')}`,
    `Scope: ${match.scope} (level ${match.requiredLevel})`,
    `Source: ${match.sourceKind}`,
    `Score: ${match.score.toFixed(2)}`,
    `Reason: ${match.reason}`,
  ];

  return lines.join('\n');
}

/**
 * Format skill lookup response for text output.
 */
function formatSkillLookupResponse(response: SkillLookupResponse): string {
  if (response.matches.length === 0) {
    return 'No skills found';
  }

  return response.matches.map(formatSkillMatch).join('\n\n');
}

export function registerSkillCommands(program: Command, options: SkillCommandOptions): void {
  if (!options.allowSearch) {
    return;
  }

  const skill = program.command('skill').description('Search and manage skill artifacts');

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

        printResult(parsed, flags, formatSkillLookupResponse);
      },
    );
}
