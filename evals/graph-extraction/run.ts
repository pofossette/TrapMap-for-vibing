/**
 * Graph Extraction Evaluation Runner
 *
 * Evaluates the LLM graph extraction pipeline against annotated ground truth.
 *
 * Metrics:
 * - Node precision/recall/F1 (match by normalized label)
 * - Edge precision/recall/F1 (match by source+target+type)
 * - Strength classification accuracy
 * - Extraction status reporting for unavailable/error/empty cases
 *
 * Usage:
 *   pnpm eval:graph-extraction
 *   pnpm eval:graph-extraction --dry-run
 *   pnpm eval:graph-extraction --smoke
 */

import { parseArgs } from 'node:util';

import type { LlmGraphExtraction } from '@trapmap/contracts';

import { getSmokeFixtures, graphExtractionFixtures } from './fixtures.js';
import type { ExpectedEdge, ExpectedNode, GraphExtractionFixture } from './fixtures.js';

// ---------------------------------------------------------------------------
// Extraction mode tracking
// ---------------------------------------------------------------------------

export interface ExtractionRunResult {
  extraction: LlmGraphExtraction;
  mode: 'live' | 'unavailable' | 'error' | 'empty';
  degraded: boolean;
  warning: string | null;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface RunOptions {
  dryRun: boolean;
  smoke: boolean;
  verbose: number;
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
    verbose: values.verbose ? 1 : 0,
  };
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function normalizeLabel(label: string): string {
  return label.toLowerCase().trim().replace(/\s+/g, '-');
}

function normalizeNodeKey(kind: string, label: string): string {
  return `${kind}:${normalizeLabel(label)}`;
}

function normalizeEdgeKey(source: string, target: string, type: string): string {
  return `${normalizeLabel(source)}-${type}-${normalizeLabel(target)}`;
}

// ---------------------------------------------------------------------------
// Metrics computation
// ---------------------------------------------------------------------------

interface ClassificationMetrics {
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
  f1: number;
}

function computeMetrics(tp: number, fp: number, fn: number): ClassificationMetrics {
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return { tp, fp, fn, precision, recall, f1 };
}

export interface CaseMetrics {
  caseId: string;
  nodeMetrics: ClassificationMetrics;
  edgeMetrics: ClassificationMetrics;
  strengthAccuracy: number;
  totalExpectedStrengths: number;
  correctStrengths: number;
  mode: 'live' | 'unavailable' | 'error' | 'empty';
  degraded: boolean;
  warning: string | null;
}

/**
 * Compare expected nodes against actual extraction nodes.
 * Match by normalized "kind:label" key.
 */
function evaluateNodes(
  expected: ExpectedNode[],
  actual: Array<{ kind: string; label: string }>,
): { tp: number; fp: number; fn: number } {
  const expectedKeys = new Set(expected.map((n) => normalizeNodeKey(n.kind, n.label)));
  const actualKeys = new Set(actual.map((n) => normalizeNodeKey(n.kind, n.label)));

  let tp = 0;
  for (const key of expectedKeys) {
    if (actualKeys.has(key)) tp++;
  }

  return { tp, fp: actualKeys.size - tp, fn: expectedKeys.size - tp };
}

/**
 * Compare expected edges against actual extraction edges.
 * Match by normalized "source-type-target" key.
 */
function evaluateEdges(
  expected: ExpectedEdge[],
  actual: Array<{
    sourceLabel: string;
    targetLabel: string;
    relationType: string;
    strength: string;
  }>,
): { tp: number; fp: number; fn: number; correctStrengths: number; totalStrengths: number } {
  const expectedMap = new Map<string, ExpectedEdge>();
  for (const e of expected) {
    expectedMap.set(normalizeEdgeKey(e.source, e.target, e.type), e);
  }

  const actualMap = new Map<string, (typeof actual)[0]>();
  for (const e of actual) {
    actualMap.set(normalizeEdgeKey(e.sourceLabel, e.targetLabel, e.relationType), e);
  }

  let tp = 0;
  let correctStrengths = 0;
  for (const [key, expectedEdge] of expectedMap) {
    if (actualMap.has(key)) {
      tp++;
      const actualEdge = actualMap.get(key)!;
      if (actualEdge.strength === expectedEdge.strength) {
        correctStrengths++;
      }
    }
  }

  return {
    tp,
    fp: actualMap.size - tp,
    fn: expectedMap.size - tp,
    correctStrengths,
    totalStrengths: expected.length,
  };
}

// ---------------------------------------------------------------------------
// Extraction strategies
// ---------------------------------------------------------------------------

export async function performLLMExtraction(
  text: string,
  dryRun: boolean,
): Promise<ExtractionRunResult> {
  if (dryRun) {
    return {
      extraction: { nodes: [], edges: [] },
      mode: 'unavailable',
      degraded: true,
      warning: 'dry-run-no-llm',
    };
  }

  // Real LLM call
  try {
    // Dynamic imports to avoid loading AI modules in dry-run
    const { extractSegmentEntities } = await import(
      '../../packages/service-knowledge-read/src/graph-llm-extract.js'
    );
    const { createAiProviders, loadAiProviderConfig } = await import('@trapmap/ai-providers');

    const config = loadAiProviderConfig();
    const { chat } = createAiProviders(config);
    if (!chat.isConfigured) {
      console.warn('WARNING: Chat provider not configured, graph extraction eval unavailable');
      return {
        extraction: { nodes: [], edges: [] },
        mode: 'unavailable',
        degraded: true,
        warning: 'chat-provider-not-configured',
      };
    }

    const result = await extractSegmentEntities(chat, text);
    return {
      extraction: result ?? { nodes: [], edges: [] },
      mode: result ? 'live' : 'empty',
      degraded: result === null,
      warning: result ? null : 'llm-returned-empty-or-invalid',
    };
  } catch (error) {
    console.warn('LLM extraction failed:', error);
    return {
      extraction: { nodes: [], edges: [] },
      mode: 'error',
      degraded: true,
      warning: 'llm-extraction-failed',
    };
  }
}

// ---------------------------------------------------------------------------
// Case evaluation
// ---------------------------------------------------------------------------

export async function evaluateCase(
  fixture: GraphExtractionFixture,
  dryRun: boolean,
): Promise<CaseMetrics> {
  const runResult = await performLLMExtraction(fixture.input, dryRun);
  const extraction = runResult.extraction;

  const nodeResult = evaluateNodes(fixture.expectedNodes, extraction.nodes);
  const edgeResult = evaluateEdges(fixture.expectedEdges, extraction.edges);

  return {
    caseId: fixture.id,
    nodeMetrics: computeMetrics(nodeResult.tp, nodeResult.fp, nodeResult.fn),
    edgeMetrics: computeMetrics(edgeResult.tp, edgeResult.fp, edgeResult.fn),
    strengthAccuracy:
      edgeResult.totalStrengths > 0 ? edgeResult.correctStrengths / edgeResult.totalStrengths : 0,
    totalExpectedStrengths: edgeResult.totalStrengths,
    correctStrengths: edgeResult.correctStrengths,
    mode: runResult.mode,
    degraded: runResult.degraded,
    warning: runResult.warning,
  };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export interface AggregateMetrics {
  avgNodePrecision: number;
  avgNodeRecall: number;
  avgNodeF1: number;
  avgEdgePrecision: number;
  avgEdgeRecall: number;
  avgEdgeF1: number;
  avgStrengthAccuracy: number;
  totalCases: number;
  totalNodeTP: number;
  totalNodeFP: number;
  totalNodeFN: number;
  totalEdgeTP: number;
  totalEdgeFP: number;
  totalEdgeFN: number;
  modeBreakdown: { live: number; unavailable: number; error: number; empty: number };
  degradedCount: number;
  warnings: string[];
}

export function aggregateMetrics(results: CaseMetrics[]): AggregateMetrics {
  if (results.length === 0) {
    return {
      avgNodePrecision: 0,
      avgNodeRecall: 0,
      avgNodeF1: 0,
      avgEdgePrecision: 0,
      avgEdgeRecall: 0,
      avgEdgeF1: 0,
      avgStrengthAccuracy: 0,
      totalCases: 0,
      totalNodeTP: 0,
      totalNodeFP: 0,
      totalNodeFN: 0,
      totalEdgeTP: 0,
      totalEdgeFP: 0,
      totalEdgeFN: 0,
      modeBreakdown: { live: 0, unavailable: 0, error: 0, empty: 0 },
      degradedCount: 0,
      warnings: [],
    };
  }

  // Micro-averaged metrics (pool all TP/FP/FN then compute)
  let totalNodeTP = 0;
  let totalNodeFP = 0;
  let totalNodeFN = 0;
  let totalEdgeTP = 0;
  let totalEdgeFP = 0;
  let totalEdgeFN = 0;
  let totalCorrectStrengths = 0;
  let totalExpectedStrengths = 0;
  let liveCount = 0;
  let unavailableCount = 0;
  let errorCount = 0;
  let emptyCount = 0;
  let degradedCount = 0;
  const uniqueWarnings = new Set<string>();

  for (const r of results) {
    totalNodeTP += r.nodeMetrics.tp;
    totalNodeFP += r.nodeMetrics.fp;
    totalNodeFN += r.nodeMetrics.fn;
    totalEdgeTP += r.edgeMetrics.tp;
    totalEdgeFP += r.edgeMetrics.fp;
    totalEdgeFN += r.edgeMetrics.fn;
    totalCorrectStrengths += r.correctStrengths;
    totalExpectedStrengths += r.totalExpectedStrengths;
    if (r.mode === 'live') liveCount++;
    else if (r.mode === 'unavailable') unavailableCount++;
    else if (r.mode === 'error') errorCount++;
    else emptyCount++;
    if (r.degraded) degradedCount++;
    if (r.warning) uniqueWarnings.add(r.warning);
  }

  const nodeMetrics = computeMetrics(totalNodeTP, totalNodeFP, totalNodeFN);
  const edgeMetrics = computeMetrics(totalEdgeTP, totalEdgeFP, totalEdgeFN);

  return {
    avgNodePrecision: nodeMetrics.precision,
    avgNodeRecall: nodeMetrics.recall,
    avgNodeF1: nodeMetrics.f1,
    avgEdgePrecision: edgeMetrics.precision,
    avgEdgeRecall: edgeMetrics.recall,
    avgEdgeF1: edgeMetrics.f1,
    avgStrengthAccuracy:
      totalExpectedStrengths > 0 ? totalCorrectStrengths / totalExpectedStrengths : 0,
    totalCases: results.length,
    totalNodeTP,
    totalNodeFP,
    totalNodeFN,
    totalEdgeTP,
    totalEdgeFP,
    totalEdgeFN,
    modeBreakdown: {
      live: liveCount,
      unavailable: unavailableCount,
      error: errorCount,
      empty: emptyCount,
    },
    degradedCount,
    warnings: [...uniqueWarnings],
  };
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

export function formatReport(
  results: CaseMetrics[],
  agg: AggregateMetrics,
  _unusedComparisonResults: CaseMetrics[],
  _unusedComparisonAgg: AggregateMetrics,
  dryRun: boolean,
): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('============================================================');
  lines.push('         Graph Extraction Evaluation Report');
  lines.push('============================================================');
  lines.push('');

  // Mode line
  if (dryRun) {
    lines.push('Mode: DRY-RUN (runner validation only, no LLM calls)');
  } else if (agg.modeBreakdown.live === agg.totalCases) {
    lines.push('Mode: LIVE (LLM calls)');
  } else {
    lines.push('Mode: MIXED (some cases unavailable, empty, or failed)');
  }

  lines.push(`Total fixtures: ${agg.totalCases}`);
  lines.push('');

  // Mode breakdown
  if (!dryRun) {
    lines.push(
      `Mode Breakdown: Live: ${agg.modeBreakdown.live}, Unavailable: ${agg.modeBreakdown.unavailable}, Error: ${agg.modeBreakdown.error}, Empty: ${agg.modeBreakdown.empty}`,
    );
    if (agg.degradedCount > 0) {
      lines.push(`DEGRADED: ${agg.degradedCount} case(s) ran without a usable live extraction`);
    }
    lines.push('');
  }

  lines.push('=== Aggregate Metrics (Micro-Averaged) ===');
  lines.push('');
  lines.push('Metric              | Value');
  lines.push('--------------------|--------');
  lines.push(`Node Precision      | ${agg.avgNodePrecision.toFixed(3).padStart(6)}`);
  lines.push(`Node Recall         | ${agg.avgNodeRecall.toFixed(3).padStart(6)}`);
  lines.push(`Node F1             | ${agg.avgNodeF1.toFixed(3).padStart(6)}`);
  lines.push(`Edge Precision      | ${agg.avgEdgePrecision.toFixed(3).padStart(6)}`);
  lines.push(`Edge Recall         | ${agg.avgEdgeRecall.toFixed(3).padStart(6)}`);
  lines.push(`Edge F1             | ${agg.avgEdgeF1.toFixed(3).padStart(6)}`);
  lines.push(`Strength Accuracy   | ${agg.avgStrengthAccuracy.toFixed(3).padStart(6)}`);
  lines.push('');

  // Per-case details
  lines.push('=== Per-Case Results ===');
  lines.push('');
  lines.push('Case ID                    | Mode | Node P/R/F1   | Edge P/R/F1   | Str Acc');
  lines.push('---------------------------|------|---------------|---------------|--------');

  for (const r of results) {
    const caseId = r.caseId.padEnd(25);
    const modeIndicator =
      r.mode === 'live'
        ? ' L '
        : r.mode === 'unavailable'
          ? ' U '
          : r.mode === 'error'
            ? ' E '
            : ' M ';
    const nodePrf =
      `${r.nodeMetrics.precision.toFixed(2)}/${r.nodeMetrics.recall.toFixed(2)}/${r.nodeMetrics.f1.toFixed(2)}`.padStart(
        13,
      );
    const edgePrf =
      `${r.edgeMetrics.precision.toFixed(2)}/${r.edgeMetrics.recall.toFixed(2)}/${r.edgeMetrics.f1.toFixed(2)}`.padStart(
        13,
      );
    const strAcc = r.strengthAccuracy.toFixed(2).padStart(6);
    lines.push(`${caseId} |${modeIndicator}| ${nodePrf} | ${edgePrf} | ${strAcc}`);
  }

  lines.push('');

  // Worst performing cases
  const worstCases = [...results].sort((a, b) => a.nodeMetrics.f1 - b.nodeMetrics.f1).slice(0, 3);
  const worstFirst = worstCases[0];
  if (worstFirst && worstFirst.nodeMetrics.f1 < 1.0) {
    lines.push('=== Lowest F1 Cases ===');
    for (const r of worstCases) {
      if (r.nodeMetrics.f1 >= 1.0) break;
      lines.push(
        `  ${r.caseId}: Node F1=${r.nodeMetrics.f1.toFixed(3)}, Edge F1=${r.edgeMetrics.f1.toFixed(3)}`,
      );
    }
    lines.push('');
  }

  // Warnings
  if (agg.warnings.length > 0) {
    lines.push('=== Warnings ===');
    for (const w of agg.warnings) {
      lines.push(`  - ${w}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const startTime = Date.now();
  const options = parseArgs_();

  console.log('');
  console.log('=== Graph Extraction Evaluation ===');
  console.log(`Mode: ${options.dryRun ? 'dry-run' : 'live'}`);
  console.log(`Smoke: ${options.smoke}`);
  console.log('');

  const fixtures = options.smoke ? getSmokeFixtures() : graphExtractionFixtures;
  console.log(`Running ${fixtures.length} fixture(s)...`);
  console.log('');

  // Run LLM extraction evaluation
  const results: CaseMetrics[] = [];
  for (const fixture of fixtures) {
    const result = await evaluateCase(fixture, options.dryRun);
    results.push(result);
    if (options.verbose) {
      console.log(
        `  ${fixture.id}: node F1=${result.nodeMetrics.f1.toFixed(3)}, edge F1=${result.edgeMetrics.f1.toFixed(3)}`,
      );
    }
  }

  const agg = aggregateMetrics(results);

  // Print report
  console.log(formatReport(results, agg, [], aggregateMetrics([]), options.dryRun));

  const durationMs = Date.now() - startTime;
  console.log(`Duration: ${durationMs}ms`);
  console.log('');

  if (!options.dryRun) {
    if (agg.degradedCount > 0) {
      console.log(
        `WARNING: ${agg.degradedCount} case(s) degraded -- results may not reflect true LLM quality`,
      );
    }
  }

  console.log('Evaluation completed successfully.');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
