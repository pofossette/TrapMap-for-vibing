import type { KnowledgeEntryResponse } from '@trapmap/contracts';
import { knowledgeEntryResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '../../lib/config.js';
import { apiRequest, requireSessionToken } from '../../lib/http.js';
import { printResult } from '../../lib/output.js';
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
    .option('--required-level <n>', 'Updated required security level')
    .option('--json', 'Output JSON')
    .action(
      async (
        entryId: string,
        flags: {
          detail?: string;
          json?: boolean;
          labels?: string;
          requiredLevel?: string;
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
          body.requiredLevel = Number(flags.requiredLevel);
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
