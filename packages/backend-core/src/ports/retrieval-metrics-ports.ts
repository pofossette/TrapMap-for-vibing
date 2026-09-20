import type {
  RetrievalLatencyEndpoint,
  RetrievalLatencyOutcome,
  RetrievalPipelineStage,
  RetrievalRecallChannel,
} from '@trapmap/contracts';

/**
 * Retrieval latency metrics port.
 *
 * Mirrors the {@link ExperienceGeneMetricsPort} three-part shape:
 * `backend-core` declares the contract, hosts supply the concrete
 * implementation (Prometheus for `host-local`, OTel for `host-distributed`),
 * and the composition root injects it. The port is optional everywhere it is
 * consumed — absence means "no latency emission", never a runtime failure.
 *
 * Label discipline: only the low-cardinality enums below may reach a metric
 * label. `seed`, `entryId`, `teamId`, `userId` and prompt text are forbidden.
 */

export interface RetrievalSearchLatencyParams {
  /** Which of the four retrieval surfaces served the request. */
  endpoint: RetrievalLatencyEndpoint;
  /** Routing mode (`semantic` / `hybrid` / `graph-assisted` / …). */
  mode: string;
  outcome: RetrievalLatencyOutcome;
  durationMs: number;
  resultCount: number;
}

export interface RetrievalStageLatencyParams {
  endpoint: RetrievalLatencyEndpoint;
  /** Timed step name; `total` is reserved for the end-to-end sample. */
  stage: RetrievalPipelineStage;
  durationMs: number;
}

export interface RetrievalChannelLatencyParams {
  endpoint: RetrievalLatencyEndpoint;
  channel: RetrievalRecallChannel;
  durationMs: number;
}

export interface RetrievalMetricsPort {
  recordSearch(params: RetrievalSearchLatencyParams): void;
  recordStage(params: RetrievalStageLatencyParams): void;
  recordChannel(params: RetrievalChannelLatencyParams): void;
}
