import { parseArgs } from 'node:util';

import { formatRunResult, runLabelAlignmentSuite } from './core.js';

function parseRunArgs(): {
  tier: 'smoke' | 'core';
  mode: 'dry-run' | 'live';
  json: boolean;
} {
  const { values } = parseArgs({
    options: {
      tier: { type: 'string', default: 'smoke' },
      mode: { type: 'string', default: 'dry-run' },
      json: { type: 'boolean', default: false },
    },
    strict: true,
  });

  const tier = values.tier === 'core' ? 'core' : 'smoke';
  const mode = values.mode === 'live' ? 'live' : 'dry-run';

  return { tier, mode, json: values.json };
}

async function main() {
  const options = parseRunArgs();
  const report = await runLabelAlignmentSuite(options);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(formatRunResult(report));
}

void main();
