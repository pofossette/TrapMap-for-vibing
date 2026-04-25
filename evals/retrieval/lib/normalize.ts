/**
 * Endpoint-specific response normalization.
 *
 * Phase 26-01: REVAL-01
 * Normalizes v1 bucketed responses and v2 capsule-first responses
 * into a common scored-hit model suitable for ranking metrics.
 *
 * Endpoint identity is preserved for diagnostics and reporting.
 */

import type {
  GraphPlanSearchResponse,
  RetrievalResponse,
  RetrievalV2ResponseWithHints,
} from '../../../packages/contracts/src/index.js';
import type {
  BucketMap,
  NormalizedHit,
  NormalizedResult,
} from './types.js';

// =============================================================================
// V1 Response Normalization
// =============================================================================

/**
 * Normalize a v1 retrieval response.
 * v1 returns bucketed results: globalConstraints and projectKnowledge.
 *
 * @param response - Raw v1 response
 * @returns Normalized result with bucket map preserved
 */
export function normalizeV1Response(
  response: RetrievalResponse,
): NormalizedResult {
  const globalConstraints = response.globalConstraints ?? [];
  const projectKnowledge = response.projectKnowledge ?? [];

  // Collect all matches and sort by score descending
  const allMatches = [...globalConstraints, ...projectKnowledge]
    .sort((a, b) => b.score - a.score);

  // Build normalized hits
  const hits: NormalizedHit[] = allMatches.map((match) => ({
    id: match.entryId,
    score: match.score,
    reason: match.reason,
    scope: match.scope,
  }));

  // Build bucket map
  const buckets: BucketMap = {
    globalConstraints: globalConstraints.map((m) => m.entryId),
    projectKnowledge: projectKnowledge.map((m) => m.entryId),
  };

  return {
    hits,
    returnedIds: hits.map((h) => h.id),
    buckets,
    profileHintArtifactIds: [], // v1 has no profile hints
    isEmpty: hits.length === 0,
    rawResponse: response,
    endpoint: '/v1/retrieval/search',
  };
}

// =============================================================================
// V2 Response Normalization
// =============================================================================

/**
 * Normalize a v2 retrieval response.
 * v2 returns capsule-first results with profile hints.
 *
 * @param response - Raw v2 response with activation hints
 * @returns Normalized result with profile hints preserved
 */
export function normalizeV2Response(
  response: RetrievalV2ResponseWithHints,
): NormalizedResult {
  const capsules = response.capsules ?? [];
  const profileHints = response.profileHints ?? [];

  // Capsules are already sorted by score descending from the server
  const hits: NormalizedHit[] = capsules.map((capsule) => ({
    id: capsule.capsuleId,
    score: capsule.score,
    reason: capsule.reason,
    scope: capsule.scope,
  }));

  // Empty bucket map for v2
  const buckets: BucketMap = {
    globalConstraints: [],
    projectKnowledge: [],
  };

  return {
    hits,
    returnedIds: hits.map((h) => h.id),
    buckets,
    profileHintArtifactIds: profileHints.map((h) => h.artifactId),
    isEmpty: hits.length === 0,
    rawResponse: response,
    endpoint: '/v2/retrieval/search',
  };
}

// =============================================================================
// V3 Graph-Plan Wrapper Response Normalization
// =============================================================================

/**
 * Normalize a v3 GraphRAG-lite wrapper response.
 * Selected plans normalize from recommendedSkills; fallback responses normalize
 * from the legacy payload shape they wrap.
 *
 * @param response - Raw v3 graph-plan wrapper response
 * @returns Normalized result with routing trace preserved
 */
