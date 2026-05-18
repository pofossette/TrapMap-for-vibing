/**
 * Graph Extraction Evaluation Runner
 *
 * Evaluates the LLM graph extraction pipeline against annotated ground truth.
 *
 * Metrics:
 * - Node precision/recall/F1 (match by normalized label)
 * - Edge precision/recall/F1 (match by source+target+type)
 * - Strength classification accuracy
 * - Comparison: LLM vs rule-engine results
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

interface CaseMetrics {
  caseId: string;
  nodeMetrics: ClassificationMetrics;
  edgeMetrics: ClassificationMetrics;
  strengthAccuracy: number;
  totalExpectedStrengths: number;
  correctStrengths: number;
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
    totalStrengths: expected.size,
  };
}

// ---------------------------------------------------------------------------
// Extraction strategies
// ---------------------------------------------------------------------------

/**
 * Simulate rule-engine extraction from text.
 * Simple keyword-based extraction for comparison.
 */
function simulateRuleEngineExtraction(text: string): LlmGraphExtraction {
  const nodes: LlmGraphExtraction['nodes'] = [];
  const edges: LlmGraphExtraction['edges'] = [];

  // Simple keyword-based extraction (mimics extractTrapGraphEntities)
  const toolKeywords = [
    'docker',
    'npm',
    'yarn',
    'node.js',
    'nodejs',
    'postgresql',
    'redis',
    'kubernetes',
    'helm',
    'ssh',
    'tmux',
    'screen',
    'graphql',
    'apollo',
    'eslint',
    'prettier',
    'pgbouncer',
    'github actions',
  ];

  const lowerText = text.toLowerCase();

  for (const tool of toolKeywords) {
    if (lowerText.includes(tool)) {
      nodes.push({ kind: 'tool', label: tool.replace(/\s+/g, '-') });
    }
  }

  // Detect cue patterns
  const cuePatterns = [/timeout/i, /error/i, /fail/i, /crash/i, /leak/i, /drop/i];
  for (const pattern of cuePatterns) {
    if (pattern.test(text)) {
      const cueLabel = pattern.source.replace(/[\\\/\(\)]/g, '').toLowerCase();
      if (!nodes.some((n) => n.label === cueLabel)) {
        nodes.push({ kind: 'cue', label: `${cueLabel}-issue` });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Perform actual LLM extraction.
 * Falls back to mock data in dry-run mode.
 */
async function performLLMExtraction(text: string, dryRun: boolean): Promise<LlmGraphExtraction> {
  if (dryRun) {
    // In dry-run mode, use a deterministic mock that returns a reasonable subset
    return simulateRuleEngineExtraction(text);
  }

  // Real LLM call
  try {
    // Dynamic imports to avoid loading AI modules in dry-run
    const { extractSegmentEntities } = await import(
      '../../packages/server/src/lib/indexing/graph-lite/llm-extract.js'
    );
    const { createChatProvider } = await import(
      '../../packages/server/src/lib/ai/providers/index.js'
    );

    const chat = createChatProvider();
    if (!chat.isConfigured) {
      console.warn('WARNING: Chat provider not configured, falling back to rule engine');
      return simulateRuleEngineExtraction(text);
    }

    const result = await extractSegmentEntities(chat, text);
    return result ?? { nodes: [], edges: [] };
  } catch (error) {
    console.warn('LLM extraction failed, falling back to rule engine:', error);
    return simulateRuleEngineExtraction(text);
  }
}

// ---------------------------------------------------------------------------
// Case evaluation
// ---------------------------------------------------------------------------

async function evaluateCase(
  fixture: GraphExtractionFixture,
  dryRun: boolean,
): Promise<CaseMetrics> {
  const extraction = await performLLMExtraction(fixture.input, dryRun);

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
  };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

interface AggregateMetrics {
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
}

function aggregateMetrics(results: CaseMetrics[]): AggregateMetrics {
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

  for (const r of results) {
    totalNodeTP += r.nodeMetrics.tp;
    totalNodeFP += r.nodeMetrics.fp;
    totalNodeFN += r.nodeMetrics.fn;
    totalEdgeTP += r.edgeMetrics.tp;
    totalEdgeFP += r.edgeMetrics.fp;
    totalEdgeFN += r.edgeMetrics.fn;
    totalCorrectStrengths += r.correctStrengths;
    totalExpectedStrengths += r.totalExpectedStrengths;
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
  };
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

function formatReport(
  results: CaseMetrics[],
  agg: AggregateMetrics,
  _ruleEngineResults: CaseMetrics[],
  ruleEngineAgg: AggregateMetrics,
  dryRun: boolean,
): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('============================================================');
  lines.push('         Graph Extraction Evaluation Report');
  lines.push('============================================================');
  lines.push('');
  lines.push(`Mode: ${dryRun ? 'DRY-RUN (mock data)' : 'LIVE (LLM calls)'}`);
  lines.push(`Total fixtures: ${agg.totalCases}`);
  lines.push('');

  // Aggregate comparison table
  lines.push('=== Aggregate Metrics (Micro-Averaged) ===');
  lines.push('');
  lines.push('Metric              | LLM     | Rule Engine');
  lines.push('--------------------|---------|------------');
  lines.push(
    `Node Precision      | ${agg.avgNodePrecision.toFixed(3).padStart(7)} | ${ruleEngineAgg.avgNodePrecision.toFixed(3).padStart(7)}`,
  );
  lines.push(
    `Node Recall         | ${agg.avgNodeRecall.toFixed(3).padStart(7)} | ${ruleEngineAgg.avgNodeRecall.toFixed(3).padStart(7)}`,
  );
  lines.push(
    `Node F1             | ${agg.avgNodeF1.toFixed(3).padStart(7)} | ${ruleEngineAgg.avgNodeF1.toFixed(3).padStart(7)}`,
  );
  lines.push(
    `Edge Precision      | ${agg.avgEdgePrecision.toFixed(3).padStart(7)} | ${ruleEngineAgg.avgEdgePrecision.toFixed(3).padStart(7)}`,
  );
  lines.push(
    `Edge Recall         | ${agg.avgEdgeRecall.toFixed(3).padStart(7)} | ${ruleEngineAgg.avgEdgeRecall.toFixed(3).padStart(7)}`,
  );
  lines.push(
    `Edge F1             | ${agg.avgEdgeF1.toFixed(3).padStart(7)} | ${ruleEngineAgg.avgEdgeF1.toFixed(3).padStart(7)}`,
  );
  lines.push(
    `Strength Accuracy   | ${agg.avgStrengthAccuracy.toFixed(3).padStart(7)} | ${ruleEngineAgg.avgStrengthAccuracy.toFixed(3).padStart(7)}`,
  );
  lines.push('');

  // Per-case details
  lines.push('=== Per-Case Results ===');
  lines.push('');
  lines.push('Case ID                    | Node P/R/F1   | Edge P/R/F1   | Str Acc');
  lines.push('---------------------------|---------------|---------------|--------');

  for (const r of results) {
    const caseId = r.caseId.padEnd(25);
    const nodePrf =
      `${r.nodeMetrics.precision.toFixed(2)}/${r.nodeMetrics.recall.toFixed(2)}/${r.nodeMetrics.f1.toFixed(2)}`.padStart(
        13,
      );
    const edgePrf =
      `${r.edgeMetrics.precision.toFixed(2)}/${r.edgeMetrics.recall.toFixed(2)}/${r.edgeMetrics.f1.toFixed(2)}`.padStart(
        13,
      );
    const strAcc = r.strengthAccuracy.toFixed(2).padStart(6);
    lines.push(`${caseId} | ${nodePrf} | ${edgePrf} | ${strAcc}`);
  }

  lines.push('');

  // Worst performing cases
  const worstCases = [...results].sort((a, b) => a.nodeMetrics.f1 - b.nodeMetrics.f1).slice(0, 3);
  if (worstCases.length > 0 && worstCases[0].nodeMetrics.f1 < 1.0) {
    lines.push('=== Lowest F1 Cases ===');
    for (const r of worstCases) {
      if (r.nodeMetrics.f1 >= 1.0) break;
      lines.push(
        `  ${r.caseId}: Node F1=${r.nodeMetrics.f1.toFixed(3)}, Edge F1=${r.edgeMetrics.f1.toFixed(3)}`,
      );
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

  // Run rule-engine comparison
  const ruleEngineResults: CaseMetrics[] = [];
  for (const fixture of fixtures) {
    // For rule engine, always use the simulated extraction
    const extraction = simulateRuleEngineExtraction(fixture.input);
    const nodeResult = evaluateNodes(fixture.expectedNodes, extraction.nodes);
    const edgeResult = evaluateEdges(fixture.expectedEdges, extraction.edges);

    ruleEngineResults.push({
      caseId: fixture.id,
      nodeMetrics: computeMetrics(nodeResult.tp, nodeResult.fp, nodeResult.fn),
      edgeMetrics: computeMetrics(edgeResult.tp, edgeResult.fp, edgeResult.fn),
      strengthAccuracy:
        edgeResult.totalStrengths > 0 ? edgeResult.correctStrengths / edgeResult.totalStrengths : 0,
      totalExpectedStrengths: edgeResult.totalStrengths,
      correctStrengths: edgeResult.correctStrengths,
    });
  }

  const ruleEngineAgg = aggregateMetrics(ruleEngineResults);

  // Print report
  console.log(formatReport(results, agg, ruleEngineResults, ruleEngineAgg, options.dryRun));

  const durationMs = Date.now() - startTime;
  console.log(`Duration: ${durationMs}ms`);
  console.log('');

  // In live mode, check if LLM outperforms rule engine
  if (!options.dryRun) {
    const llmBetter =
      agg.avgNodeF1 > ruleEngineAgg.avgNodeF1 || agg.avgEdgeF1 > ruleEngineAgg.avgEdgeF1;
    if (llmBetter) {
      console.log('LLM extraction outperforms rule engine baseline.');
    } else {
      console.log('WARNING: LLM extraction does not outperform rule engine baseline.');
    }
  }

  console.log('Evaluation completed successfully.');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
