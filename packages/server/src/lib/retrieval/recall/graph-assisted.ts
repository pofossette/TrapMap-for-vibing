/**
 * Graph-assisted recall module for relationship-augmented retrieval.
 *
 * This module provides:
 * - Query entity extraction using shared extraction logic
 * - One-hop bounded expansion through graph relationships
 * - Authorization-safe candidate generation (intersects with eligible entries)
 * - Graph candidate scoring based on entity matches and relation strength
 * - Internal recall channel compatible with merge/rerank pipeline
 *
 * Security note: This module accepts only already-filtered eligible entries
 * from the caller. It does NOT perform approval/team/level filtering itself.
 * The filter stage must be applied before calling graphAssistedRecall.
 *
 * Threat mitigation (T-09-07): Graph-derived entry IDs are always intersected
 * with the eligible entry set before scoring or merge, ensuring unauthorized
 * entries can never appear in results.
 */

import type { GraphIndexRepository } from '@trapmap/server/lib/graph-index/repository.js';
import {
  type GraphQueryBackend,
  createMemoryGraphQueryBackend,
} from '@trapmap/server/lib/graph-query/index.js';
import type { RecallChannel } from '@trapmap/server/lib/retrieval/orchestration/index.js';
import type { RecallCandidate } from '@trapmap/server/lib/retrieval/types.js';
import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';
import { normalizeQueryGraphLabels } from './query-graph-labels.js';

/**
 * Scoring configuration for graph-assisted recall.
 */
interface GraphScoringConfig {
  /** Base score for direct entity match (default 0.7) */
  directMatchScore?: number;
  /** Score boost per supporting relation (default 0.1) */
  relationBoost?: number;
  /** Maximum score cap (default 1.0) */
  maxScore?: number;
}

function calculateGraphScore(
  directEntityMatches: number,
  relationStrength: number,
  config: GraphScoringConfig = {},
): number {
  const directMatchScore = config.directMatchScore ?? 0.7;
  const relationOnlyScore = 0.3;
  const relationBoost = 0.01;
  const maxScore = config.maxScore ?? 1.0;

  let score: number;
  if (directEntityMatches > 0) {
    score = directMatchScore;
    score += Math.min(relationStrength * relationBoost, maxScore - score);
  } else if (relationStrength > 0) {
    score = relationOnlyScore;
    score += Math.min(relationStrength * relationBoost, 0.5 - score);
  } else {
    score = 0;
  }

  return Math.min(maxScore, Math.max(0, score));
}

function extractQueryEntities(queryText: string): Set<string> {
  return normalizeQueryGraphLabels(queryText);
}

interface GraphAssistedRecallConfig extends GraphScoringConfig {
  graphQueryBackend?: GraphQueryBackend;
  graphIndexRepo?: GraphIndexRepository;
}

export async function graphAssistedRecall(
  queryText: string,
  eligibleEntries: Map<string, KnowledgeRecord>,
  config?: GraphScoringConfig | GraphAssistedRecallConfig,
): Promise<RecallCandidate[]> {
  if (!queryText || queryText.trim().length === 0) {
    return [];
  }

  if (eligibleEntries.size === 0) {
    return [];
  }

  const graphConfig = config as GraphAssistedRecallConfig | undefined;
  const graphBackend = resolveGraphBackend(graphConfig);

  const queryEntities = extractQueryEntities(queryText);
  if (queryEntities.size === 0) {
    return [];
  }

  const graphCandidateIds = graphBackend
    ? await graphBackend.expandSourcesOneHop({
        queryLabels: queryEntities,
        eligibleSourceIds: new Set(eligibleEntries.keys()),
      })
    : new Set<string>();
  const candidates: RecallCandidate[] = [];

  for (const entryId of graphCandidateIds) {
    const entry = eligibleEntries.get(entryId);
    if (!entry) {
      continue;
    }

    const directMatches = new Set<string>();

    const entryLabels = new Set<string>();
    for (const label of entry.labels) {
      const normalized = label.toLowerCase().trim().replace(/\s+/g, '-');
      if (normalized.length > 1) {
        entryLabels.add(normalized);
      }
    }

    for (const label of entryLabels) {
      if (queryEntities.has(label)) {
        directMatches.add(label);
      }
    }

    const relationStrength = graphBackend
      ? await graphBackend.calculateSourceRelationStrength({
          sourceId: entryId,
          queryLabels: queryEntities,
        })
      : 0;
    const score = calculateGraphScore(directMatches.size, relationStrength, config);

    if (score > 0) {
      candidates.push({
        entry,
        channel: 'graph',
        score,
        tokenMatches: [],
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/**
 * Create a graph-assisted recall channel backed by a GraphIndexRepository.
 */
function resolveGraphBackend(config?: GraphAssistedRecallConfig): GraphQueryBackend | undefined {
  if (config?.graphQueryBackend) {
    return config.graphQueryBackend;
  }

  if (config?.graphIndexRepo) {
    return createMemoryGraphQueryBackend(config.graphIndexRepo);
  }

  return undefined;
}

export function createGraphChannel(graphQueryBackend: GraphQueryBackend): RecallChannel {
  return {
    name: 'graph',
    async recall(queryText: string, entries: KnowledgeRecord[]) {
      const entriesMap = new Map(entries.map((e) => [e.id, e]));
      return graphAssistedRecall(queryText, entriesMap, { graphQueryBackend });
    },
  };
}
