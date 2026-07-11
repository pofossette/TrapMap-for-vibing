import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  listDevTargetNames,
  resolveDevTargetFromRegistry,
  type DevTargetDefinition,
} from './backend-target-registry';

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
    const message = error instanceof Error ? error.message : String(error);
    const isUsageError = message.startsWith('Usage:');
    const stream = isUsageError ? process.stdout : process.stderr;
    stream.write(`${message}\n`);
    process.exit(isUsageError ? 0 : 1);
    return;
  }

  const child = spawn('pnpm', buildDevCommandArgs(target), {
    stdio: 'inherit',
    env: { ...process.env, ...target.env },
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });

  child.on('error', (error) => {
    console.error(`[dev] Failed to start pnpm: ${error.message}`);
    process.exit(1);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
