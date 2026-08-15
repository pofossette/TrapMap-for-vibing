import type {
  ApplyResolutionResponse,
  DuplicateJobBundleResponse,
  ManualResultResponse,
} from '@trapmap/contracts';
import {
  DuplicateJobBundleResponseSchema,
  applyResolutionResponseSchema,
  manualResultResponseSchema,
} from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { printCommandResult } from '@trapmap/cli/lib/output.js';

import { printApplyResolutionResult } from './apply-resolution-result.js';
import {
  formatApplyResolutionResponse,
  formatDuplicateJobBundle,
  formatManualResultResponse,
} from './formatters.js';

/**
 * Register the duplicate-job subcommands (Phase 34/35):
 *   duplicate-job fetch, duplicate-job resolve, duplicate-job apply-resolution
 */
export function registerDuplicateJobCommands(skill: Command): void {
  const duplicateJob = skill
    .command('duplicate-job')
    .description('Manage duplicate job review workflow');

  duplicateJob
    .command('fetch')
    .description('Fetch duplicate job bundle for offline review')
    .argument('<candidateId>', 'Candidate ID to fetch')
    .option('--json', 'Output raw JSON')
    .action(async (candidateId: string, flags: { json?: boolean }) => {
      const state = await loadCliState();
      requireSessionToken(state);

      const response = await apiRequest<DuplicateJobBundleResponse>(state, {
        method: 'GET',
        path: `/v1/duplicates/${candidateId}/bundle`,
      });

      const parsed = DuplicateJobBundleResponseSchema.parse(response.data);

      printCommandResult(
        {
          action: 'duplicate-job-fetch',
          success: true,
          summary: `Fetched bundle for candidate ${parsed.candidate.id} (${parsed.candidate.sourceType}, ${parsed.matches.length} match(es)).`,
          artifacts: [
            {
              id: parsed.candidate.id,
              title: parsed.candidate.sourceType,
              newState: parsed.candidate.status,
            },
          ],
          nextSteps: [
            `Review matches and run: trapmap skill duplicate-job resolve ${parsed.candidate.id}`,
          ],
        },
        parsed,
        state,
        flags,
        formatDuplicateJobBundle,
      );
    });

  duplicateJob
    .command('resolve')
    .description('Submit manual resolution for duplicate candidate')
    .argument('<candidateId>', 'Candidate ID to resolve')
    .requiredOption('--decision <decision>', 'Decision: independent or merged')
    .requiredOption('--notes <text>', 'Explanation of the decision')
    .option('--merged-with <entityId>', 'Entity ID to merge with (required if decision is merged)')
    .option('--merged-type <type>', 'Entity type: trap or skill (required if decision is merged)')
    .option('--json', 'Output raw JSON')
    .action(
      async (
        candidateId: string,
        flags: {
          decision: string;
          notes: string;
          mergedWith?: string;
          mergedType?: string;
          json?: boolean;
        },
      ) => {
        const state = await loadCliState();
        requireSessionToken(state);

        // Validate decision value
        if (flags.decision !== 'independent' && flags.decision !== 'merged') {
          throw new Error('--decision must be "independent" or "merged"');
        }

        // Validate merged options
        if (flags.decision === 'merged') {
          if (!flags.mergedWith || !flags.mergedType) {
            throw new Error(
              '--merged-with and --merged-type are required when decision is "merged"',
            );
          }
          if (flags.mergedType !== 'trap' && flags.mergedType !== 'skill') {
            throw new Error('--merged-type must be "trap" or "skill"');
          }
        }

        const body: Record<string, unknown> = {
          decision: flags.decision,
          notes: flags.notes,
        };

        if (flags.decision === 'merged' && flags.mergedWith && flags.mergedType) {
          body.mergedWith = {
            entityId: flags.mergedWith,
            entityType: flags.mergedType,
          };
        }

        const response = await apiRequest<ManualResultResponse>(state, {
          method: 'POST',
          path: `/v1/candidates/${candidateId}/manual-result`,
          body,
        });

        const parsed = manualResultResponseSchema.parse(response.data);

        printCommandResult(
          {
            action: 'duplicate-job-resolve',
            success: true,
            summary: `Resolved ${parsed.candidateId} as ${parsed.decision}.`,
            artifacts: [{ id: parsed.candidateId, newState: parsed.nextState }],
            nextSteps: [`Run: trapmap skill duplicate-job apply-resolution ${parsed.candidateId}`],
          },
          parsed,
          state,
          flags,
          formatManualResultResponse,
        );
      },
    );

  duplicateJob
    .command('apply-resolution')
    .description('Apply the stored manual resolution to publish or merge a candidate')
    .argument('<candidateId>', 'Candidate ID to apply resolution for')
    .option('--json', 'Output raw JSON')
    .action(async (candidateId: string, flags: { json?: boolean }) => {
      const state = await loadCliState();
      requireSessionToken(state);

      const response = await apiRequest<ApplyResolutionResponse>(state, {
        method: 'POST',
        path: `/v1/candidates/${candidateId}/apply-resolution`,
      });

      const parsed = applyResolutionResponseSchema.parse(response.data);

      printApplyResolutionResult(
        parsed,
        state,
        flags,
        'apply-resolution',
        formatApplyResolutionResponse,
      );
    });
}
