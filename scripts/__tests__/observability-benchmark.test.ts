import { describe, expect, it } from 'vitest';

import { parseMetricValue, summarizeSamples } from '../observability-benchmark.js';

describe('observability benchmark helpers', () => {
  it('parses prometheus metric values from exposition text', () => {
    const metrics = `
# HELP process_resident_memory_bytes Resident memory size in bytes.
# TYPE process_resident_memory_bytes gauge
process_resident_memory_bytes 123456
trapmap_process_resident_memory_bytes 234567
nodejs_heap_size_used_bytes 654321
`;

    expect(parseMetricValue(metrics, 'process_resident_memory_bytes')).toBe(123456);
    expect(parseMetricValue(metrics, 'trapmap_process_resident_memory_bytes')).toBe(234567);
    expect(parseMetricValue(metrics, 'nodejs_heap_size_used_bytes')).toBe(654321);
    expect(parseMetricValue(metrics, 'missing_metric')).toBeNull();
  });

  it('summarizes samples with avg p50 p95 and min/max', () => {
    const summary = summarizeSamples([10, 20, 30, 40, 50]);

    expect(summary).toEqual({
      avgMs: 30,
      minMs: 10,
      maxMs: 50,
      p50Ms: 30,
      p95Ms: 50,
    });
  });
});
