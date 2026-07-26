import { runLabelBackfill, runLabelRunnerMain } from './label-runner.js';

const isEntrypoint = process.argv[1]?.endsWith('/backfill-labels.ts') ?? false;

if (isEntrypoint) {
  await runLabelRunnerMain(() => runLabelBackfill(process.argv.includes('--dry-run')), 'Backfill');
}