export function normalizeV3Response(
  response: GraphPlanSearchResponse,
): NormalizedResult {
  const routingTrace = response.routingTrace;

  if (response.plan) {
    const recommendedSkills = response.plan.graph.nodes
      .filter((node) =>
        node.kind === 'skill' &&
        response.plan?.graph.focus.recommendedSkillNodeIds.includes(node.nodeId),
      )
      .slice()
      .sort((a, b) => b.score - a.score);

    const hits: NormalizedHit[] = recommendedSkills.map((skill) => ({
      id: skill.capsuleId ?? skill.artifactId,
      score: skill.score,
      reason: skill.label,
      scope: skill.scope,
    }));

    return {
      hits,
      returnedIds: hits.map((h) => h.id),
      buckets: {
        globalConstraints: [],
        projectKnowledge: [],
      },
      profileHintArtifactIds: recommendedSkills.map((skill) => skill.artifactId),
      isEmpty: hits.length === 0,
      rawResponse: response,
      endpoint: '/v3/retrieval/search',
      routingTrace: {
        selectedMode: routingTrace.selectedMode,
        routingReason: routingTrace.routingReason,
        fallbackApplied: routingTrace.fallbackApplied,
        channelsUsed: routingTrace.channelsUsed,
      },
    };
  }

  if (response.fallback?.routeFamily === 'capsule') {
    const normalized = normalizeV2Response(response.fallback.response);
    return {
      ...normalized,
      rawResponse: response,
      endpoint: '/v3/retrieval/search',
      routingTrace: {
        selectedMode: routingTrace.selectedMode,
        routingReason: routingTrace.routingReason,
        fallbackApplied: routingTrace.fallbackApplied,
        channelsUsed: routingTrace.channelsUsed,
      },
    };
  }

  if (response.fallback?.routeFamily === 'entry') {
    const normalized = normalizeV1Response(response.fallback.response);
    return {
      ...normalized,
      rawResponse: response,
      endpoint: '/v3/retrieval/search',
      routingTrace: {
        selectedMode: routingTrace.selectedMode,
        routingReason: routingTrace.routingReason,
        fallbackApplied: routingTrace.fallbackApplied,
        channelsUsed: routingTrace.channelsUsed,
      },
    };
  }

  return {
    hits: [],
    returnedIds: [],
    buckets: { globalConstraints: [], projectKnowledge: [] },
    profileHintArtifactIds: [],
    isEmpty: true,
    rawResponse: response,
    endpoint: '/v3/retrieval/search',
    routingTrace: {
      selectedMode: routingTrace.selectedMode,
      routingReason: routingTrace.routingReason,
      fallbackApplied: routingTrace.fallbackApplied,
      channelsUsed: routingTrace.channelsUsed,
    },
  };
}

// =============================================================================
// Generic Normalization Dispatcher
// =============================================================================

/**
 * Normalize an endpoint response based on endpoint type.
 * Preserves endpoint identity in the result.
 *
 * @param response - Raw response from endpoint
 * @param endpoint - Endpoint that produced the response
 * @returns Normalized result
 */
export function normalizeResponse(
  response: unknown,
  endpoint: '/v1/retrieval/search' | '/v2/retrieval/search' | '/v3/retrieval/search',
): NormalizedResult {
  if (endpoint === '/v1/retrieval/search') {
    return normalizeV1Response(response as RetrievalResponse);
  }
  if (endpoint === '/v2/retrieval/search') {
    return normalizeV2Response(response as RetrievalV2ResponseWithHints);
  }
  return normalizeV3Response(response as GraphPlanSearchResponse);
}

// =============================================================================
// ID Extraction Helpers
// =============================================================================

/**
 * Extract all returned IDs from a v1 response.
 */
export function extractV1Ids(response: RetrievalResponse): string[] {
  const globalIds = (response.globalConstraints ?? []).map((m) => m.entryId);
  const projectIds = (response.projectKnowledge ?? []).map((m) => m.entryId);
  return [...globalIds, ...projectIds];
}

/**
 * Extract all returned capsule IDs from a v2 response.
 */
export function extractV2CapsuleIds(response: RetrievalV2ResponseWithHints): string[] {
  return (response.capsules ?? []).map((c) => c.capsuleId);
}

/**
 * Extract profile hint artifact IDs from a v2 response.
 */
export function extractV2ProfileHintArtifactIds(
  response: RetrievalV2ResponseWithHints,
): string[] {
  return (response.profileHints ?? []).map((h) => h.artifactId);
}
