import { parseArgs } from 'node:util';

import { formatRunResult } from './core.js';

function parseRunArgs(): {
  tier: 'smoke' | 'core';
  mode: 'dry-run' | 'live';
  json: boolean;
  runner: 'native' | 'promptfoo';
} {
  const { values } = parseArgs({
    options: {
      tier: { type: 'string', default: 'smoke' },
      mode: { type: 'string', default: 'dry-run' },
      json: { type: 'boolean', default: false },
      runner: { type: 'string', default: 'promptfoo' },
    },
    strict: true,
  });

  const tier = values.tier === 'core' ? 'core' : 'smoke';
  const mode = values.mode === 'live' ? 'live' : 'dry-run';
  const runner = values.runner ?? 'promptfoo';
  if (runner !== 'native' && runner !== 'promptfoo') {
    throw new Error(`Invalid --runner value: ${runner}`);
  }

  return { tier, mode, json: values.json, runner };
}

async function main() {
  const options = parseRunArgs();

  const { runSuiteWithPromptfoo } = await import('../promptfoo/runner.js');
  const { labelAlignmentBridge } = await import('./bridge.js');
  const { report } = await runSuiteWithPromptfoo(labelAlignmentBridge, {
    tier: options.tier,
    dryRun: options.mode === 'dry-run',
    allowEmpty: false,
    runner: 'promptfoo',
    mode: options.mode,
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(formatRunResult(report));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
