import type { AccessKey, Member } from '@trapmap/contracts';
import { issueAccessKeyResponseSchema, memberSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState } from '../lib/config.js';
import { apiRequest, requireSessionToken } from '../lib/http.js';
import { printCommandResult } from '../lib/output.js';

interface MemberCommandOptions {
  allowAccessKeyCreate: boolean;
  allowMemberCreate: boolean;
  allowMemberUpdate: boolean;
}

export function registerMemberCommands(program: Command, options: MemberCommandOptions): void {
  if (options.allowMemberCreate || options.allowMemberUpdate) {
    const member = program.command('member').description('Manage team members');

    if (options.allowMemberCreate) {
      member
        .command('create')
        .description('Create a new member at level 0')
        .argument('<handle>', 'Unique member handle')
        .requiredOption('--team <teamId>', 'Team identifier')
        .option('--role <role>', 'Role template', 'user')
        .option('--note <text>', 'Optional note')
        .option('--json', 'Output JSON')
        .action(
          async (
            handle: string,
            flags: { team: string; role?: string; note?: string; json?: boolean },
          ) => {
            const state = await loadCliState();
            requireSessionToken(state);
            const response = await apiRequest<Member>(state, {
              method: 'POST',
              path: '/v1/members',
              body: {
                teamId: flags.team,
                handle,
                roleTemplate: flags.role,
                notes: flags.note,
              },
            });
            const parsed = memberSchema.parse(response.data);

            printCommandResult(
              {
                action: 'member-create',
                success: true,
                summary: `Created member ${parsed.id} (${parsed.handle}) at level ${parsed.securityLevel}`,
                artifacts: [
                  {
                    id: parsed.id,
                    title: parsed.handle,
                    newState: `level-${parsed.securityLevel}`,
                  },
                ],
                nextSteps: [],
              },
              parsed,
              state,
              flags,
              (memberRecord) =>
                `Created member ${memberRecord.id} (${memberRecord.handle}) at level ${memberRecord.securityLevel}`,
            );
          },
        );
    }

    if (options.allowMemberUpdate) {
      member
        .command('update')
        .description('Update a member level, permissions, or note')
        .argument('<memberId>', 'Member identifier')
        .option('--level <n>', 'New security level')
        .option('--note <text>', 'Updated note')
        .option('--permission <name...>', 'Explicit permissions to set')
        .option('--json', 'Output JSON')
        .action(
          async (
            memberId: string,
            flags: {
              json?: boolean;
              level?: string;
              note?: string;
              permission?: string[];
            },
          ) => {
            const state = await loadCliState();
            requireSessionToken(state);
            const response = await apiRequest<Member>(state, {
              method: 'PATCH',
              path: `/v1/members/${memberId}`,
              body: {
                securityLevel: flags.level ? Number(flags.level) : undefined,
                notes: flags.note,
                permissions: flags.permission,
              },
            });
            const parsed = memberSchema.parse(response.data);

            printCommandResult(
              {
                action: 'member-update',
                success: true,
                summary: `Updated member ${parsed.id} -> level ${parsed.securityLevel}`,
                artifacts: [
                  {
                    id: parsed.id,
                    title: parsed.handle,
                    newState: `level-${parsed.securityLevel}`,
                  },
                ],
                nextSteps: [],
              },
              parsed,
              state,
              flags,
              (memberRecord) =>
                `Updated member ${memberRecord.id} -> level ${memberRecord.securityLevel}`,
            );
          },
        );
    }
  }

  if (options.allowAccessKeyCreate) {
    program
      .command('access-key:create')
      .description('Issue a permanent access key for an existing member')
      .argument('<memberId>', 'Member identifier')
      .requiredOption('--team <teamId>', 'Team identifier')
      .option('--note <text>', 'Optional note')
      .option('--json', 'Output JSON')
      .action(async (memberId: string, flags: { team: string; note?: string; json?: boolean }) => {
        const state = await loadCliState();
        requireSessionToken(state);
        const response = await apiRequest<{ accessKey: string; record: AccessKey }>(state, {
          method: 'POST',
          path: '/v1/access-keys',
          body: {
            teamId: flags.team,
            memberId,
            notes: flags.note,
          },
        });
        const parsed = issueAccessKeyResponseSchema.parse(response.data);

        printCommandResult(
          {
            action: 'access-key-create',
            success: true,
            summary: `Issued access key for member ${parsed.record.memberId}`,
            artifacts: [{ id: parsed.record.id, title: parsed.record.tokenPreview }],
            nextSteps: [],
          },
          parsed,
          state,
          flags,
          ({ accessKey, record }) =>
            [
              `Issued access key for member ${record.memberId}`,
              `Preview: ${record.tokenPreview}`,
              `Full key: ${accessKey}`,
            ].join('\n'),
        );
      });
  }
}
