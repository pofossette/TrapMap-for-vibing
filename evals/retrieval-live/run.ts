/**
 * Live Retrieval Evaluation Runner
 *
 * Runs retrieval eval cases against a real TrapMap backend instance
 * with a named snapshot version restored into the test database.
 *
 * Usage:
 *   pnpm eval:retrieval:live --snapshot-version 2026-07-baseline --base-url http://localhost:3000
 *   pnpm eval:retrieval:live --snapshot-version 2026-07-baseline --base-url http://localhost:3000 --tier smoke --endpoint /v2/retrieval/search
 *   pnpm eval:retrieval:live --snapshot-version 2026-07-baseline --base-url http://localhost:3000 --json --json-path ./reports/live.json
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { type RetrievalEvalCase, retrievalEvalCaseSchema } from '../types/index.js';

import { evaluateGovernance } from '../retrieval/lib/governance.js';
import { calculateMetrics } from '../retrieval/lib/metrics.js';
import { executeLiveRequest } from './lib/backend-client.js';
import {
  detectServiceProfile,
  restoreSnapshot,
  verifyServiceProfile,
} from './lib/snapshot-orchestrator.js';
import type { LiveCaseResult, LiveEvalCase, LiveRunnerOptions } from './lib/types.js';

// =============================================================================
// Dataset Loading
// =============================================================================

import { v2CapsuleLiveSmokeCases } from './datasets/smoke/v2-capsule-live.js';
import { v3GraphPlanLiveSmokeCases } from './datasets/smoke/v3-graph-plan-live.js';

function loadLiveCases(tier: 'smoke' | 'core'): LiveEvalCase[] {
  const rawCases: Array<RetrievalEvalCase & { stability: string }> =
    tier === 'smoke'
      ? [...v2CapsuleLiveSmokeCases, ...v3GraphPlanLiveSmokeCases]
      : // Core cases will be added later
        [...v2CapsuleLiveSmokeCases, ...v3GraphPlanLiveSmokeCases];

  const validated: LiveEvalCase[] = [];
  for (const raw of rawCases) {
    const parsed = retrievalEvalCaseSchema.parse(raw);
    validated.push({
      ...parsed,
      stability: (raw.stability as 'stable' | 'version-sensitive') ?? 'stable',
    });
  }

  return validated;
}

// =============================================================================
// CLI Argument Parsing
// =============================================================================

function parseArgs_(): LiveRunnerOptions {
  const { values } = parseArgs({
    options: {
      'snapshot-version': { type: 'string', short: 's' },
      'base-url': { type: 'string', short: 'b' },
      tier: { type: 'string', short: 't', default: 'smoke' },
      endpoint: { type: 'string', short: 'p' },
      'dry-run': { type: 'boolean', short: 'd', default: false },
      'allow-empty': { type: 'boolean', short: 'e', default: false },
      json: { type: 'boolean', short: 'j', default: false },
      'json-path': { type: 'string' },
      verbose: { type: 'boolean', short: 'v', default: false },
      'database-url': { type: 'string' },
      'auth-token': { type: 'string' },
    },
    strict: true,
  });

  if (!values['snapshot-version']) {
    console.error('Error: --snapshot-version is required');
    process.exit(1);
  }
  if (!values['base-url']) {
    console.error('Error: --base-url is required');
    process.exit(1);
  }

  const tier = values.tier as 'smoke' | 'core';
  if (tier !== 'smoke' && tier !== 'core') {
    console.error(`Invalid tier: ${tier}. Must be 'smoke' or 'core'.`);
    process.exit(1);
  }

  const endpoint = values.endpoint as LiveRunnerOptions['endpoint'];
  if (
    endpoint &&
    endpoint !== '/v1/retrieval/search' &&
    endpoint !== '/v2/retrieval/search' &&
    endpoint !== '/v3/retrieval/search'
  ) {
    console.error(`Invalid endpoint: ${endpoint}`);
    process.exit(1);
  }

  const databaseUrl =
    values['database-url'] ??
    process.env.TRAPMAP_LIVE_EVAL_DATABASE_URL ??
    process.env.TRAPMAP_DATABASE_URL ??
    '';
  const authToken = values['auth-token'] ?? process.env.TRAPMAP_LIVE_EVAL_TOKEN ?? '';

  // Only require database URL and auth token when not in dry-run mode
  const isDryRun = values['dry-run'] ?? false;
  if (!isDryRun) {
    if (!databaseUrl) {
      console.error(
        'Error: Database URL required. Set TRAPMAP_LIVE_EVAL_DATABASE_URL or use --database-url',
      );
      process.exit(1);
    }
    if (!authToken) {
      console.error('Error: Auth token required. Set TRAPMAP_LIVE_EVAL_TOKEN or use --auth-token');
      process.exit(1);
    }
  }

  return {
    snapshotVersion: values['snapshot-version']!,
    baseUrl: values['base-url']!,
    tier,
    endpoint,
    dryRun: values['dry-run'] ?? false,
    allowEmpty: values['allow-empty'] ?? false,
    json: values.json ?? false,
    jsonPath: values['json-path'],
    verbose: values.verbose ? 1 : 0,
    databaseUrl,
    authToken,
  };
}

// =============================================================================
// Execution
// =============================================================================

/**
 * Execute all live cases against the backend.
 */
