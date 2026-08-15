import { parseArgs } from 'node:util';

export interface RunnerCliResult {
  dryRun: boolean;
  runner: 'native' | 'promptfoo';
  smoke: boolean;
  verbose: boolean;
}

export function resolveRunnerValue(value: string | undefined): 'native' | 'promptfoo' {
  const runner = value ?? 'promptfoo';
  if (runner !== 'native' && runner !== 'promptfoo') {
    console.error(`Invalid --runner value: ${runner}`);
    process.exit(1);
  }
  return runner;
}

export function parseRunnerCliArgs(): RunnerCliResult {
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', short: 'd', default: false },
      smoke: { type: 'boolean', short: 's', default: false },
      verbose: { type: 'boolean', short: 'v', default: false },
      runner: { type: 'string', default: 'promptfoo' },
    },
    strict: true,
  });
  const runner = resolveRunnerValue(values.runner);
  return {
    dryRun: values['dry-run'] ?? false,
    smoke: values.smoke ?? false,
    verbose: values.verbose ?? false,
    runner,
  };
}

export function loadAndFilterCases<T>(
  load: (tier: 'smoke' | 'core') => T[],
  filter: (cases: T[], endpoint?: string) => T[],
  options: {
    allowEmpty: boolean;
    endpoint?: string;
    tier: 'smoke' | 'core';
  },
): T[] {
  let cases: T[];
  try {
    cases = load(options.tier);
  } catch (error) {
    console.error('Failed to load cases:', error);
    process.exit(1);
  }
  cases = filter(cases, options.endpoint);
  if (cases.length === 0) {
    if (options.allowEmpty) {
      console.log('No cases found. Exiting successfully (allow-empty mode).\n');
      process.exit(0);
    }
    console.error(`No cases found for tier '${options.tier}'. Use --allow-empty to skip.`);
    process.exit(1);
  }
  return cases;
}
