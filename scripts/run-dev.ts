import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export interface ResolvedDevTarget {
  env?: Record<string, string>;
  packageName: string;
  scriptName: string;
}

const DEV_TARGETS = {
  'local-agent': {
    env: { TRAPMAP_DEPLOYMENT_PROFILE: 'local-agent' },
    packageName: '@trapmap/host-local',
    scriptName: 'dev',
  },
  'team-monolith': {
    env: { TRAPMAP_DEPLOYMENT_PROFILE: 'team-monolith' },
    packageName: '@trapmap/host-local',
    scriptName: 'dev',
  },
  gateway: {
    packageName: '@trapmap/host-distributed',
    scriptName: 'dev:gateway',
  },
  'candidate-worker': {
    packageName: '@trapmap/host-distributed',
    scriptName: 'dev:candidate-ingestion',
  },
  'governance-worker': {
    packageName: '@trapmap/host-distributed',
    scriptName: 'dev:governance-review',
  },
  'outbox-worker': {
    packageName: '@trapmap/host-distributed',
    scriptName: 'dev:job-runtime',
  },
  // Keep the older distributed:* shape working while docs and operators move to pnpm dev -- <target>.
  'distributed:gateway': {
    packageName: '@trapmap/host-distributed',
    scriptName: 'dev:gateway',
  },
  'distributed:candidate-worker': {
    packageName: '@trapmap/host-distributed',
    scriptName: 'dev:candidate-ingestion',
  },
  'distributed:governance-worker': {
    packageName: '@trapmap/host-distributed',
    scriptName: 'dev:governance-review',
  },
  'distributed:outbox-worker': {
    packageName: '@trapmap/host-distributed',
    scriptName: 'dev:job-runtime',
  },
} as const satisfies Record<string, ResolvedDevTarget>;

const DEV_USAGE = [
  'Usage: pnpm dev -- <target>',
  '',
  'Targets:',
  '  local-agent',
  '  team-monolith',
  '  gateway',
  '  candidate-worker',
  '  governance-worker',
  '  outbox-worker',
  '',
  'Compatibility targets:',
  '  distributed:gateway',
  '  distributed:candidate-worker',
  '  distributed:governance-worker',
  '  distributed:outbox-worker',
].join('\n');

export function resolveDevTarget(argv: readonly string[]): ResolvedDevTarget {
  const normalizedArgv = argv[0] === '--' ? argv.slice(1) : argv;
  const [targetName] = normalizedArgv;

  if (!targetName || targetName === '--help' || targetName === '-h') {
    throw new Error(DEV_USAGE);
  }

  const target = DEV_TARGETS[targetName];
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
