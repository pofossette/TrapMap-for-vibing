/**
 * CLI commands for activation policy resolution.
 *
 * Demonstrates client-side effective policy computation using
 * resolveScriptEffectivePolicy from the activation-policy module.
 */

import type { ScriptActivationPolicy, ScriptWithPolicyMetadata } from '@trapmap/contracts';
import type { Command } from 'commander';

import {
  explainEffectivePolicy,
  getPolicyDescription,
  resolveScriptEffectivePolicy,
} from '@trapmap/cli/lib/activation-policy.js';

interface PolicyCommandOptions {
  allowSearch: boolean;
}

export function registerPolicyCommands(program: Command, options: PolicyCommandOptions): void {
  if (!options.allowSearch) return;

  const policy = program.command('policy').description('Activation policy resolution utilities');

  policy
    .command('resolve')
    .description('Compute the effective activation policy for a script')
    .requiredOption(
      '--default-policy <policy>',
      'Server default policy (blocked, reference-only, needs-approval, client-executable)',
    )
    .option(
      '--override-policy <policy>',
      'Local override policy (blocked, reference-only, needs-approval, client-executable)',
    )
    .option('--path <path>', 'Script path (for display)', 'scripts/example.sh')
    .option('--capability <capability>', 'Script capability (for display)', 'Example script')
    .option('--json', 'Output raw JSON instead of formatted text')
    .action(
      (flags: {
        defaultPolicy: string;
        overridePolicy?: string;
        path: string;
        capability: string;
        json?: boolean;
      }) => {
        const validPolicies: ScriptActivationPolicy[] = [
          'blocked',
          'reference-only',
          'needs-approval',
          'client-executable',
        ];

        if (!validPolicies.includes(flags.defaultPolicy as ScriptActivationPolicy)) {
          throw new Error(
            `Invalid --default-policy: "${flags.defaultPolicy}". Must be one of: ${validPolicies.join(', ')}`,
          );
        }

        if (
          flags.overridePolicy &&
          !validPolicies.includes(flags.overridePolicy as ScriptActivationPolicy)
        ) {
          throw new Error(
            `Invalid --override-policy: "${flags.overridePolicy}". Must be one of: ${validPolicies.join(', ')}`,
          );
        }

        const metadata: ScriptWithPolicyMetadata = {
          path: flags.path,
          sha256: '0'.repeat(64),
          capability: flags.capability,
          defaultPolicy: flags.defaultPolicy as ScriptActivationPolicy,
        };

        const override = flags.overridePolicy
          ? {
              path: metadata.path,
              sha256: metadata.sha256,
              overridePolicy: flags.overridePolicy as ScriptActivationPolicy,
            }
          : null;

        const effective = resolveScriptEffectivePolicy(metadata, override);

        if (flags.json) {
          console.log(
            JSON.stringify(
              {
                script: { path: metadata.path, capability: metadata.capability },
                serverDefault: metadata.defaultPolicy,
                localOverride: override?.overridePolicy ?? null,
                effectivePolicy: effective,
                description: getPolicyDescription(effective),
                explanation: explainEffectivePolicy(
                  metadata.defaultPolicy,
                  override?.overridePolicy ?? null,
                ),
              },
              null,
              2,
            ),
          );
          return;
        }

        console.log(`Script: ${metadata.path}`);
        console.log(`Capability: ${metadata.capability}`);
        console.log(`Server default: ${metadata.defaultPolicy}`);
        console.log(`Local override: ${override?.overridePolicy ?? '(none)'}`);
        console.log(`Effective policy: ${effective}`);
        console.log(`Description: ${getPolicyDescription(effective)}`);
        console.log('');
        console.log(
          explainEffectivePolicy(metadata.defaultPolicy, override?.overridePolicy ?? null),
        );
      },
    );
}
