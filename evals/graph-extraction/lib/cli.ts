import { parseArgs } from 'node:util';

export interface EvalCliOptions {
  dryRun: boolean;
  smoke: boolean;
  verbose: number;
}

export function parseEvalCliArgs(): EvalCliOptions {
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', short: 'd', default: false },
      smoke: { type: 'boolean', short: 's', default: false },
      verbose: { type: 'boolean', short: 'v', default: false },
    },
    strict: true,
  });
  return {
    dryRun: values['dry-run'] ?? false,
    smoke: values.smoke ?? false,
    verbose: values.verbose ? 1 : 0,
  };
}
