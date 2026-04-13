import type {
  KnowledgeDeactivateResponse,
  KnowledgeEntryResponse,
  KnowledgeListResponse,
} from '@skill-shareer/contracts';
import {
  knowledgeDeactivateResponseSchema,
  knowledgeEntryResponseSchema,
  knowledgeListResponseSchema,
} from '@skill-shareer/contracts';
import type { Command } from 'commander';

import { loadCliState } from '../lib/config.js';
import { apiRequest, requireSessionToken } from '../lib/http.js';
import { printResult } from '../lib/output.js';

interface OperationsCommandOptions {
  allowExport: boolean;
  allowEdit: boolean;
  allowDeactivate: boolean;
}

function formatListResponse(response: KnowledgeListResponse): string {
  if (response.items.length === 0) {
    return 'No knowledge entries found';
  }

  return response.items
    .map((item) =>
      [
        `${item.id} [${item.lifecycleState}]`,
        `Scope: ${item.scope}`,
        `Required level: ${item.requiredLevel}`,
        `Shortcut: ${item.shortcut}`,
      ].join('\n'),
    )
    .join('\n\n');
}

export function registerOperationsCommands(program: Command, options: OperationsCommandOptions): void {
  if (options.allowExport) {
    program
      .command('list')
      .description('List knowledge entries with optional filters')
      .option('--scope <scope>', 'Filter by scope: global or project')
      .option('--state <state>', 'Filter by lifecycle state (comma-separated)')
      .option('--max-level <n>', 'Filter entries at or below this security level')
      .option('--owner <userId>', 'Filter by owner user ID')
      .option('--json', 'Output JSON')
      .action(
        async (flags: {
          json?: boolean;
          maxLevel?: string;
          owner?: string;
          scope?: string;
          state?: string;
        }) => {
          const state = await loadCliState();
          requireSessionToken(state);

          const queryParams = new URLSearchParams();

          if (flags.scope !== undefined) {
            queryParams.set('scope', flags.scope);
          }

          if (flags.state !== undefined) {
            queryParams.set('lifecycleState', flags.state);
          }

          if (flags.maxLevel !== undefined) {
            queryParams.set('requiredLevelMax', flags.maxLevel);
          }

          if (flags.owner !== undefined) {
            queryParams.set('ownerUserId', flags.owner);
          }

          const path = queryParams.size > 0 ? `/v1/operations/knowledge?${queryParams}` : '/v1/operations/knowledge';
          const response = await apiRequest<KnowledgeListResponse>(state, { path });
          const parsed = knowledgeListResponseSchema.parse(response.data);

          printResult(parsed, flags, (value) => formatListResponse(value));
        },
      );
  }

  if (options.allowEdit) {
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
            [`Updated ${entry.id}`, `Lifecycle: ${entry.lifecycleState}`, `Revision: ${entry.latestRevision.revision}`].join(
              '\n',
            ),
          );
        },
      );
  }

  if (options.allowDeactivate) {
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
}