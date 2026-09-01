import { fileURLToPath } from 'node:url';

import { exitWithResolveError, spawnPnpmAndExit } from './lib/spawn-pnpm.js';

type EvalTier = 'smoke' | 'core';
type EvalMode = 'live' | 'dry-run' | 'baseline' | 'shadow' | 'serve';

export type EvalSuite =
  | 'smoke'
  | 'core'
  | 'all'
  | 'retrieval'
  | 'summary'
  | 'agent-planning'
  | 'label-alignment'
  | 'graph-extraction'
  | 'ingestion'
  | 'experience-gene';

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
  '  experience-gene',
  '',
  'Options:',
  '  --tier <smoke|core>                              (default: smoke)',
  '  --mode <live|dry-run>                            (retrieval/summary/label-alignment)',
  '  --mode <baseline|shadow|serve>                   (experience-gene; default: shadow)',
  '  --runner <native|promptfoo> (default: promptfoo)',
  '  --dry-run',
  '  --json',
  '  --json-path <path>',
  '  --platform <noop|json-archive|langfuse>',
  '  --platform-output-dir <path>',
  '  --help, -h                                       (show this help)',
  '',
  'Examples:',
  '  pnpm eval -- smoke --help                         (self-check)',
  '  pnpm eval -- smoke --tier smoke',
  '  pnpm eval -- experience-gene --tier smoke --mode shadow',
  '  pnpm eval -- experience-gene --tier core --mode serve',
  '  pnpm eval:experience-gene --tier smoke --mode shadow  (direct script)',
  '  pnpm eval:smoke                               (postgres-coordinated, requires Docker daemon)',
  '',
  'Notes:',
  '  Local pnpm eval:smoke requires Docker daemon (pgvector via postgres-coordinated).',
  '  CI (eval.yml) runs full pnpm eval:smoke + docker compose build candidate-worker outbox-worker + replicas=2 smoke wiring.',
].join('\n');

const SUITE_SCRIPTS = {
  all: 'evals/scripts/eval-all.ts',
  retrieval: 'evals/retrieval/run.ts',
  summary: 'evals/summary/run.ts',
  'agent-planning': 'evals/agent-planning/run.ts',
  'label-alignment': 'evals/label-alignment/run.ts',
  'graph-extraction': 'evals/graph-extraction/run.ts',
  ingestion: 'evals/ingestion/run.ts',
  'experience-gene': 'evals/experience-gene/run.ts',
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
    value !== 'ingestion' &&
    value !== 'experience-gene'
  ) {
    throw new Error(`Unknown eval suite: ${value}\n\n${EVAL_USAGE}`);
  }
}

interface OptionSpec {
  flag: string;
  /** 1 when the option consumes the next argv entry as its value. */
  takesValue: boolean;
  apply(options: ParsedEvalOptions, value: string | undefined): void;
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${flag} value\n\n${EVAL_USAGE}`);
  }
  return value;
}

function assertChoice<T extends string>(
  flag: string,
  value: string | undefined,
  choices: readonly T[],
): T {
  if (!value || !choices.includes(value as T)) {
    throw new Error(`Invalid ${flag} value: ${value ?? '<missing>'}\n\n${EVAL_USAGE}`);
  }
  return value as T;
}

const EVAL_OPTION_SPECS: readonly OptionSpec[] = [
  {
    flag: '--dry-run',
    takesValue: false,
    apply: (options) => {
      options.dryRun = true;
    },
  },
  {
    flag: '--json',
    takesValue: false,
    apply: (options) => {
      options.json = true;
    },
  },
  {
    flag: '--tier',
    takesValue: true,
    apply: (options, value) => {
      options.tier = assertChoice('--tier', value, ['smoke', 'core'] as const);
    },
  },
  {
    flag: '--mode',
    takesValue: true,
    apply: (options, value) => {
      options.mode = assertChoice('--mode', value, [
        'live',
        'dry-run',
        'baseline',
        'shadow',
        'serve',
      ] as const);
    },
  },
  {
    flag: '--runner',
    takesValue: true,
    apply: (options, value) => {
      options.runner = assertChoice('--runner', value, ['native', 'promptfoo'] as const);
    },
  },
  {
    flag: '--json-path',
    takesValue: true,
    apply: (options, value) => {
      options.jsonPath = requireValue('--json-path', value);
    },
  },
  {
    flag: '--platform',
    takesValue: true,
    apply: (options, value) => {
      options.platform = assertChoice('--platform', value, [
        'noop',
        'json-archive',
        'langfuse',
      ] as const);
    },
  },
  {
    flag: '--platform-output-dir',
    takesValue: true,
    apply: (options, value) => {
      options.platformOutputDir = requireValue('--platform-output-dir', value);
    },
  },
];

function parseEvalOptions(argv: readonly string[]): ParsedEvalOptions {
  const options: ParsedEvalOptions = {
    dryRun: false,
    json: false,
    // The native runners are gone; the promptfoo engine is the only engine, so
    // it is the default unless the caller explicitly overrides it.
    runner: 'promptfoo',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const spec = EVAL_OPTION_SPECS.find((candidate) => candidate.flag === arg);
    if (!spec) {
      throw new Error(`Unknown eval option: ${arg}\n\n${EVAL_USAGE}`);
    }
    spec.apply(options, spec.takesValue ? argv[index + 1] : undefined);
    index += spec.takesValue ? 1 : 0;
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

  if (suite === 'experience-gene') {
    // Gene runner uses --tier smoke|core and --mode baseline|shadow|serve (default shadow).
    args.push('--tier', options.tier ?? 'smoke');
    if (options.mode) {
      args.push('--mode', options.mode);
    }
    if (options.dryRun) {
      args.push('--dry-run');
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

  if (
    (suite === 'agent-planning' ||
      suite === 'label-alignment' ||
      suite === 'summary' ||
      suite === 'retrieval') &&
    options.runner
  ) {
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

  // `pnpm eval -- smoke --help` self-check: suite + help flag must render usage (exit 0).
  if (optionArgs.includes('--help') || optionArgs.includes('-h')) {
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
    exitWithResolveError(error, 'Usage:');
    return;
  }

  spawnPnpmAndExit({
    args: buildEvalCommandArgs(target),
    label: 'eval',
    startErrorMessage: 'Failed to start pnpm',
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
