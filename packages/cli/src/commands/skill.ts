import type { SkillEditResponse, SkillHistoryResponse, SkillLookupResponse } from '@trapmap/contracts';
import { skillEditResponseSchema, skillHistoryResponseSchema, skillLookupResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';
import { readFileSync } from 'node:fs';

import { loadCliState } from '../lib/config.js';
import { apiRequest, requireSessionToken } from '../lib/http.js';
import { printResult } from '../lib/output.js';

interface SkillCommandOptions {
  allowSearch: boolean;
  allowSubmit: boolean;
  allowExport: boolean;
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

/**
 * Format skill edit response for text output (Phase 19 SKED-02).
 */
function formatSkillEditResponse(response: SkillEditResponse): string {
  const lines = [
    `Artifact ID: ${response.artifact.id}`,
    `Title: ${response.artifact.title}`,
    `Previous Revision: ${response.previousRevision}`,
    `New Revision: ${response.artifact.latestRevision}`,
    `Lifecycle State: ${response.artifact.lifecycleState}`,
  ];

  if (response.lifecycleTransition) {
    lines.push(`Transition: ${response.lifecycleTransition.from} → ${response.lifecycleTransition.to}`);
  }

  return lines.join('\n');
}

/**
 * Format skill history response for text output (Phase 19 SKED-04).
 */
function formatSkillHistoryResponse(response: SkillHistoryResponse): string {
  const header = [
    `Artifact ID: ${response.artifactId}`,
    `Title: ${response.title}`,
    `Current Revision: ${response.currentRevision}`,
    `Lifecycle State: ${response.lifecycleState}`,
    '',
    'Revision History:',
  ];

  const revisions = response.revisions.map((r) => {
    const submitter = r.submittedBy.handle ?? r.submittedBy.id;
    return `  ${r.revision}. ${r.submittedAt} by ${submitter} [${r.lifecycleState}]${r.summary ? ` - ${r.summary}` : ''}`;
  });

  return [...header, ...revisions].join('\n');
}

export function registerSkillCommands(program: Command, options: SkillCommandOptions): void {
  // Always register the skill command if any subcommand is allowed
  if (!options.allowSearch && !options.allowSubmit && !options.allowExport) {
    return;
  }

  const skill = program.command('skill').description('Search and manage skill artifacts');

  // Phase 18: skill search-by-content
  if (options.allowSearch) {
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

  // Phase 19: skill edit (SKED-02)
  if (options.allowSubmit) {
    skill
      .command('edit')
      .description('Edit a skill artifact by ID')
      .argument('<artifactId>', 'Artifact ID to edit')
      .option('--title <title>', 'New title for the artifact')
      .option('--labels <labels>', 'Comma-separated new labels')
      .option('--file <path>', 'Path to a file to include (SKILL.md)', (value, previous: string[]) => {
        return previous ? [...previous, value] : [value];
      })
      .option('--json', 'Output JSON')
      .action(
        async (
          artifactId: string,
          flags: {
            title?: string;
            labels?: string;
            file?: string[];
            json?: boolean;
          },
        ) => {
          const state = await loadCliState();
          requireSessionToken(state);

          // Validate at least one update option is provided
          if (!flags.title && !flags.labels && !flags.file) {
            throw new Error('At least one of --title, --labels, or --file is required');
          }

          // Build edit payload
          const body: Record<string, unknown> = { artifactId };

          if (flags.title) {
            body.title = flags.title;
          }

          if (flags.labels) {
            body.labels = flags.labels.split(',').map((l) => l.trim());
          }

          if (flags.file && flags.file.length > 0) {
            // Read file contents
            const files = flags.file.map((filePath) => {
              const content = readFileSync(filePath, 'utf-8');
              const path = filePath.endsWith('SKILL.md') ? 'SKILL.md' : filePath;
              return {
                path,
                kind: filePath.endsWith('SKILL.md') ? 'skill-markdown' : 'reference',
                content,
                sha256: '',  // Server will compute
                sizeBytes: Buffer.byteLength(content, 'utf-8'),
                mediaType: 'text/markdown',
                source: filePath.endsWith('SKILL.md') ? 'SKILL.md' : 'references/',
                includeInDerivation: true,
                activationOnly: false,
              };
            });
            body.files = files;
          }

          const response = await apiRequest<SkillEditResponse>(state, {
            method: 'POST',
            path: `/v1/operations/artifacts/${artifactId}/edit`,
            body,
          });

          const parsed = skillEditResponseSchema.parse(response.data);

          printResult(parsed, flags, formatSkillEditResponse);
        },
      );
  }

  // Phase 19: skill history (SKED-04)
  if (options.allowExport) {
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

          printResult(parsed, flags, formatSkillHistoryResponse);
        },
      );
  }
}
