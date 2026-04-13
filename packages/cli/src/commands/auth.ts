import type { LoginResponse, SessionStatusResponse } from '@skill-shareer/contracts';
import { loginResponseSchema, sessionStatusResponseSchema } from '@skill-shareer/contracts';
import type { Command } from 'commander';

import { clearSession, loadCliState, updateCliState } from '../lib/config.js';
import { apiRequest } from '../lib/http.js';
import { printResult } from '../lib/output.js';

export function registerAuthCommands(program: Command): void {
  program
    .command('login')
    .description('Authenticate with an access key or system admin key')
    .option('--access-key <key>', 'Permanent access key for a member')
    .option('--system-admin-key <key>', 'System admin bootstrap key')
    .option('--server <url>', 'Override the saved server URL')
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
          ...(options.server ? { serverUrl: options.server } : {}),
        });

        const parsed = loginResponseSchema.parse(response.data);
        const serverUrl = options.server ?? state.serverUrl;

        await updateCliState({
          serverUrl,
          sessionToken: response.sessionToken,
          session: parsed.session,
        });

        printResult(parsed, options, ({ session }) =>
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

      if (state.sessionToken) {
        await apiRequest(state, {
          method: 'POST',
          path: '/v1/auth/logout',
        });
      }

      await clearSession();
      printResult({ ok: true }, options, () => 'Logged out');
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

      printResult(parsed, options, ({ session }) =>
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
