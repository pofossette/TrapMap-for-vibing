import type { LoginResponse, Team, TeamListResponse } from '@trapmap/contracts';
import { loginResponseSchema, teamListResponseSchema, teamSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

import { loadCliState, updateCliState } from '@trapmap/cli/lib/config.js';
import { apiRequest, requireSessionToken } from '@trapmap/cli/lib/http.js';
import { printCommandResult } from '@trapmap/cli/lib/output.js';

interface TeamCommandOptions {
  allowCreate: boolean;
}

export function registerTeamCommands(program: Command, options: TeamCommandOptions): void {
  const team = program.command('team').description('Manage and inspect available teams');

  team
    .command('list')
    .description('List available teams for the current session')
    .option('--json', 'Output JSON')
    .action(async (flags: { json?: boolean }) => {
      const state = await loadCliState();
      requireSessionToken(state);
      const response = await apiRequest<TeamListResponse>(state, {
        path: '/v1/teams',
      });
      const parsed = teamListResponseSchema.parse(response.data);

      printCommandResult(
        {
          action: 'team-list',
          success: true,
          summary: `Found ${parsed.teams.length} team(s).`,
          artifacts: parsed.teams.map((t) => ({ id: t.id, title: t.name })),
          nextSteps: [],
        },
        parsed,
        state,
        flags,
        ({ teams, activeTeamId }) =>
          teams
            .map(
              (teamRecord) =>
                `${teamRecord.id === activeTeamId ? '*' : ' '} ${teamRecord.id} ${teamRecord.name}`,
            )
            .join('\n'),
      );
    });

  team
    .command('select')
    .description('Select the active team for the saved session')
    .argument('<teamId>', 'Team identifier')
    .option('--json', 'Output JSON')
    .action(async (teamId: string, flags: { json?: boolean }) => {
      const state = await loadCliState();
      requireSessionToken(state);
      const response = await apiRequest<LoginResponse>(state, {
        method: 'POST',
        path: '/v1/teams/select',
        body: { teamId },
      });
      const parsed = loginResponseSchema.parse(response.data);

      await updateCliState((current) => ({
        ...current,
        session: parsed.session,
      }));

      printCommandResult(
        {
          action: 'team-select',
          success: true,
          summary: `Active team: ${parsed.session.activeTeam?.name ?? parsed.session.member.teamId}`,
          artifacts: [{ id: teamId, title: parsed.session.activeTeam?.name ?? teamId }],
          nextSteps: [],
        },
        parsed,
        state,
        flags,
        ({ session }) => `Active team: ${session.activeTeam?.name ?? session.member.teamId}`,
      );
    });

  if (options.allowCreate) {
    team
      .command('create')
      .description('Create a new team')
      .argument('<name>', 'Display name for the team')
      .option('--description <text>', 'Optional team description')
      .option('--json', 'Output JSON')
      .action(async (name: string, flags: { description?: string; json?: boolean }) => {
        const state = await loadCliState();
        requireSessionToken(state);
        const response = await apiRequest<Team>(state, {
          method: 'POST',
          path: '/v1/teams',
          body: {
            name,
            description: flags.description,
          },
        });
        const parsed = teamSchema.parse(response.data);

        printCommandResult(
          {
            action: 'team-create',
            success: true,
            summary: `Created team ${parsed.id} (${parsed.name})`,
            artifacts: [{ id: parsed.id, title: parsed.name }],
            nextSteps: [],
          },
          parsed,
          state,
          flags,
          (teamRecord) => `Created team ${teamRecord.id} (${teamRecord.name})`,
        );
      });
  }
}