async function executeAllLiveCases(
  cases: LiveEvalCase[],
  options: LiveRunnerOptions,
): Promise<LiveCaseResult[]> {
  const results: LiveCaseResult[] = [];
  const client = { baseUrl: options.baseUrl, authToken: options.authToken };

  for (const case_ of cases) {
    console.log(`  Running: ${case_.caseId} [${case_.endpoint}] ...`);

    try {
      const { result, execution } = await executeLiveRequest(client, case_);

      // Warn on HTTP errors but don't crash
      const warnings: LiveCaseResult['warnings'] = [];
      if (execution.statusCode >= 500) {
        warnings.push({
          code: 'server-error',
          message: `Backend returned ${execution.statusCode}`,
          degraded: true,
        });
      } else if (execution.statusCode >= 400) {
        warnings.push({
          code: 'client-error',
          message: `Request failed with ${execution.statusCode}`,
          degraded: false,
        });
      }

      // Governance check
      const governance = evaluateGovernance(case_, result);

      // Metrics
      const metrics = calculateMetrics(
        result,
        case_.expected.relevance.relevantIds,
        case_.expected.relevance.idealOrder,
      );

      // Outcome match
      const expectedEmpty = case_.expected.outcome === 'empty';
      const outcomeMatch = expectedEmpty === result.isEmpty;

      // Only stable assertions cause failure
      const passed = case_.stability === 'stable' ? governance.passed && outcomeMatch : true;

      results.push({
        case: case_,
        result,
        execution,
        governance,
        metrics,
        passed,
        warnings,
      });

      const status = passed ? 'PASS' : 'FAIL';
      const hitAt1Str = metrics.hitAt1 > 0 ? `Hit@1=${metrics.hitAt1.toFixed(2)}` : 'no-hit';
      console.log(`    ${status} (${hitAt1Str}, ${execution.durationMs}ms)`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`    ERROR: ${errorMessage}`);

      results.push({
        case: case_,
        result: {
          hits: [],
          returnedIds: [],
          buckets: { globalConstraints: [], projectKnowledge: [] },
          profileHintArtifactIds: [],
          isEmpty: true,
          rawResponse: { error: errorMessage },
          endpoint: case_.endpoint,
        },
        execution: {
          backendBaseUrl: options.baseUrl,
          statusCode: 0,
          durationMs: 0,
          endpoint: case_.endpoint,
          fallbackApplied: false,
        },
        governance: { passed: false, failures: [], forbiddenHits: [] },
        metrics: { hitAt1: 0, hitAt5: 0, hitAt10: 0, mrr: 0, ndcg: 0, recallAt10: 0 },
        passed: false,
        warnings: [{ code: 'execution-error', message: errorMessage, degraded: true }],
      });
    }
  }

  return results;
}

// =============================================================================
// Report Printing
// =============================================================================

