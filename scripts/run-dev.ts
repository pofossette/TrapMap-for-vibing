import { fileURLToPath } from 'node:url';
import {
  type DevTargetDefinition,
  listDevTargetNames,
  resolveDevTargetFromRegistry,
} from './backend-target-registry';
import { exitWithResolveError, spawnPnpmAndExit } from './lib/spawn-pnpm.js';

export type ResolvedDevTarget = DevTargetDefinition;

const DEV_USAGE = [
  'Usage: pnpm dev -- <target>',
  '',
  'Targets:',
  ...listDevTargetNames()
    .filter((targetName) => !targetName.startsWith('distributed:'))
    .map((targetName) => `  ${targetName}`),
  '',
  'Compatibility targets:',
  ...listDevTargetNames()
    .filter((targetName) => targetName.startsWith('distributed:'))
    .map((targetName) => `  ${targetName}`),
].join('\n');

export function resolveDevTarget(argv: readonly string[]): ResolvedDevTarget {
  const normalizedArgv = argv[0] === '--' ? argv.slice(1) : argv;
  const [targetName] = normalizedArgv;

  if (!targetName || targetName === '--help' || targetName === '-h') {
    throw new Error(DEV_USAGE);
  }

  const target = resolveDevTargetFromRegistry(targetName);
  if (!target) {
    throw new Error(`Unknown dev target: ${targetName}\n\n${DEV_USAGE}`);
  }

  return target;
}

export function buildDevCommandArgs(target: ResolvedDevTarget): string[] {
  return ['--filter', target.packageName, target.scriptName];
}

async function main(): Promise<void> {
  let target: ResolvedDevTarget;
  try {
    target = resolveDevTarget(process.argv.slice(2));
  } catch (error) {
    exitWithResolveError(error, 'Usage:');
    return;
  }

  spawnPnpmAndExit({
    args: buildDevCommandArgs(target),
    label: 'dev',
    startErrorMessage: 'Failed to start pnpm',
    env: { ...process.env, ...target.env },
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
