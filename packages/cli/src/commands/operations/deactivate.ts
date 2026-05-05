import type { KnowledgeDeactivateResponse } from '@trapmap/contracts';
import { knowledgeDeactivateResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '../../lib/config.js';
import { apiRequest, requireSessionToken } from '../../lib/http.js';
import { printResult } from '../../lib/output.js';
import type { OperationsCommandOptions } from './types.js';

export function registerDeactivateCommand(
  program: Command,
  options: OperationsCommandOptions,
): void {
  if (!options.allowDeactivate) return;

  program
    .command('deactivate')
    .description('Deactivate a knowledge entry')
    .argument('<entryId>', 'Knowledge entry identifier')
    .requiredOption('--reason <text>', 'Reason for deactivation (1-500 characters)')
    .option('--json', 'Output JSON')
    .action(async (entryId: string, flags: { json?: boolean; reason: string }) => {
      const state = await loadCliState();
      requireSessionToken(state);

      const response = await apiRequest<KnowledgeDeactivateResponse>(state, {
        method: 'POST',
        path: `/v1/operations/knowledge/${entryId}/deactivate`,
        body: {
          entryId,
          reason: flags.reason,
        },
      });
      const parsed = knowledgeDeactivateResponseSchema.parse(response.data);

      printResult(parsed, flags, ({ entry }) =>
        [`Deactivated ${entry.id}`, `Lifecycle: ${entry.lifecycleState}`].join('\n'),
      );
    });
}
