import { skillHistoryResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { printCommandResult } from '@trapmap/cli/lib/output.js';

import { type SkillVersionsPayload, formatSkillVersionsResponse } from './formatters.js';

/**
 * Register the skill versions subcommand.
 * Shows the artifact's current semver version and revision history by reading
 * the artifact history endpoint (same endpoint as `history`), formatting each
 * revision's number, version, submittedAt, submittedBy, and sourceHash prefix.
 */
export function registerVersionsCommand(skill: Command): void {
  skill
    .command('versions')
    .description('Show current version and revision history for a skill artifact')
    .argument('<artifactId>', 'Artifact ID to show versions for')
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

        const response = await apiRequest<unknown>(state, {
          method: 'GET',
          path: `/v1/operations/artifacts/${artifactId}/history`,
        });

        const parsed = skillHistoryResponseSchema.parse(response.data);
        const revisions = parsed.revisions;
        const current = revisions.at(-1);

        const payload: SkillVersionsPayload = {
          artifactId,
          currentRevision: current?.revision ?? parsed.currentRevision,
          currentVersion: current?.version,
          revisions,
        };

        printCommandResult(
          {
            action: 'skill-versions',
            success: true,
            summary: current?.version
              ? `Artifact ${artifactId} is at version ${current.version} (revision ${current.revision}).`
              : `Artifact ${artifactId} is at revision ${current?.revision ?? 'n/a'} (no version declared).`,
            artifacts: [
              {
                id: artifactId,
                revision: current?.revision,
                version: current?.version,
              },
            ],
            nextSteps: [],
          },
          payload,
          state,
          flags,
          (value) => formatSkillVersionsResponse(value),
        );
      },
    );
}
