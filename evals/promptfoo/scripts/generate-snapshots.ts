/**
 * Snapshot generator for promptfoo suite parity.
 *
 * Runs each suite bridge at smoke tier through the promptfoo engine and writes
 * the per-case judgment snapshot to `evals/promptfoo/snapshots/<suiteId>-smoke.json`.
 *
 * The generated `cases` entries are committed-output deterministic: sorted by
 * `caseId`, containing only `caseId` + `passed` plus suite-relevant numeric
 * fields (no timestamps, latencies or run-specific values inside `cases`).
 *
 * summary and retrieval need a real PostgreSQL host (TRAPMAP_DATABASE_URL), so
 * this script must be run under the postgres coordinator:
 *
 *   TRAPMAP_POSTGRES_COORDINATOR_URL=postgres://trapmap@127.0.0.1:55432/postgres \
 *     pnpm exec tsx --tsconfig tsconfig.base.json \
 *     scripts/run-postgres-coordinated.ts -- \
 *     pnpm exec tsx --tsconfig tsconfig.base.json \
 *     evals/promptfoo/scripts/generate-snapshots.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { getBridge } from '../bridge.js';
import { runSuiteWithPromptfoo } from '../runner.js';
import { suiteSnapshotCaseSchema, suiteSnapshotSchema } from '../snapshots/snapshot-schema.js';
import type { SuiteBridge, SuiteRunOptions } from '../types.js';

// Register all six suite bridges (each module calls registerBridge at load time).
import '../../agent-planning/bridge.js';
import '../../graph-extraction/bridge.js';
import '../../ingestion/bridge.js';
import '../../label-alignment/bridge.js';
import '../../retrieval/bridge.js';
import '../../summary/bridge.js';

// =============================================================================
// Per-suite case extractors (shared with the parity tests)
// =============================================================================

export interface SnapshotCaseEntry {
  caseId: string;
  passed: boolean;
  [k: string]: unknown;
}

export function extractAgentPlanningCases(report: unknown): SnapshotCaseEntry[] {
  const cases = (report as { cases?: Array<Record<string, unknown>> }).cases ?? [];
  return cases.map((c) => ({
    caseId: `${String(c.taskId)}::${String(c.variantId)}`,
    passed: Boolean(c.passed),
    totalScore: Number(c.totalScore),
    pathScore: Number(c.pathScore),
    finalAnswerScore: Number(c.finalAnswerScore),
  }));
}

export function extractGraphExtractionCases(report: unknown): SnapshotCaseEntry[] {
  const results = (report as { results?: Array<Record<string, unknown>> }).results ?? [];
  return results.map((r) => ({
    caseId: String(r.caseId),
    passed: r.mode === 'live',
    mode: String(r.mode),
    nodeF1: Number((r.nodeMetrics as Record<string, unknown> | undefined)?.f1 ?? 0),
    edgeF1: Number((r.edgeMetrics as Record<string, unknown> | undefined)?.f1 ?? 0),
    strengthAccuracy: Number(r.strengthAccuracy),
  }));
}

export function extractIngestionCases(report: unknown): SnapshotCaseEntry[] {
  const results = (report as { results?: Array<Record<string, unknown>> }).results ?? [];
  return results.map((r) => ({
    caseId: String(r.fixtureId),
    passed: Boolean(r.passed),
    capsuleCount: Number(r.capsuleCount),
  }));
}

export function extractLabelAlignmentCases(report: unknown): SnapshotCaseEntry[] {
  const cases = (report as { cases?: Array<Record<string, unknown>> }).cases ?? [];
  return cases.map((c) => ({
    caseId: String(c.caseId),
    passed: Boolean(c.passed),
    alignmentAccuracy: Number(c.alignmentAccuracy),
    missedMerges: Number(c.missedMerges),
    falseMerges: Number(c.falseMerges),
  }));
}

export function extractSummaryCases(report: unknown): SnapshotCaseEntry[] {
  const cases = (report as { cases?: Array<Record<string, unknown>> }).cases ?? [];
  return cases.map((c) => ({
    caseId: String(c.caseId),
    passed: Boolean(c.passed),
    groundednessScore: Number(c.groundednessScore),
    coverageScore: Number(c.coverageScore),
  }));
}

export function extractRetrievalCases(report: unknown): SnapshotCaseEntry[] {
  const caseResults =
    (report as { caseResults?: Array<Record<string, unknown>> }).caseResults ?? [];
  return caseResults.map((r) => ({
    caseId: String((r.case as Record<string, unknown> | undefined)?.caseId),
    passed: Boolean(r.passed),
    hitAt1: Number((r.metrics as Record<string, unknown> | undefined)?.hitAt1 ?? 0),
    mrr: Number((r.metrics as Record<string, unknown> | undefined)?.mrr ?? 0),
    ndcg: Number((r.metrics as Record<string, unknown> | undefined)?.ndcg ?? 0),
  }));
}

// =============================================================================
// Suite configs
// =============================================================================

export interface SnapshotSuiteConfig {
  suiteId: string;
  opts: SuiteRunOptions;
  extract: (report: unknown) => SnapshotCaseEntry[];
}

export function getSnapshotSuiteConfigs(): SnapshotSuiteConfig[] {
  return [
    {
      suiteId: 'agent-planning',
      opts: {
        tier: 'smoke',
        dryRun: false,
        allowEmpty: false,
        runner: 'promptfoo',
        provider: 'fallback',
      },
      extract: extractAgentPlanningCases,
    },
    {
      suiteId: 'graph-extraction',
      opts: { tier: 'smoke', dryRun: true, allowEmpty: false, runner: 'promptfoo' },
      extract: extractGraphExtractionCases,
    },
    {
      suiteId: 'ingestion',
      opts: { tier: 'smoke', dryRun: true, allowEmpty: false, runner: 'promptfoo' },
      extract: extractIngestionCases,
    },
    {
      suiteId: 'label-alignment',
      opts: {
        tier: 'smoke',
        dryRun: true,
        allowEmpty: false,
        runner: 'promptfoo',
        mode: 'dry-run',
      },
      extract: extractLabelAlignmentCases,
    },
    {
      suiteId: 'summary',
      opts: {
        tier: 'smoke',
        dryRun: false,
        allowEmpty: false,
        runner: 'promptfoo',
        provider: 'fallback',
      },
      extract: extractSummaryCases,
    },
    {
      suiteId: 'retrieval',
      opts: { tier: 'smoke', dryRun: false, allowEmpty: false, runner: 'promptfoo' },
      extract: extractRetrievalCases,
    },
  ];
}

export function snapshotFilePath(suiteId: string): string {
  return new URL(`../snapshots/${suiteId}-smoke.json`, import.meta.url).pathname;
}

// =============================================================================
// Generator
// =============================================================================

const GENERATION_COMMAND =
  'tsx scripts/run-postgres-coordinated.ts -- pnpm exec tsx evals/promptfoo/scripts/generate-snapshots.ts';

export async function generateSnapshots(
  configs: SnapshotSuiteConfig[] = getSnapshotSuiteConfigs(),
  snapshotDir = new URL('../snapshots/', import.meta.url),
): Promise<Array<{ suiteId: string; caseCount: number; path: string }>> {
  const generatedAt = new Date().toISOString();
  const written: Array<{ suiteId: string; caseCount: number; path: string }> = [];

  mkdirSync(snapshotDir.pathname, { recursive: true });

  for (const config of configs) {
    const bridge = getBridge(config.suiteId) as SuiteBridge<unknown, unknown, unknown> | undefined;
    if (!bridge) {
      throw new Error(`No bridge registered for suite '${config.suiteId}'`);
    }

    const { report } = await runSuiteWithPromptfoo(bridge, config.opts);
    const entries = config
      .extract(report)
      .map((entry) => suiteSnapshotCaseSchema.parse(entry))
      .sort((a, b) => a.caseId.localeCompare(b.caseId));

    const snapshot = suiteSnapshotSchema.parse({
      schemaVersion: 1,
      suiteId: config.suiteId,
      tier: 'smoke',
      generatedAt,
      command: GENERATION_COMMAND,
      cases: entries,
    });

    const path = `${snapshotDir.pathname}${config.suiteId}-smoke.json`;
    writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    written.push({ suiteId: config.suiteId, caseCount: entries.length, path });
  }

  return written;
}

const isDirectExecution = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  generateSnapshots()
    .then((written) => {
      for (const result of written) {
        console.log(`wrote ${result.suiteId}: ${result.caseCount} case(s) -> ${result.path}`);
      }
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
