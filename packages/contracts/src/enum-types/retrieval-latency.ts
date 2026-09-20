import { z } from 'zod';

/**
 * Retrieval latency measurement taxonomy.
 *
 * Two orthogonal slicing dimensions plus the pipeline stage dimension:
 *
 * - **endpoint** — the four retrieval surfaces (四路), mirrored from the eval
 *   contract `retrievalEvalEndpointSchema` in `evals/types/retrieval.ts`.
 * - **channel** — the recall channels (四通道) documented in
 *   `docs/architecture/components/RETRIEVAL.md`.
 * - **stage** — the timed steps of `searchKnowledge()`.
 *
 * History: `v2-capsule` and `heuristic` were reserved-but-dead until
 * 2026-09-19, when the capsule-native pipeline was implemented and registered
 * on both hosts. The enums keep all four members so the contract shape stays
 * stable across code, docs and evals; the LIVE/DEAD lists below say which of
 * them actually produce samples today.
 */

// ---------------------------------------------------------------------------
// Endpoint dimension (四路)
// ---------------------------------------------------------------------------

export const RETRIEVAL_LATENCY_ENDPOINTS = [
  'v1-search',
  'v1-skills',
  'v2-capsule',
  'v3-graph-plan',
  'unknown',
] as const;

export const retrievalLatencyEndpointSchema = z.enum(RETRIEVAL_LATENCY_ENDPOINTS);

export type RetrievalLatencyEndpoint = z.infer<typeof retrievalLatencyEndpointSchema>;

/**
 * Endpoints that are wired to a live host route today.
 *
 * `v2-capsule` joined this list on 2026-09-19 with the capsule-native
 * pipeline (`service-knowledge-read/src/search/capsule-recall.ts`).
 */
export const LIVE_RETRIEVAL_LATENCY_ENDPOINTS: readonly RetrievalLatencyEndpoint[] = [
  'v1-search',
  'v1-skills',
  'v2-capsule',
  'v3-graph-plan',
];

/**
 * Endpoints with no live implementation — their series stay at zero.
 *
 * Empty as of 2026-09-19; kept so the contract still expresses the concept and
 * the report/eval tooling does not need a shape change when one appears again.
 */
export const DEAD_RETRIEVAL_LATENCY_ENDPOINTS: readonly RetrievalLatencyEndpoint[] = [];

// ---------------------------------------------------------------------------
// Channel dimension (四通道)
// ---------------------------------------------------------------------------

export const RETRIEVAL_RECALL_CHANNELS = ['heuristic', 'keyword', 'semantic', 'graph'] as const;

export const retrievalRecallChannelSchema = z.enum(RETRIEVAL_RECALL_CHANNELS);

export type RetrievalRecallChannel = z.infer<typeof retrievalRecallChannelSchema>;

/**
 * Channels with a live code path.
 *
 * `heuristic` and `capsule` joined on 2026-09-19 with the v2 capsule pipeline:
 * the in-process rule channel ranks the capsule pool when the vector index has
 * no rows yet.
 */
export const LIVE_RETRIEVAL_RECALL_CHANNELS: readonly RetrievalRecallChannel[] = [
  'keyword',
  'semantic',
  'graph',
  'heuristic',
];

/** Channels with no live implementation — their series stay at zero. */
export const DEAD_RETRIEVAL_RECALL_CHANNELS: readonly RetrievalRecallChannel[] = [];

// ---------------------------------------------------------------------------
// Stage dimension (管道阶段)
// ---------------------------------------------------------------------------

/**
 * Timed stages of `searchKnowledge()`. Mirrors the `timedStep()` call names so
 * the metric label and the RAG log step name can never drift apart.
 * `recall-channel` is the per-channel breakdown emitted inside `recall`.
 */
export const RETRIEVAL_PIPELINE_STAGES = [
  'parse',
  'snapshot',
  'eligibility',
  'boundary-filter',
  'routing',
  'recall',
  'recall-channel',
  'assembly',
  'summary',
  'refinement',
  'total',
] as const;

export const retrievalPipelineStageSchema = z.enum(RETRIEVAL_PIPELINE_STAGES);

export type RetrievalPipelineStage = z.infer<typeof retrievalPipelineStageSchema>;

// ---------------------------------------------------------------------------
// Outcome
// ---------------------------------------------------------------------------

export const retrievalLatencyOutcomeSchema = z.enum(['ok', 'empty', 'error']);

export type RetrievalLatencyOutcome = z.infer<typeof retrievalLatencyOutcomeSchema>;
