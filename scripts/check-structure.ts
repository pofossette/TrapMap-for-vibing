/**
 * Consolidated structure guard (check:structure).
 *
 * Merges the directory-structure guard, the architecture freeze guard and the
 * stale-package-reference guard into one command. Each sub-check keeps its own
 * distinct output prefix and exit classification for failure localization.
 */

import { type CheckStep, runCheckSteps } from './lib/check-runner.js';

const steps: CheckStep[] = [
  {
    name: 'structure-guard',
    command: 'node',
    args: ['scripts/check-structure.mjs'],
  },
  {
    name: 'arch-freeze',
    command: 'pnpm',
    args: ['exec', 'tsx', 'scripts/check-arch-freeze.ts'],
  },
  {
    name: 'stale-package-refs',
    command: 'pnpm',
    args: ['exec', 'tsx', 'scripts/check-stale-package-refs.ts'],
  },
];

const result = await runCheckSteps(steps);
process.exitCode = result.ok ? 0 : 1;
