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

import { parseArgs } from 'node:util';

import type { ArtifactBundle } from '@trapmap/contracts';

import {
  buildDerivationContext,
  bundleToPayloads,
  loadDownloadedBundles,
  makeDeterministicId,
} from './adapter.js';
import { runAssertions } from './assertions.js';
import type { DerivedOutput } from './assertions.js';
import { derivationFixtures, getSmokeFixtures } from './fixtures/index.js';
import type { DerivationFixture } from './fixtures/index.js';
import { aggregateMetrics, formatDerivationReport } from './metrics.js';

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface RunOptions {
  dryRun: boolean;
  smoke: boolean;
  verbose: boolean;
}

function parseArgs_(): RunOptions {
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
    verbose: values.verbose ?? false,
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

  // Load bundles
  let bundles: Array<{ id: string; bundle: ArtifactBundle }>;

  if (options.dryRun) {
    const fixtures = options.smoke ? getSmokeFixtures() : derivationFixtures;
    bundles = fixtures.map((f: DerivationFixture) => ({ id: f.id, bundle: f.bundle }));
  } else {
    const downloaded = loadDownloadedBundles();
    const subset = options.smoke ? downloaded.slice(0, 5) : downloaded;
    bundles = subset.map((b: ArtifactBundle) => ({ id: b.slug, bundle: b }));
  }

  console.log(`Running ${bundles.length} bundle(s)...`);
  console.log('');

  // Dynamic import of deriveFromPayloads (avoids loading server modules at top level)
  const { deriveFromPayloads } = await import('../../packages/server/src/lib/artifacts/derive.js');

  // Evaluate each bundle
  const results = [];
  const capsuleCounts: number[] = [];

  for (const { id, bundle } of bundles) {
    const artifactId = makeDeterministicId(bundle.slug);
    const payloads = bundleToPayloads(bundle, artifactId);
    const context = buildDerivationContext(bundle, artifactId);

    const output: DerivedOutput = (await deriveFromPayloads(payloads, context)) as DerivedOutput;
    const result = runAssertions(id, bundle, output);

    results.push(result);
    capsuleCounts.push(output.capsules.length);

    if (options.verbose) {
      const status = result.passed ? 'PASS' : 'FAIL';
      console.log(
        `  [${status}] ${result.fixtureId}: ${output.capsules.length} capsule(s), summary=${output.profile?.summary?.length ?? 0} chars`,
      );
    }
  }

  // Compute and display metrics
  const metrics = aggregateMetrics(results, capsuleCounts);
  const report = formatDerivationReport(results, metrics, options.dryRun);
  console.log(report);

  // Exit code
  const allPassed = results.every((r) => r.passed);
  if (!allPassed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
