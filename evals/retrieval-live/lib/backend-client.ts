/**
 * Backend HTTP client for live retrieval evaluation.
 *
 * Sends real HTTP requests to a running TrapMap service instance
 * and normalizes responses using the same pipeline as offline eval.
 */

import type { RetrievalEvalEndpoint } from '@trapmap/contracts/evals';

import { normalizeResponse } from '../../retrieval/lib/normalize.js';
import type {
  BackendClientOptions,
  LiveExecutionMetadata,
  LiveEvalCase,
  NormalizedResult,
} from './types.js';

/**
 * Execute a retrieval request against the live backend.
 * Normalizes the response using the same pipeline as offline eval.
 *
 * @param client - Backend client options (baseUrl, authToken)
 * @param case_ - The live eval case to execute
 * @returns Normalized result and execution metadata
 */
export async function executeLiveRequest(
  client: BackendClientOptions,
  case_: LiveEvalCase,
): Promise<{
  result: NormalizedResult;
  execution: LiveExecutionMetadata;
}> {
  const startTime = Date.now();

  const payload =
    case_.endpoint === '/v1/retrieval/skills/search-by-content'
      ? {
          text: case_.request.seed,
          ...(case_.request.maxResults !== undefined
            ? { maxResults: case_.request.maxResults }
            : {}),
        }
      : case_.request;

  const url = `${client.baseUrl.replace(/\/+$/, '')}${case_.endpoint}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${client.authToken}`,
    },
    body: JSON.stringify(payload),
  });

  const durationMs = Date.now() - startTime;
  const statusCode = response.status;

  if (statusCode >= 400) {
    const body = await response.text();
    const emptyResult: NormalizedResult = {
      hits: [],
      returnedIds: [],
      buckets: { globalConstraints: [], projectKnowledge: [] },
      profileHintArtifactIds: [],
      artifactIds: [],
      isEmpty: true,
      rawResponse: { error: body, statusCode },
      endpoint: case_.endpoint,
    };

    return {
      result: emptyResult,
      execution: {
        backendBaseUrl: client.baseUrl,
        statusCode,
        durationMs,
        endpoint: case_.endpoint,
        fallbackApplied: false,
      },
    };
  }

  const responseBody = (await response.json()) as Record<string, unknown>;
  const result = normalizeResponse(responseBody, case_.endpoint);

  return {
    result,
    execution: {
      backendBaseUrl: client.baseUrl,
      statusCode,
      durationMs,
      endpoint: case_.endpoint,
      routingTrace: result.routingTrace,
      fallbackApplied: result.routingTrace?.fallbackApplied ?? false,
    },
  };
}
