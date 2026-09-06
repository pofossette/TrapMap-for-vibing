import { readFileSync } from 'node:fs';
import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { printCommandResult } from '@trapmap/cli/lib/output.js';
import type { SkillEditResponse } from '@trapmap/contracts';
import { skillEditResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

import { formatSkillEditResponse } from './formatters.js';

/**
 * Register the skill edit subcommand (Phase 19 SKED-02).
 */
export function registerEditCommand(skill: Command): void {
  skill
    .command('edit')
    .description('Edit a skill artifact by ID')
    .argument('<artifactId>', 'Artifact ID to edit')
    .option('--title <title>', 'New title for the artifact')
    .option('--labels <labels>', 'Comma-separated new labels')
    .option(
      '--file <path>',
      'Path to a file to include (SKILL.md)',
      (value, previous: string[]) => {
        return previous ? [...previous, value] : [value];
      },
    )
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
              sha256: '', // Server will compute
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

        printCommandResult(
          {
            action: 'skill-edit',
            success: true,
            summary: `Updated ${parsed.artifact.id} to revision ${parsed.artifact.latestRevision}.`,
            artifacts: [
              {
                id: parsed.artifact.id,
                title: parsed.artifact.title,
                newState: parsed.artifact.lifecycleState,
                revision: parsed.artifact.latestRevision,
              },
            ],
            ...(parsed.lifecycleTransition ? { transition: parsed.lifecycleTransition } : {}),
            nextSteps: [],
          },
          parsed,
          state,
          flags,
          formatSkillEditResponse,
        );
      },
    );
}
