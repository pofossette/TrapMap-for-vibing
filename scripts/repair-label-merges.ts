import { runLabelMergeRepair, runLabelRunnerMain } from './label-runner.js';

const isEntrypoint = process.argv[1]?.endsWith('/repair-label-merges.ts') ?? false;

if (isEntrypoint) {
  await runLabelRunnerMain(
    () => runLabelMergeRepair(process.argv.includes('--dry-run')),
    'Merge repair',
  );
}
