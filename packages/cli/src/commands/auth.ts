import type { LoginResponse, SessionStatusResponse } from '@trapmap/contracts';
import { loginResponseSchema, sessionStatusResponseSchema } from '@trapmap/contracts';
import type { Command } from 'commander';

import {
  clearSession,
  loadCliState,
  resolveCliGatewayUrl,
  updateCliState,
} from '@trapmap/cli/lib/config.js';
import { apiRequest } from '@trapmap/cli/lib/http.js';
import { printCommandResult } from '@trapmap/cli/lib/output.js';

export function registerAuthCommands(program: Command): void {
  program
    .command('login')
    .description('Authenticate with an access key or system admin key')
    .option('--access-key <key>', 'Permanent access key for a member')
    .option('--system-admin-key <key>', 'System admin bootstrap key')
    .option('--server <url>', 'Override the saved gateway URL')
    .option('--json', 'Output JSON')
    .action(
      async (options: {
        accessKey?: string;
        systemAdminKey?: string;
        server?: string;
        json?: boolean;
      }) => {
        if (!options.accessKey && !options.systemAdminKey) {
          throw new Error('Provide either --access-key or --system-admin-key.');
        }

        const state = await loadCliState();
        const payload = options.systemAdminKey
          ? { systemAdminKey: options.systemAdminKey }
          : { accessKey: options.accessKey as string };

        const response = await apiRequest<LoginResponse>(state, {
          method: 'POST',
          path: '/v1/auth/login',
          body: payload,
          ...(options.server ? { gatewayUrl: options.server } : {}),
        });

        const parsed = loginResponseSchema.parse(response.data);
        const gatewayUrl = options.server ?? resolveCliGatewayUrl(state);

        await updateCliState({
          gatewayUrl,
          sessionToken: response.sessionToken,
          session: parsed.session,
        });

        printCommandResult(
          {
            action: 'login',
            success: true,
            summary: `Logged in as ${parsed.session.member.handle} (level ${parsed.session.member.securityLevel})`,
            artifacts: [{ id: parsed.session.sessionId, title: parsed.session.member.handle }],
            nextSteps: [],
          },
          parsed,
          state,
          options,
          ({ session }) =>
            [
              `Logged in as ${session.member.handle}`,
              `Security level: ${session.member.securityLevel}`,
              `Active team: ${session.activeTeam?.name ?? 'none'}`,
            ].join('\n'),
        );
      },
    );

  program
    .command('logout')
    .description('Clear the local session and log out from the server')
    .option('--json', 'Output JSON')
    .action(async (options: { json?: boolean }) => {
      const state = await loadCliState();
      let remoteLogoutError: unknown = null;

      if (state.sessionToken) {
        try {
          await apiRequest(state, {
            method: 'POST',
            path: '/v1/auth/logout',
          });
        } catch (error) {
          remoteLogoutError = error;
        }
      }

      await clearSession();

      if (remoteLogoutError) {
        throw remoteLogoutError;
      }

      printCommandResult(
        {
          action: 'logout',
          success: true,
          summary: 'Logged out',
          artifacts: [],
          nextSteps: [],
        },
        { ok: true },
        state,
        options,
        () => 'Logged out',
      );
    });

  program
    .command('session')
    .description('Fetch and print the current authenticated session')
    .option('--json', 'Output JSON')
    .action(async (options: { json?: boolean }) => {
      const state = await loadCliState();
      const response = await apiRequest<SessionStatusResponse>(state, {
        path: '/v1/auth/session',
      });
      const parsed = sessionStatusResponseSchema.parse(response.data);

      await updateCliState({
        session: parsed.session,
      });

      printCommandResult(
        {
          action: 'session',
          success: true,
          summary: parsed.session
            ? `Authenticated as ${parsed.session.member.handle}`
            : 'Not authenticated',
          artifacts: parsed.session
            ? [{ id: parsed.session.sessionId, title: parsed.session.member.handle }]
            : [],
          nextSteps: [],
        },
        parsed,
        state,
        options,
        ({ session }) =>
          session
            ? [
                'Authenticated: yes',
                `User: ${session.member.handle}`,
                `Security level: ${session.member.securityLevel}`,
                `Active team: ${session.activeTeam?.name ?? 'none'}`,
              ].join('\n')
            : 'Authenticated: no',
      );
    });
}
