import { auditListResponseSchema } from '@skill-shareer/contracts';
import type { Command } from 'commander';

import { loadCliState } from '../lib/config.js';
import { apiRequest, requireSessionToken } from '../lib/http.js';
import { printResult } from '../lib/output.js';

interface AuditCommandOptions {
  allowRead: boolean;
}

function formatAuditResponse(response: ReturnType<typeof auditListResponseSchema.parse>): string {
  if (response.items.length === 0) {
    return 'No audit events found';
  }

  return response.items
    .map((item) =>
      [
        `${item.createdAt} - ${item.action}`,
        `Actor: ${item.actor.handle} (${item.actor.id})`,
        `Entity: ${item.entityId}`,
        `Team: ${item.teamId ?? 'global'}`,
        `Payload: ${JSON.stringify(item.payload)}`,
      ].join('\n'),
    )
    .join('\n\n');
}

export function registerAuditCommands(program: Command, options: AuditCommandOptions): void {
  if (!options.allowRead) {
    return;
  }

  program
    .command('audit')
    .description('Query audit trail for team operations')
    .option('--action <action>', 'Filter by action type (can be repeated)', (value, previous) => [
      ...(previous ?? []),
      value,
    ])
    .option('--actor <userId>', 'Filter by actor user ID')
    .option('--entity <entityId>', 'Filter by entity ID')
    .option('--from <date>', 'Filter from ISO date')
    .option('--to <date>', 'Filter to ISO date')
    .option('--limit <n>', 'Limit number of results', '25')
    .option('--json', 'Output JSON')
    .action(
      async (flags: {
        action?: string[];
        actor?: string;
        entity?: string;
        from?: string;
        to?: string;
        limit?: string;
        json?: boolean;
      }) => {
        const state = await loadCliState();
        requireSessionToken(state);

        const queryParams = new URLSearchParams();

        if (flags.action !== undefined && flags.action.length > 0) {
          for (const action of flags.action) {
            queryParams.append('action', action);
          }
        }

        if (flags.actor !== undefined) {
          queryParams.set('actorId', flags.actor);
        }

        if (flags.entity !== undefined) {
          queryParams.set('entityId', flags.entity);
        }

        if (flags.from !== undefined) {
          queryParams.set('from', flags.from);
        }

        if (flags.to !== undefined) {
          queryParams.set('to', flags.to);
        }

        if (flags.limit !== undefined) {
          queryParams.set('limit', flags.limit);
        }

        const path =
          queryParams.size > 0 ? `/v1/operations/audit?${queryParams}` : '/v1/operations/audit';
        const response = await apiRequest<(typeof auditListResponseSchema)['_output']>(state, {
          path,
        });
        const parsed = auditListResponseSchema.parse(response.data);

        printResult(parsed, { json: flags.json ?? false }, (value) => formatAuditResponse(value));
      },
    );
}
