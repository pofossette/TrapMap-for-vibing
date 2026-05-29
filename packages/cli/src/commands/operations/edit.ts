import type { KnowledgeEntryResponse } from '@trapmap/contracts';
import { knowledgeEntryResponseSchema } from '@trapmap/contracts';
import { InvalidArgumentError } from 'commander';
import type { Command } from 'commander';

import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { printResult } from '@trapmap/cli/lib/output.js';
import type { OperationsCommandOptions } from './types.js';

export function registerEditCommand(program: Command, options: OperationsCommandOptions): void {
  if (!options.allowEdit) return;

  program
    .command('edit')
    .description('Edit a knowledge entry')
    .argument('<entryId>', 'Knowledge entry identifier')
    .option('--shortcut <text>', 'Updated pitfall shortcut')
    .option('--detail <text>', 'Updated detailed explanation')
    .option('--labels <labels>', 'Updated labels (comma-separated)')
    .option(
      '--required-level <n>',
      'Updated required security level',
      (value: string) => {
        const parsed = Number.parseInt(value, 10);
        if (!Number.isInteger(parsed) || String(parsed) !== value.trim()) {
          throw new InvalidArgumentError('required level must be a non-negative integer');
        }
        return parsed;
      },
    )
    .option('--json', 'Output JSON')
    .action(
      async (
        entryId: string,
        flags: {
          detail?: string;
          json?: boolean;
          labels?: string;
          requiredLevel?: number;
          shortcut?: string;
        },
      ) => {
        const cliState = await loadCliState();
        requireSessionToken(cliState);

        const body: Record<string, unknown> = { entryId };

        if (flags.shortcut !== undefined) {
          body.shortcut = flags.shortcut;
        }

        if (flags.detail !== undefined) {
          body.detail = flags.detail;
        }

        if (flags.labels !== undefined) {
          body.labels = flags.labels.split(',').map((l) => l.trim());
        }

        if (flags.requiredLevel !== undefined) {
          if (flags.requiredLevel < 0) {
            throw new InvalidArgumentError('required level must be a non-negative integer');
          }
          body.requiredLevel = flags.requiredLevel;
        }

        const response = await apiRequest<KnowledgeEntryResponse>(cliState, {
          method: 'PATCH',
          path: `/v1/knowledge/${entryId}`,
          body,
        });
        const parsed = knowledgeEntryResponseSchema.parse(response.data);

        printResult(parsed, flags, ({ entry }) =>
          [
            `Updated ${entry.id}`,
            `Lifecycle: ${entry.lifecycleState}`,
            `Revision: ${entry.latestRevision.revision}`,
          ].join('\n'),
        );
      },
    );
}