function printSummary(results: LiveCaseResult[]): void {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  const passRate = results.length > 0 ? passed / results.length : 0;

  console.log('\n=== Live Evaluation Summary ===');
  console.log(`Total cases: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Pass rate: ${(passRate * 100).toFixed(1)}%`);

  // Group by endpoint
  const byEndpoint = new Map<string, LiveCaseResult[]>();
  for (const r of results) {
    const existing = byEndpoint.get(r.case.endpoint) ?? [];
    existing.push(r);
    byEndpoint.set(r.case.endpoint, existing);
  }

  console.log('\n=== Endpoint Metrics ===');
  for (const [endpoint, endpointResults] of byEndpoint) {
    const avgHitAt1 =
      endpointResults.reduce((sum, r) => sum + r.metrics.hitAt1, 0) / endpointResults.length;
    const avgMrr =
      endpointResults.reduce((sum, r) => sum + r.metrics.mrr, 0) / endpointResults.length;
    const govFailures = endpointResults.filter((r) => !r.governance.passed).length;

    console.log(`\n${endpoint}`);
    console.log(`  Cases: ${endpointResults.length}`);
    console.log(`  Avg Hit@1: ${avgHitAt1.toFixed(2)}`);
    console.log(`  Avg MRR: ${avgMrr.toFixed(2)}`);
    console.log(`  Governance failures: ${govFailures}`);
  }

  // Print failures
  const failures = results.filter((r) => !r.passed);
  if (failures.length > 0) {
    console.log('\n=== Failures ===');
    for (const result of failures) {
      console.log(
        `\n${result.case.caseId} [${result.case.endpoint}] (stability=${result.case.stability}):`,
      );
      for (const failure of result.governance.failures) {
        console.log(`  - [${failure.kind}] ${failure.description}`);
      }
      if (result.result.isEmpty && result.case.expected.outcome === 'non-empty') {
        console.log('  - [outcome-mismatch] Expected non-empty, got empty');
      }
      if (!result.result.isEmpty && result.case.expected.outcome === 'empty') {
        console.log('  - [outcome-mismatch] Expected empty, got non-empty');
      }
    }
  }

  console.log('');
}

// =============================================================================
// Main Entry Point
// =============================================================================

function printRunnerBanner(options: LiveRunnerOptions): void {
  console.log('\n=== Live Retrieval Evaluation Runner ===');
  console.log(`Snapshot version: ${options.snapshotVersion}`);
  console.log(`Backend URL: ${options.baseUrl}`);
  console.log(`Tier: ${options.tier}`);
  console.log(`Dry run: ${options.dryRun}`);
  if (options.endpoint) {
    console.log(`Endpoint filter: ${options.endpoint}`);
  }
}

interface SnapshotPhaseResult {
  meta: Awaited<ReturnType<typeof restoreSnapshot>>['meta'];
  health: Awaited<ReturnType<typeof restoreSnapshot>>['health'] | undefined;
  actualProfile: ReturnType<typeof detectServiceProfile>;
}

/**
 * Restore the named snapshot (or just validate it in dry-run mode) and verify
 * the running service profile matches the snapshot source.
 */
