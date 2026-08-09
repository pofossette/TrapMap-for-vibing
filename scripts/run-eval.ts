import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

type EvalTier = 'smoke' | 'core';
type EvalMode = 'live' | 'dry-run';

export type EvalSuite =
  | 'smoke'
  | 'core'
  | 'all'
  | 'retrieval'
  | 'summary'
  | 'agent-planning'
  | 'label-alignment'
  | 'graph-extraction'
  | 'ingestion';

export interface ResolvedEvalTarget {
  scriptPath: string;
  args: string[];
}

interface ParsedEvalOptions {
  dryRun: boolean;
  json: boolean;
  jsonPath?: string;
  mode?: EvalMode;
  platform?: 'noop' | 'json-archive' | 'langfuse';
  platformOutputDir?: string;
  tier?: EvalTier;
  runner?: 'native' | 'promptfoo';
}

const EVAL_USAGE = [
  'Usage: pnpm eval -- <suite> [options]',
  '',
  'Suites:',
  '  smoke',
  '  core',
  '  all',
  '  retrieval',
  '  summary',
  '  agent-planning',
  '  label-alignment',
  '  graph-extraction',
  '  ingestion',
  '',
  'Options:',
  '  --tier <smoke|core>',
  '  --mode <live|dry-run>',
  '  --runner <native|promptfoo>',
  '  --dry-run',
  '  --json',
  '  --json-path <path>',
  '  --platform <noop|json-archive|langfuse>',
  '  --platform-output-dir <path>',
].join('\n');

const SUITE_SCRIPTS = {
  all: 'evals/scripts/eval-all.ts',
  retrieval: 'evals/retrieval/run.ts',
  summary: 'evals/summary/run.ts',
  'agent-planning': 'evals/agent-planning/run.ts',
  'label-alignment': 'evals/label-alignment/run.ts',
  'graph-extraction': 'evals/graph-extraction/run.ts',
  ingestion: 'evals/ingestion/run.ts',
} as const;

function assertEvalSuite(value: string): asserts value is EvalSuite {
  if (
    value !== 'smoke' &&
    value !== 'core' &&
    value !== 'all' &&
    value !== 'retrieval' &&
    value !== 'summary' &&
    value !== 'agent-planning' &&
    value !== 'label-alignment' &&
    value !== 'graph-extraction' &&
    value !== 'ingestion'
  ) {
    throw new Error(`Unknown eval suite: ${value}\n\n${EVAL_USAGE}`);
  }
}

