/**
 * Routing trace builder for RAG retrieval logging.
 *
 * Combines routing decision metadata with optional graph recall trace data.
 */

import type { RetrievalDecision } from './routing.js';
import { toRoutingTrace } from './routing.js';

export function buildRoutingTrace(
  routingDecision: RetrievalDecision,
  recallTrace?: { graph?: unknown },
) {
  return {
    ...toRoutingTrace(routingDecision),
    ...(recallTrace?.graph ? { graphRetrieval: recallTrace.graph } : {}),
  };
}
