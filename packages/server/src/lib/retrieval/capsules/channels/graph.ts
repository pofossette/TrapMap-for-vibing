/**
 * Capsule graph recall channel.
 *
 * Leverages skill artifact graph documents for structured recall augmentation.
 * Uses graph-based one-hop expansion from query entities to discover related
 * artifact capsules that might not match via keyword or semantic channels.
 *
 * Designed as a recall supplement, not a ranking authority:
 * - Graph results enter the merge layer on equal footing with other channels
 * - Rerank layer determines final ordering based on intent-aware features
 *
 * Graph recall strategy (from v2 multi-recall plan):
 *   graph recall artifact IDs -> map to artifact capsules -> rerank within artifact
 *
 * Security note: Graph-derived artifact IDs are always intersected with
 * governed artifacts. The channel cannot introduce unauthorized capsules.
 */

import type { GraphIndexRepository } from '@trapmap/server/lib/graph-index/repository.js';
import type { GraphQueryBackend } from '@trapmap/server/lib/graph-query/backend.js';
import { createMemoryGraphQueryBackend } from '@trapmap/server/lib/graph-query/memory-backend.js';
import type { NormalizedIndexDocument } from '@trapmap/server/lib/indexing/types.js';
import { extractGovernedCapsules } from '@trapmap/server/lib/retrieval/capsules/capsule-recall.js';
import { extractGraphEntities } from '@trapmap/server/lib/retrieval/recall/graph-extract.js';
import type {
  ArtifactGovernanceFilters,
  CapsuleRecallCandidate,
  CapsuleRecallChannel,
  CapsuleRecallChannelName,
  ParsedIntent,
} from '@trapmap/server/lib/retrieval/types.js';
import type { SkillArtifactRecord } from '@trapmap/server/lib/store.js';

/**
 * Build a normalized document from query text for entity extraction.
 * Reuses the same extraction logic that built the graph index.
 */
function buildQueryDocument(queryText: string): NormalizedIndexDocument {
  return {
    entryId: 'query',
    teamId: null,
    scope: 'global',
    requiredLevel: 0,
    lifecycleState: 'approved',
    revision: 0,
    updatedAt: new Date().toISOString(),
    shortcut: queryText,
    detail: '',
    labels: [],
    canonicalText: queryText,
    tokens: [],
    contentHash: '',
    normalizedAt: new Date().toISOString(),
    boundary: null,
  };
}

/**
 * Extract entity values from query text that can be matched against graph nodes.
 * Returns a set of normalized entity values.
 */
function extractQueryEntityLabels(queryText: string): Set<string> {
  if (!queryText || queryText.trim().length === 0) return new Set();

  const normalizedDoc = buildQueryDocument(queryText);
  const extractionResult = extractGraphEntities(normalizedDoc);
  const entityValues = new Set<string>();

  for (const entity of extractionResult.entities) {
    if (entity.normalizedValue.length > 1) {
      entityValues.add(entity.normalizedValue);
    }
  }

  return entityValues;
}

/**
 * Score a graph-derived capsule candidate based on entity overlap and relation strength.
 *
 * Scoring strategy:
 * - Base score of 0.85 for capsules whose artifact was found via graph expansion
 * - Bonus up to 0.15 based on relation strength to query entities
 * - Caps at 1.0
 */
function calculateCapsuleGraphScore(relationStrength: number): number {
  const baseScore = 0.85;
  const bonus = Math.min(relationStrength * 0.01, 0.15);
  return Math.min(1, Math.round((baseScore + bonus) * 10000) / 10000);
}

/**
 * Create a capsule-graph recall channel backed by a GraphIndexRepository.
 *
 * Uses a factory function pattern (like v1's createGraphChannel) because
 * the channel depends on GraphIndexRepository which is not available at
 * module load time.
 *
 * @param graphIndexRepo - Repository for graph index documents
 * @returns A CapsuleRecallChannel that supplements recall via graph expansion
 */
export function createCapsuleGraphChannel(
  graphQuery: GraphQueryBackend | GraphIndexRepository,
): CapsuleRecallChannel {
  const graphBackend = isGraphQueryBackend(graphQuery)
    ? graphQuery
    : createMemoryGraphQueryBackend(graphQuery);

  return {
    name: 'capsule-graph' as CapsuleRecallChannelName,

    async recall(
      artifacts: SkillArtifactRecord[],
      intent: ParsedIntent,
      filters: ArtifactGovernanceFilters,
      maxResults: number,
    ): Promise<CapsuleRecallCandidate[]> {
      const governed = extractGovernedCapsules(artifacts, filters);

      if (governed.length === 0) return [];

      const queryText = intent.seed || intent.normalized;
      if (!queryText || queryText.trim().length === 0) return [];

      const queryEntities = extractQueryEntityLabels(queryText);
      if (queryEntities.size === 0) return [];

      const expandedSourceIds = await graphBackend.expandSourcesOneHop({
        queryLabels: queryEntities,
        eligibleSourceIds: new Set(governed.map((entry) => entry.artifact.id)),
      });

      if (expandedSourceIds.size === 0) return [];

      const capsulesByArtifactId = new Map<string, typeof governed>();
      for (const entry of governed) {
        const existing = capsulesByArtifactId.get(entry.artifact.id) ?? [];
        existing.push(entry);
        capsulesByArtifactId.set(entry.artifact.id, existing);
      }

      const candidates: CapsuleRecallCandidate[] = [];

      for (const sourceId of expandedSourceIds) {
        const governedCapsules = capsulesByArtifactId.get(sourceId);
        if (!governedCapsules || governedCapsules.length === 0) continue;

        const relationStrength = await graphBackend.calculateSourceRelationStrength({
          sourceId,
          queryLabels: queryEntities,
        });

        if (relationStrength <= 0) continue;

        const score = calculateCapsuleGraphScore(relationStrength);

        const graphEvidence = Array.from(queryEntities).slice(0, 5);

        for (const { capsule } of governedCapsules) {
          candidates.push({
            capsuleId: capsule.capsuleId,
            artifactId: capsule.artifactId,
            revision: capsule.revision,
            channel: 'capsule-graph' as CapsuleRecallChannelName,
            score,
            graphEvidence,
          });
        }
      }

      candidates.sort((a, b) => b.score - a.score);

      return candidates.slice(0, maxResults);
    },
  };
}

function isGraphQueryBackend(
  value: GraphQueryBackend | GraphIndexRepository,
): value is GraphQueryBackend {
  return 'kind' in value && typeof value.healthcheck === 'function';
}