function parseEvalOptions(argv: readonly string[]): ParsedEvalOptions {
  const options: ParsedEvalOptions = {
    dryRun: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--tier') {
      const value = argv[index + 1];
      if (value !== 'smoke' && value !== 'core') {
        throw new Error(`Invalid --tier value: ${value ?? '<missing>'}\n\n${EVAL_USAGE}`);
      }
      options.tier = value;
      index += 1;
      continue;
    }

    if (arg === '--mode') {
      const value = argv[index + 1];
      if (value !== 'live' && value !== 'dry-run') {
        throw new Error(`Invalid --mode value: ${value ?? '<missing>'}\n\n${EVAL_USAGE}`);
      }
      options.mode = value;
      index += 1;
      continue;
    }

    if (arg === '--runner') {
      const value = argv[index + 1];
      if (value !== 'native' && value !== 'promptfoo') {
        throw new Error(`Invalid --runner value: ${value ?? '<missing>'}\n\n${EVAL_USAGE}`);
      }
      options.runner = value;
      index += 1;
      continue;
    }

    if (arg === '--json-path') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`Missing --json-path value\n\n${EVAL_USAGE}`);
      }
      options.jsonPath = value;
      index += 1;
      continue;
    }

    if (arg === '--platform') {
      const value = argv[index + 1];
      if (value !== 'noop' && value !== 'json-archive' && value !== 'langfuse') {
        throw new Error(`Invalid --platform value: ${value ?? '<missing>'}\n\n${EVAL_USAGE}`);
      }
      options.platform = value;
      index += 1;
      continue;
    }

    if (arg === '--platform-output-dir') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`Missing --platform-output-dir value\n\n${EVAL_USAGE}`);
      }
      options.platformOutputDir = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown eval option: ${arg}\n\n${EVAL_USAGE}`);
  }

  return options;
}

function buildAggregateArgs(tier: EvalTier, options: ParsedEvalOptions): string[] {
  const args = ['--tier', tier];
  if (options.dryRun) {
    args.push('--dry-run');
  }
  if (options.json) {
    args.push('--json');
  }
  if (options.jsonPath) {
    args.push('--json-path', options.jsonPath);
  }
  if (options.platform) {
    args.push('--platform', options.platform);
  }
  if (options.platformOutputDir) {
    args.push('--platform-output-dir', options.platformOutputDir);
  }
  return args;
}

function buildSuiteArgs(
  suite: Exclude<EvalSuite, 'smoke' | 'core' | 'all'>,
  options: ParsedEvalOptions,
): string[] {
  const args: string[] = [];

  if (suite === 'graph-extraction' || suite === 'ingestion') {
    // These runners still expose the historical boolean smoke flag instead of tiered CLI args.
    if (options.tier === 'smoke') {
      args.push('--smoke');
    }
    if (options.dryRun) {
      args.push('--dry-run');
    }
    if (options.runner) {
      args.push('--runner', options.runner);
    }
    return args;
  }

  args.push('--tier', options.tier ?? 'smoke');

  if (options.mode) {
    args.push('--mode', options.mode);
  }

  if (options.dryRun) {
    args.push('--dry-run');
  }

  if ((suite === 'agent-planning' || suite === 'label-alignment') && options.runner) {
    args.push('--runner', options.runner);
  }

  return args;
}

export function resolveEvalTarget(argv: readonly string[]): ResolvedEvalTarget {
  const normalizedArgv = argv[0] === '--' ? argv.slice(1) : argv;
  const [suiteName, ...optionArgs] = normalizedArgv;

  if (!suiteName || suiteName === '--help' || suiteName === '-h') {
    throw new Error(EVAL_USAGE);
  }

  assertEvalSuite(suiteName);
  const options = parseEvalOptions(optionArgs);
  const isAggregateSuite = suiteName === 'smoke' || suiteName === 'core' || suiteName === 'all';

  if (!isAggregateSuite && (options.platform || options.platformOutputDir)) {
    throw new Error(
      `--platform and --platform-output-dir are only supported for aggregate suites (smoke, core, all)\n\n${EVAL_USAGE}`,
    );
  }

  if (isAggregateSuite && options.platformOutputDir && !options.platform) {
    throw new Error(`--platform-output-dir requires --platform\n\n${EVAL_USAGE}`);
  }

  if (suiteName === 'smoke' || suiteName === 'core') {
    return {
      scriptPath: SUITE_SCRIPTS.all,
      args: buildAggregateArgs(suiteName, options),
    };
  }

  if (suiteName === 'all') {
    return {
      scriptPath: SUITE_SCRIPTS.all,
      args: buildAggregateArgs(options.tier ?? 'core', options),
    };
  }

  return {
    scriptPath: SUITE_SCRIPTS[suiteName],
    args: buildSuiteArgs(suiteName, options),
  };
}

export function buildEvalCommandArgs(target: ResolvedEvalTarget): string[] {
  return ['exec', 'tsx', '--tsconfig', 'tsconfig.base.json', target.scriptPath, ...target.args];
}

async function main(): Promise<void> {
  let target: ResolvedEvalTarget;
  try {
    target = resolveEvalTarget(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isUsageError = message.startsWith('Usage:');
    const stream = isUsageError ? process.stdout : process.stderr;
    stream.write(`${message}\n`);
    process.exit(isUsageError ? 0 : 1);
    return;
  }

  const child = spawn('pnpm', buildEvalCommandArgs(target), {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 1);
  });

  child.on('error', (error) => {
    console.error(`[eval] Failed to start pnpm: ${error.message}`);
    process.exit(1);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