async function restoreSnapshotPhase(
  options: LiveRunnerOptions,
  snapshotDir: string,
): Promise<SnapshotPhaseResult> {
  const actualProfile = detectServiceProfile();

  if (options.dryRun) {
    const { loadSnapshot } = await import('./lib/snapshot-orchestrator.js');
    try {
      const { meta: loadedMeta } = await loadSnapshot(snapshotDir);
      console.log(`\nSnapshot "${options.snapshotVersion}" validated successfully.`);
      console.log(`  Version: ${loadedMeta.version}`);
      console.log(`  Mode: ${loadedMeta.derivationContext.mode}`);
      console.log(`  Embedding model: ${loadedMeta.derivationContext.embeddingModelUsed}`);
      return { meta: loadedMeta, health: undefined, actualProfile };
    } catch (error) {
      console.error(
        `Failed to load snapshot: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    }
  }

  console.log(`\nRestoring snapshot from ${snapshotDir} ...`);

  let meta: Awaited<ReturnType<typeof restoreSnapshot>>['meta'];
  let health: Awaited<ReturnType<typeof restoreSnapshot>>['health'];
  try {
    ({ meta, health } = await restoreSnapshot({
      databaseUrl: options.databaseUrl,
      snapshotDir,
    }));
  } catch (error) {
    console.error(
      `Failed to restore snapshot: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }

  console.log(`  Mode: ${meta.derivationContext.mode}`);
  console.log(`  Knowledge entries: ${health.knowledgeEntryCount}`);
  console.log(`  Skill artifacts: ${health.skillArtifactCount}`);
  console.log(`  Graph docs: ${health.graphDocCount}`);
  console.log(`  Capsule embeddings: ${health.capsuleEmbeddingCount}`);

  // Verify service profile
  const profileMismatches = verifyServiceProfile(meta.serviceProfile, actualProfile);
  if (profileMismatches.length > 0) {
    console.warn('\n⚠ Service profile mismatches:');
    for (const mismatch of profileMismatches) {
      console.warn(`  - ${mismatch}`);
    }
    console.warn('Results may not be directly comparable with the snapshot source.\n');
  }

  return { meta, health, actualProfile };
}

/**
 * Load the tier's live cases, applying the endpoint filter and the
 * allow-empty handling.
 */
function loadAndFilterCases(options: LiveRunnerOptions): LiveEvalCase[] {
  let cases = loadLiveCases(options.tier);

  if (options.endpoint) {
    cases = cases.filter((c) => c.endpoint === options.endpoint);
  }

  if (cases.length === 0) {
    if (options.allowEmpty) {
      console.log('No cases found. Exiting successfully (allow-empty mode).\n');
      process.exit(0);
    }
    console.error('No cases found. Use --allow-empty to skip.');
    process.exit(1);
  }

  console.log(`\nLoaded ${cases.length} case(s):`);
  for (const c of cases) {
    console.log(`  - [${c.endpoint}] ${c.caseId} (stability=${c.stability})`);
  }

  return cases;
}

function buildLiveJsonReport(
  options: LiveRunnerOptions,
  results: LiveCaseResult[],
  meta: SnapshotPhaseResult['meta'],
  health: SnapshotPhaseResult['health'],
  actualProfile: SnapshotPhaseResult['actualProfile'],
  startTime: number,
): unknown {
  return {
    meta: {
      schemaVersion: 1,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      options: {
        tier: options.tier,
        endpoint: options.endpoint,
        dryRun: options.dryRun,
        allowEmpty: options.allowEmpty,
        verbose: options.verbose,
      },
      snapshotVersion: options.snapshotVersion,
      snapshotFingerprint: meta.fingerprint,
      restoreMode: meta.derivationContext.mode,
      backendBaseUrl: options.baseUrl,
      serviceProfileSnapshot: actualProfile,
      indexHealthSummary: health,
    },
    summary: {
      totalCases: results.length,
      passedCases: results.filter((r) => r.passed).length,
      failedCases: results.filter((r) => !r.passed).length,
      passRate: results.length > 0 ? results.filter((r) => r.passed).length / results.length : 0,
      passed: results.every((r) => r.passed),
    },
    cases: results.map((r) => ({
      caseId: r.case.caseId,
      endpoint: r.case.endpoint,
      tier: r.case.tier,
      stability: r.case.stability,
      passed: r.passed,
      outcomeMatch: r.case.expected.outcome === 'empty' ? r.result.isEmpty : !r.result.isEmpty,
      governancePassed: r.governance.passed,
      durationMs: r.execution.durationMs,
      hitAt1: r.metrics.hitAt1,
      hitAt5: r.metrics.hitAt5,
      hitAt10: r.metrics.hitAt10,
      mrr: r.metrics.mrr,
      ndcg: r.metrics.ndcg,
      recallAt10: r.metrics.recallAt10,
      fallbackApplied: r.execution.fallbackApplied,
    })),
  };
}

async function writeLiveJsonReport(options: LiveRunnerOptions, report: unknown): Promise<void> {
  if (options.jsonPath) {
    const dir = path.dirname(options.jsonPath);
    await mkdir(dir, { recursive: true }).catch(() => {});
    await writeFile(options.jsonPath, JSON.stringify(report, null, 2));
    console.log(`JSON report written to: ${options.jsonPath}\n`);
  } else {
    console.log('\n=== JSON Report ===');
    console.log(JSON.stringify(report, null, 2));
  }
}

async function main(): Promise<void> {
  const startTime = Date.now();
  const options = parseArgs_();

  printRunnerBanner(options);

  // Step 1: Restore snapshot (skip in dry-run mode)
  const snapshotDir = path.resolve(`evals/retrieval-live/snapshots/${options.snapshotVersion}`);
  const { meta, health, actualProfile } = await restoreSnapshotPhase(options, snapshotDir);

  // Step 2: Load cases
  const cases = loadAndFilterCases(options);

  if (options.dryRun) {
    console.log('\nDry run complete. No evaluation executed.\n');
    return;
  }

  // Step 3: Execute cases
  console.log('\nExecuting live evaluation...\n');
  const results = await executeAllLiveCases(cases, options);

  // Step 4: Print summary
  printSummary(results);

  // Step 5: Write JSON report
  if (options.json) {
    await writeLiveJsonReport(
      options,
      buildLiveJsonReport(options, results, meta, health, actualProfile, startTime),
    );
  }

  // Exit code
  const hasFailures = results.some((r) => !r.passed);
  if (hasFailures) {
    console.log('Live evaluation completed with failures.\n');
    process.exit(1);
  }

  console.log('Live evaluation completed successfully.\n');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
