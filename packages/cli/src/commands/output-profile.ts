import type { Command } from 'commander';

import {
  type OutputGraphPlanMode,
  type OutputModelHint,
  type OutputToolProfile,
  type OutputVerbosity,
  getDefaultOutputProfile,
  loadCliState,
  updateCliState,
} from '@trapmap/cli/lib/config.js';

export function registerOutputProfileCommands(program: Command): void {
  const output = program
    .command('output')
    .description('Manage local CLI output rendering profiles');
  const profile = output
    .command('profile')
    .description('Inspect or update output profile settings');

  profile
    .command('show')
    .description('Show the current output profile')
    .action(async () => {
      const state = await loadCliState();
      console.log(JSON.stringify(state.outputProfile ?? getDefaultOutputProfile(), null, 2));
    });

  profile
    .command('set')
    .description('Set local output profile options')
    .requiredOption('--tool <tool>', 'Target tool profile')
    .option('--model <hint>', 'Optional model hint')
    .option('--verbosity <level>', 'Verbosity level')
    .option('--graph-plan-mode <mode>', 'Graph plan rendering mode')
    .action(
      async (flags: {
        tool: OutputToolProfile;
        model?: OutputModelHint;
        verbosity?: OutputVerbosity;
        graphPlanMode?: OutputGraphPlanMode;
      }) => {
        const next = await updateCliState((current) => ({
          ...current,
          outputProfile: {
            ...(current.outputProfile ?? getDefaultOutputProfile()),
            tool: flags.tool,
            modelHint: flags.model ?? current.outputProfile?.modelHint ?? 'generic',
            verbosity: flags.verbosity ?? current.outputProfile?.verbosity ?? 'balanced',
            graphPlanMode: flags.graphPlanMode ?? current.outputProfile?.graphPlanMode ?? 'summary',
          },
        }));

        console.log(JSON.stringify(next.outputProfile, null, 2));
      },
    );
}
