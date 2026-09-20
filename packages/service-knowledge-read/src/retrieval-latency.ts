/**
 * Retrieval latency emission helpers.
 *
 * The retrieval pipeline already times every stage (`timedStep` in
 * `search-knowledge.ts`) but those numbers only ever reached the RAG log
 * file. These helpers are the single place where a timing becomes either a
 * metric observation (via the injected `RetrievalMetricsPort`) or a per-request
 * log sample — never both inconsistently.
 *
 * Rules enforced here:
 * - Only low-cardinality enums reach metric labels. `seed`, `entryId`,
 *   `teamId`, `userId` and prompt text never do.
 * - Every helper is a no-op when no sink is configured, so hosts that have not
 *   wired the port see identical behaviour to before.
 */

import type {
  RetrievalLatencyEndpoint,
  RetrievalPipelineStage,
  RetrievalRecallChannel,
} from '@trapmap/contracts';

import type { SkillShareerServices } from './context.js';

/** Endpoint used when the caller gave no attribution. */
export const DEFAULT_LATENCY_ENDPOINT: RetrievalLatencyEndpoint = 'unknown';

export function resolveLatencyEndpoint(
  query: { latencyEndpoint?: RetrievalLatencyEndpoint | undefined } | undefined,
): RetrievalLatencyEndpoint {
  return query?.latencyEndpoint ?? DEFAULT_LATENCY_ENDPOINT;
}

/**
 * Record one pipeline stage. Called from `timedStep` in `search-knowledge.ts`.
 */
export function emitStage(
  services: SkillShareerServices | undefined,
  endpoint: RetrievalLatencyEndpoint,
  stage: RetrievalPipelineStage,
  durationMs: number,
): void {
  services?.retrievalMetrics?.recordStage({ endpoint, stage, durationMs });
}

/**
 * Record one recall channel run and, when a per-request collector is present,
 * keep the sample so the RAG log can carry the channel breakdown too.
 */
export async function timedChannel<T>(
  services: SkillShareerServices | undefined,
  endpoint: RetrievalLatencyEndpoint,
  channel: RetrievalRecallChannel,
  run: () => Promise<T>,
): Promise<T> {
  if (!services?.retrievalMetrics && !services?.latencyChannelSamples) {
    return run();
  }

  const startedAt = Date.now();
  try {
    return await run();
  } finally {
    const durationMs = Date.now() - startedAt;
    services?.retrievalMetrics?.recordChannel({ endpoint, channel, durationMs });
    services?.latencyChannelSamples?.push({
      endpoint,
      stage: 'recall-channel',
      channel,
      durationMs,
    });
  }
}

/** Narrow a raw step name to the stage enum, falling back to `total`. */
export function toPipelineStage(name: string): RetrievalPipelineStage {
  switch (name) {
    case 'parse':
    case 'snapshot':
    case 'eligibility':
    case 'boundary-filter':
    case 'routing':
    case 'recall':
    case 'assembly':
    case 'summary':
    case 'refinement':
      return name;
    default:
      return 'total';
  }
}
