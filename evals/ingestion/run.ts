/**
 * Ingestion / Derivation Evaluation Runner
 *
 * Evaluates deriveFromPayloads() on real downloaded skills or bundled fixtures.
 * Deterministic — no LLM calls, no server, no database.
 *
 * Metrics:
 * - Assertion pass/fail per bundle (profile, capsules, clientManifest, etc.)
 * - Aggregate stats: pass rate, avg capsules, keyword coverage, etc.
 *
 * Usage:
 *   pnpm eval:ingestion
 *   pnpm eval:ingestion --dry-run
 *   pnpm eval:ingestion --smoke
 *   pnpm eval:ingestion --smoke --dry-run
 */

import { parseRunnerCliArgs } from '../lib/runner-cli.js';
import { loadDownloadedBundles } from './adapter.js';
import { derivationFixtures, getSmokeFixtures } from './fixtures/index.js';
import { formatDerivationReport } from './metrics.js';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface RunOptions {
  dryRun: boolean;
  smoke: boolean;
  verbose: boolean;
  runner?: 'native' | 'promptfoo';
}

function parseArgs_(): RunOptions {
  const parsed = parseRunnerCliArgs();
  return {
    dryRun: parsed.dryRun,
    smoke: parsed.smoke,
    verbose: parsed.verbose,
    runner: parsed.runner,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const options = parseArgs_();

  console.log('');
  console.log('=== Ingestion / Derivation Evaluation ===');
  console.log(`Mode: ${options.dryRun ? 'dry-run' : 'live'}`);
  console.log(`Smoke: ${options.smoke}`);
  console.log('');

  const bundleCount = options.dryRun
    ? (options.smoke ? getSmokeFixtures() : derivationFixtures).length
    : loadDownloadedBundles().length;
  console.log(`Running ${bundleCount} bundle(s)...`);
  console.log('');
  const { runSuiteWithPromptfoo } = await import('../promptfoo/runner.js');
  const { ingestionBridge } = await import('./bridge.js');
  const { report } = await runSuiteWithPromptfoo(ingestionBridge, {
    tier: options.smoke ? 'smoke' : 'core',
    dryRun: options.dryRun,
    allowEmpty: false,
    runner: 'promptfoo',
  });
  const assertionResults = report.results.map((r) => ({
    fixtureId: r.fixtureId,
    title: r.title,
    assertions: r.assertions,
    passed: r.passed,
  }));
  console.log(formatDerivationReport(assertionResults, report.aggregate, options.dryRun));
  if (!report.results.every((r) => r.passed)) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
