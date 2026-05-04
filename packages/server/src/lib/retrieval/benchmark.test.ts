import { describe, expect, it } from 'vitest';

import type { KnowledgeRecord } from '../store.js';
import type { RetrievalBenchmarkResult } from './benchmark.js';
import {
  BENCHMARK_SCENARIOS,
  compareBenchmarkResults,
  formatBenchmarkReport,
  measurePipelineStep,
  runRetrievalBenchmark,
} from './benchmark.js';

/**
 * Helper to create mock knowledge entries for testing.
 */
function makeEntry(id: string, overrides?: Partial<KnowledgeRecord>): KnowledgeRecord {
  return {
    id,
    scope: 'global',
    shortcut: `shortcut-${id}`,
    detail: `Detail for ${id}`,
    labels: ['test'],
    requiredLevel: 'user',
    history: [],
    embeddingCache: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  } as KnowledgeRecord;
}

describe('benchmark', () => {
  describe('measurePipelineStep', () => {
    it('measures latency of async operations', async () => {
      const [result, latencyMs] = await measurePipelineStep('test-step', async () => {
        // Simulate some work
        await new Promise((resolve) => setTimeout(resolve, 10));
        return 42;
      });

      expect(result).toBe(42);
      expect(latencyMs).toBeGreaterThanOrEqual(0);
      expect(latencyMs).toBeLessThan(100); // Should be fast
    });

    it('returns zero latency for instant operations', async () => {
      const [result, latencyMs] = await measurePipelineStep('instant', async () => {
        return 'done';
      });

      expect(result).toBe('done');
      expect(latencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('runRetrievalBenchmark', () => {
    it('produces latency breakdown per pipeline step', async () => {
      const entries = [makeEntry('entry-1'), makeEntry('entry-2'), makeEntry('entry-3')];

      const result = await runRetrievalBenchmark(entries, 'test query', 'semantic');

      expect(result.timestamp).toBeDefined();
      expect(result.scenario).toBe('semantic-benchmark');
      expect(result.entryCount).toBe(3);
      expect(result.totalLatencyMs).toBeGreaterThanOrEqual(0);
      expect(result.steps.parse).toBeGreaterThanOrEqual(0);
      expect(result.steps.snapshot).toBeGreaterThanOrEqual(0);
      expect(result.steps.eligibility).toBeGreaterThanOrEqual(0);
      expect(result.steps.routing).toBeGreaterThanOrEqual(0);
      expect(result.steps.recall).toBeGreaterThanOrEqual(0);
      expect(result.steps.assembly).toBeGreaterThanOrEqual(0);
      expect(result.memoryUsage.heapUsedMB).toBeGreaterThan(0);
      expect(result.memoryUsage.heapTotalMB).toBeGreaterThan(0);
    });

    it('works with empty entries array', async () => {
      const result = await runRetrievalBenchmark([], 'empty query', 'semantic');

      expect(result.entryCount).toBe(0);
      expect(result.totalLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('handles different retrieval modes', async () => {
      const entries = [makeEntry('entry-1')];

      const semanticResult = await runRetrievalBenchmark(entries, 'test', 'semantic');
      expect(semanticResult.scenario).toBe('semantic-benchmark');

      const hybridResult = await runRetrievalBenchmark(entries, 'test', 'hybrid');
      expect(hybridResult.scenario).toBe('hybrid-benchmark');

      const graphResult = await runRetrievalBenchmark(entries, 'test', 'graph-assisted');
      expect(graphResult.scenario).toBe('graph-assisted-benchmark');
    });

    it('handles large datasets', async () => {
      const entries = Array.from({ length: 100 }, (_, i) => makeEntry(`entry-${i}`));

      const result = await runRetrievalBenchmark(entries, 'large dataset query', 'semantic');

      expect(result.entryCount).toBe(100);
      expect(result.totalLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('compareBenchmarkResults', () => {
    it('calculates improvement percentage', () => {
      const before: RetrievalBenchmarkResult = {
        timestamp: new Date().toISOString(),
        scenario: 'test',
        entryCount: 10,
        totalLatencyMs: 100,
        steps: {
          parse: 10,
          snapshot: 20,
          eligibility: 30,
          routing: 10,
          recall: 20,
          assembly: 10,
        },
        memoryUsage: { heapUsedMB: 50, heapTotalMB: 100 },
      };

      const after: RetrievalBenchmarkResult = {
        ...before,
        totalLatencyMs: 50,
        steps: {
          parse: 5,
          snapshot: 10,
          eligibility: 15,
          routing: 5,
          recall: 10,
          assembly: 5,
        },
      };

      const comparison = compareBenchmarkResults(before, after);

      expect(comparison.improvement).toBe(50);
      expect(comparison.stepImprovements.parse).toBe(50);
      expect(comparison.stepImprovements.snapshot).toBe(50);
      expect(comparison.stepImprovements.eligibility).toBe(50);
      expect(comparison.stepImprovements.routing).toBe(50);
      expect(comparison.stepImprovements.recall).toBe(50);
      expect(comparison.stepImprovements.assembly).toBe(50);
    });

    it('handles zero baseline latency', () => {
      const before: RetrievalBenchmarkResult = {
        timestamp: new Date().toISOString(),
        scenario: 'test',
        entryCount: 0,
        totalLatencyMs: 0,
        steps: {
          parse: 0,
          snapshot: 0,
          eligibility: 0,
          routing: 0,
          recall: 0,
          assembly: 0,
        },
        memoryUsage: { heapUsedMB: 50, heapTotalMB: 100 },
      };

      const after: RetrievalBenchmarkResult = {
        ...before,
        totalLatencyMs: 10,
      };

      const comparison = compareBenchmarkResults(before, after);

      expect(comparison.improvement).toBe(0);
      expect(comparison.stepImprovements.parse).toBe(0);
    });

    it('handles negative improvement (regression)', () => {
      const before: RetrievalBenchmarkResult = {
        timestamp: new Date().toISOString(),
        scenario: 'test',
        entryCount: 10,
        totalLatencyMs: 50,
        steps: {
          parse: 5,
          snapshot: 10,
          eligibility: 15,
          routing: 5,
          recall: 10,
          assembly: 5,
        },
        memoryUsage: { heapUsedMB: 50, heapTotalMB: 100 },
      };

      const after: RetrievalBenchmarkResult = {
        ...before,
        totalLatencyMs: 100,
        steps: {
          parse: 10,
          snapshot: 20,
          eligibility: 30,
          routing: 10,
          recall: 20,
          assembly: 10,
        },
      };

      const comparison = compareBenchmarkResults(before, after);

      expect(comparison.improvement).toBe(-100);
      expect(comparison.stepImprovements.parse).toBe(-100);
    });
  });

  describe('formatBenchmarkReport', () => {
    it('formats benchmark result as readable report', () => {
      const result: RetrievalBenchmarkResult = {
        timestamp: '2026-05-04T12:00:00Z',
        scenario: 'test-scenario',
        entryCount: 10,
        totalLatencyMs: 150,
        steps: {
          parse: 10,
          snapshot: 20,
          eligibility: 30,
          routing: 10,
          recall: 60,
          assembly: 20,
        },
        memoryUsage: { heapUsedMB: 45.5, heapTotalMB: 100.25 },
      };

      const report = formatBenchmarkReport(result);

      expect(report).toContain('Benchmark: test-scenario');
      expect(report).toContain('Entry Count: 10');
      expect(report).toContain('Total Latency: 150ms');
      expect(report).toContain('parse:        10ms');
      expect(report).toContain('snapshot:     20ms');
      expect(report).toContain('eligibility:  30ms');
      expect(report).toContain('routing:      10ms');
      expect(report).toContain('recall:       60ms');
      expect(report).toContain('assembly:     20ms');
      expect(report).toContain('Heap Used:    45.5MB');
      expect(report).toContain('Heap Total:   100.25MB');
    });
  });

  describe('BENCHMARK_SCENARIOS', () => {
    it('defines predefined scenarios', () => {
      expect(BENCHMARK_SCENARIOS).toHaveLength(4);

      const semanticSmall = BENCHMARK_SCENARIOS.find((s) => s.name === 'semantic-small');
      expect(semanticSmall).toBeDefined();
      expect(semanticSmall!.mode).toBe('semantic');

      const hybridKeyword = BENCHMARK_SCENARIOS.find((s) => s.name === 'hybrid-keyword');
      expect(hybridKeyword).toBeDefined();
      expect(hybridKeyword!.mode).toBe('hybrid');

      const graphAssisted = BENCHMARK_SCENARIOS.find((s) => s.name === 'graph-assisted');
      expect(graphAssisted).toBeDefined();
      expect(graphAssisted!.mode).toBe('graph-assisted');
    });
  });
});
