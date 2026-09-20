import { z } from 'zod';

import {
  retrievalLatencyEndpointSchema,
  retrievalLatencyOutcomeSchema,
  retrievalPipelineStageSchema,
  retrievalRecallChannelSchema,
} from '../enum-types/retrieval-latency.js';

/**
 * Retrieval latency measurement contract.
 *
 * Shared by three producers/consumers so all of them agree on one shape:
 * the retrieval pipeline (`searchKnowledge`), the offline bench harness
 * (`scripts/retrieval-latency-bench.ts`) and the log/report tooling
 * (`scripts/retrieval-latency-report.ts`).
 *
 * Latency is internal-only: it is never added to `RetrievalResponse`.
 */

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

/** One timed unit emitted by the pipeline: a stage run or a channel run. */
export const retrievalLatencySampleSchema = z.object({
  endpoint: retrievalLatencyEndpointSchema,
  /** Present for stage samples; `total` marks the end-to-end sample. */
  stage: retrievalPipelineStageSchema,
  /** Present only for `recall-channel` samples. */
  channel: retrievalRecallChannelSchema.optional(),
  durationMs: z.number().nonnegative(),
});

export type RetrievalLatencySample = z.infer<typeof retrievalLatencySampleSchema>;

/** One retrieval request, as recorded end to end. */
export const retrievalLatencyRecordSchema = z.object({
  queryId: z.string().min(1),
  endpoint: retrievalLatencyEndpointSchema,
  /** Routing mode (`semantic` / `hybrid` / `graph-assisted` / …). */
  mode: z.string().min(1),
  outcome: retrievalLatencyOutcomeSchema,
  totalMs: z.number().nonnegative(),
  resultCount: z.number().int().nonnegative(),
  stages: z.array(retrievalLatencySampleSchema),
  channels: z.array(retrievalLatencySampleSchema),
  timestamp: z.string(),
});

export type RetrievalLatencyRecord = z.infer<typeof retrievalLatencyRecordSchema>;

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

/** Percentile summary over a set of samples. */
export const latencySummarySchema = z.object({
  count: z.number().int().nonnegative(),
  minMs: z.number().nonnegative(),
  p50Ms: z.number().nonnegative(),
  p95Ms: z.number().nonnegative(),
  p99Ms: z.number().nonnegative(),
  maxMs: z.number().nonnegative(),
  avgMs: z.number().nonnegative(),
});

export type LatencySummary = z.infer<typeof latencySummarySchema>;

/** One row of the report: a `(endpoint, dimension)` cell with its summary. */
export const retrievalLatencySliceSchema = z.object({
  endpoint: retrievalLatencyEndpointSchema,
  /** Stage name, or `channel:<name>` for channel rows, or `total`. */
  dimension: z.string().min(1),
  summary: latencySummarySchema,
  /** True when the dimension has no live implementation and samples stay 0. */
  dead: z.boolean().default(false),
});

export type RetrievalLatencySlice = z.infer<typeof retrievalLatencySliceSchema>;

export const retrievalLatencyReportSchema = z.object({
  generatedAt: z.string(),
  source: z.string(),
  sampleCount: z.number().int().nonnegative(),
  slices: z.array(retrievalLatencySliceSchema),
});

export type RetrievalLatencyReport = z.infer<typeof retrievalLatencyReportSchema>;

// ---------------------------------------------------------------------------
// Pure aggregation helper (domain: no I/O, no framework)
// ---------------------------------------------------------------------------

function percentile(sorted: number[], ratio: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index] ?? 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Summarise raw millisecond samples into the report shape.
 *
 * Kept in `contracts` (not in a script) so the bench harness, the report
 * tooling and any future test all compute percentiles identically.
 */
export function summarizeLatency(samples: number[]): LatencySummary {
  if (samples.length === 0) {
    return { count: 0, minMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0, avgMs: 0 };
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    minMs: round2(sorted[0] ?? 0),
    p50Ms: round2(percentile(sorted, 0.5)),
    p95Ms: round2(percentile(sorted, 0.95)),
    p99Ms: round2(percentile(sorted, 0.99)),
    maxMs: round2(sorted[sorted.length - 1] ?? 0),
    avgMs: round2(total / sorted.length),
  };
}

/** Dimension key used by report rows for a channel slice. */
export function channelDimension(channel: string): string {
  return `channel:${channel}`;
}
