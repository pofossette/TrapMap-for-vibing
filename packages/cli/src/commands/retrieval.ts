import type { ConflictHint, RetrievalResponse, RetrievalV2Response } from '@trapmap/contracts';
import { retrievalResponseSchema, retrievalV2ResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '../lib/config.js';
import { apiRequest, requireSessionToken } from '../lib/http.js';
import { collectValues, resolveTextInput } from '../lib/input.js';
import { printResult } from '../lib/output.js';

interface RetrievalCommandOptions {
  allowSearch: boolean;
}

type RetrievalMatch = NonNullable<RetrievalResponse['globalConstraints'][number]>;

/**
 * Format conflict hints for display.
 * Shows conflict type and context for each conflicting entry.
 */
function formatConflicts(conflicts: ConflictHint[]): string {
  const lines = ['Conflicts:'];
  for (const conflict of conflicts) {
    const typeLabel: Record<string, string> = {
      alternative: '[alt]',
      contradictory: '[!]',
      superseded: '[old]',
    };
    lines.push(
      `  ${typeLabel[conflict.conflictType] ?? '[?]'} ${conflict.shortcut} (${conflict.entryId})`,
    );
    lines.push(`      ${conflict.context}`);
  }
  return lines.join('\n');
}

function formatMatch(match: RetrievalMatch): string {
  const lines = [
    `${match.entryId}`,
    `Shortcut: ${match.shortcut}`,
    `Labels: ${match.labels.join(', ')}`,
    `Score: ${match.score.toFixed(2)}`,
    `Reason: ${match.reason}`,
  ];

  // Add citation information if available (hybrid/graph-assisted modes)
  if (match.citation?.recallChannels?.length) {
    lines.push(`Channels: ${match.citation.recallChannels.join(', ')}`);
    lines.push(`Source: ${match.citation.source.entryId} (${match.citation.source.scope})`);
  }

  // Add conflict information if available (Phase 55: CONFLICT-02)
  if (match.conflicts?.length) {
    lines.push(formatConflicts(match.conflicts));
  }

  return lines.join('\n');
}

/**
 * Format a capsule match for text output (Phase 14 v2 retrieval).
 * Renders capsule-first distilled sections without exposing bundle payloads (T-14-11).
 */
function formatCapsuleMatch(capsule: {
  capsuleId: string;
  artifactId: string;
  situation: string;
  problem: string;
  goal: string;
  labels: string[];
  scope: string;
  requiredLevel: number;
  score: number;
  reason: string;
  conflicts?: ConflictHint[] | undefined;
}): string {
  const lines = [
    `${capsule.capsuleId}`,
    `Artifact: ${capsule.artifactId}`,
    `Situation: ${capsule.situation}`,
    `Problem: ${capsule.problem}`,
    `Goal: ${capsule.goal}`,
    `Labels: ${capsule.labels.join(', ')}`,
    `Scope: ${capsule.scope} (level ${capsule.requiredLevel})`,
    `Score: ${capsule.score.toFixed(2)}`,
    `Reason: ${capsule.reason}`,
  ];

  // Add conflict information if available (Phase 55: CONFLICT-02)
  if (capsule.conflicts?.length) {
    lines.push(formatConflicts(capsule.conflicts));
  }

  return lines.join('\n');
}

/**
 * Format profile hint for text output (Phase 14 v2 retrieval).
 */
function formatProfileHint(hint: {
  artifactId: string;
  title: string;
  slug: string;
  labels: string[];
}): string {
  return `${hint.artifactId}: ${hint.title} (${hint.slug}) [${hint.labels.join(', ')}]`;
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

/**
 * Format v2 retrieval response for text output.
 * Renders capsule-first distilled results (RETR-04, T-14-07).
 */
function formatV2RetrievalResponse(response: RetrievalV2Response): string {
  const sections: string[] = [];

  if (response.capsules.length > 0) {
    sections.push('Capsules');
    sections.push(response.capsules.map(formatCapsuleMatch).join('\n\n'));
  }

  if (response.profileHints.length > 0) {
    if (sections.length > 0) {
      sections.push('');
    }
    sections.push('Profile hints');
    sections.push(response.profileHints.map(formatProfileHint).join('\n'));
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
    .option('--v2', 'Use capsule-native v2 retrieval (Phase 14)')
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
          v2?: boolean;
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

        // Use v2 path if --v2 flag is set (Phase 14)
        if (flags.v2) {
          // v2 retrieval: seed-only input, capsule-first output (RETR-01, RETR-04)
          const body = {
            seed: searchSeed,
            filters,
            maxResults: Number.parseInt(flags.maxResults, 10),
          };

          const response = await apiRequest<RetrievalV2Response>(state, {
            method: 'POST',
            path: '/v2/retrieval/search',
            body,
          });

          const parsed = retrievalV2ResponseSchema.parse(response.data);

          printResult(parsed, flags, formatV2RetrievalResponse);
        } else {
          // Legacy v1 retrieval (COMP-03)
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
        }
      },
    );
}
