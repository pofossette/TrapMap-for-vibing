import type { Command } from 'commander';

import { loadCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { printCommandResult } from '@trapmap/cli/lib/output.js';
import type { KnowledgeEntryResponse } from '@trapmap/contracts';
import { knowledgeEntryResponseSchema } from '@trapmap/contracts';
import {
  knowledgeEntryDescriptor,
  registerKnowledgeEntryResubmit,
  registerKnowledgeEntryReviewStatus,
  registerKnowledgeEntrySubmit,
} from './knowledge-entry-commands.js';

interface KnowledgeCommandOptions {
  allowInspect: boolean;
  allowSubmit: boolean;
}

export function registerKnowledgeCommands(
  program: Command,
  options: KnowledgeCommandOptions,
): void {
  if (options.allowSubmit) {
    registerKnowledgeEntrySubmit(program, knowledgeEntryDescriptor);
    registerKnowledgeEntryResubmit(program, knowledgeEntryDescriptor);

    program
      .command('supersede')
      .description('Supersede a knowledge entry with a replacement')
      .argument('<entryId>', 'Knowledge entry to supersede')
      .requiredOption('--replacement <id>', 'ID of the replacement entry')
      .option('--json', 'Output JSON')
      .action(async (entryId: string, flags: { replacement: string; json?: boolean }) => {
        const state = await loadCliState();
        requireSessionToken(state);
        const response = await apiRequest<KnowledgeEntryResponse>(state, {
          method: 'POST',
          path: `/v1/knowledge/${entryId}/supersede`,
          body: { replacementId: flags.replacement },
        });
        const parsed = knowledgeEntryResponseSchema.parse(response.data);

        printCommandResult(
          {
            action: 'knowledge-supersede',
            success: true,
            summary: `Superseded ${parsed.entry.id} (${parsed.entry.lifecycleState}).`,
            artifacts: [{ id: parsed.entry.id, newState: parsed.entry.lifecycleState }],
            nextSteps: [],
          },
          parsed,
          state,
          flags,
          ({ entry }) =>
            [`Superseded ${entry.id}`, `Lifecycle: ${entry.lifecycleState}`].join('\n'),
        );
      });
  }

  if (options.allowInspect) {
    registerKnowledgeEntryReviewStatus(program, knowledgeEntryDescriptor);
  }
}
