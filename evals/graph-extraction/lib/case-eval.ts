/**
 * Graph extraction case evaluation.
 *
 * Extracted from run.ts so the graph-extraction SuiteBridge can reuse the
 * per-case pipeline (LLM extraction -> node/edge match -> metrics) and the
 * aggregate metric computation without importing the runner entrypoint,
 * which would create a circular dependency with the bridge.
 */

import type { LlmGraphExtraction } from '@trapmap/contracts';

import type { ExpectedEdge, ExpectedNode, GraphExtractionFixture } from '../fixtures.js';
import { type ClassificationMetrics, computeMetrics } from './classification.js';

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
      '../../../packages/service-knowledge-read/src/graph-llm-extract.js'
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
