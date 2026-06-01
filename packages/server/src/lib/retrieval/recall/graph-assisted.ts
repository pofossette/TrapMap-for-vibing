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
import type { NormalizedIndexDocument } from '@trapmap/server/lib/indexing/types.js';
import type { GraphQueryBackend } from '@trapmap/server/lib/graph-query/backend.js';
import { createMemoryGraphQueryBackend } from '@trapmap/server/lib/graph-query/memory-backend.js';
import type { RecallChannel } from '@trapmap/server/lib/retrieval/orchestration/channel-registry.js';
import type { RecallCandidate } from '@trapmap/server/lib/retrieval/types.js';
import type { KnowledgeRecord } from '@trapmap/server/lib/store.js';
import { extractGraphEntities } from './graph-extract.js';

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

/**
 * Convert a knowledge record to normalized document for extraction.
 */
function toNormalizedDocument(entry: KnowledgeRecord): NormalizedIndexDocument {
  const canonicalText = `${entry.shortcut}\n${entry.detail}\n${entry.labels.join('\n')}`;
  return {
    entryId: entry.id,
    teamId: entry.teamId,
    scope: entry.scope,
    requiredLevel: entry.requiredLevel,
    lifecycleState: entry.lifecycleState,
    revision: entry.history.length,
    updatedAt: entry.updatedAt,
    shortcut: entry.shortcut,
    detail: entry.detail,
    labels: entry.labels,
    canonicalText,
    tokens: [],
    contentHash: '',
    normalizedAt: new Date().toISOString(),
    boundary: entry.boundary ?? null,
  };
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
  const normalizedDoc: NormalizedIndexDocument = {
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

  const extractionResult = extractGraphEntities(normalizedDoc);
  const entityValues = new Set<string>();

  for (const entity of extractionResult.entities) {
    entityValues.add(entity.normalizedValue);
  }

  return entityValues;
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

    const entryDoc = toNormalizedDocument(entry);
    const entryExtraction = extractGraphEntities(entryDoc);
    const directMatches = new Set<string>();

    for (const entity of entryExtraction.entities) {
      if (queryEntities.has(entity.normalizedValue)) {
        directMatches.add(entity.normalizedValue);
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
function resolveGraphBackend(
  config?: GraphAssistedRecallConfig,
): GraphQueryBackend | undefined {
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
