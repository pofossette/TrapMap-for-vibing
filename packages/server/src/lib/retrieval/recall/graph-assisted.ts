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

import type { KnowledgeRecord } from '../../store.js';
import type { RecallCandidate } from '../types.js';
import type { NormalizedIndexDocument } from '../../indexing/types.js';
import { extractGraphEntities } from '../graph-extract.js';
import { getGlobalGraphIndex } from '../../indexing/adapters/graph.js';

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
    tokens: [], // Not needed for entity extraction
    contentHash: '', // Not needed for entity extraction
    normalizedAt: new Date().toISOString(),
  };
}

/**
 * Calculate graph recall score for a candidate.
 *
 * Scoring strategy:
 * - Direct entity match: base score (default 0.7)
 * - Relation-only match: lower base score (default 0.3) for entries without direct matches
 * - Each supporting relation: boost (default 0.01, reduced to prevent outranking direct matches)
 * - Capped at maxScore (default 1.0)
 * - Direct matches ALWAYS outrank relation-only matches, regardless of relation weight
 *
 * @param directEntityMatches - Number of query entities that directly match
 * @param relationStrength - Total weight of supporting relations
 * @param config - Scoring configuration
 * @returns Score in [0, 1]
 */
function calculateGraphScore(
  directEntityMatches: number,
  relationStrength: number,
  config: GraphScoringConfig = {},
): number {
  const directMatchScore = config.directMatchScore ?? 0.7;
  const relationOnlyScore = 0.3; // Lower score for relation-only matches
  const relationBoost = 0.01; // Reduced boost to prevent outranking direct matches
  const maxScore = config.maxScore ?? 1.0;

  // Base score from direct entity matches or relation-only
  let score: number;
  if (directEntityMatches > 0) {
    score = directMatchScore;
    // Apply relation boost for direct matches (capped)
    score += Math.min(relationStrength * relationBoost, maxScore - score);
  } else if (relationStrength > 0) {
    score = relationOnlyScore;
    // Apply relation boost for relation-only matches (capped at 0.5 to stay below direct matches)
    score += Math.min(relationStrength * relationBoost, 0.5 - score);
  } else {
    score = 0;
  }

  // Ensure score is bounded
  return Math.min(maxScore, Math.max(0, score));
}

/**
 * Extract entities from query text for graph expansion.
 *
 * @param queryText - The search query text
 * @returns Set of normalized entity values extracted from the query
 */
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
  };

  const extractionResult = extractGraphEntities(normalizedDoc);
  const entityValues = new Set<string>();

  for (const entity of extractionResult.entities) {
    entityValues.add(entity.normalizedValue);
  }

  return entityValues;
}

/**
 * Perform one-hop graph expansion from query entities.
 *
 * This function:
 * - Finds all entries that match query entities directly
 * - Expands one hop through typed relations to find related entries
 * - Returns a set of candidate entry IDs (not yet intersected with eligible entries)
 *
 * @param queryEntities - Set of normalized entity values from the query
 * @returns Set of entry IDs (direct matches + one-hop expansions)
 */
function expandOneHop(queryEntities: Set<string>): Set<string> {
  const globalIndex = getGlobalGraphIndex();
  const candidateIds = new Set<string>();

  // Direct entity matches
  for (const entityValue of queryEntities) {
    const entrySet = globalIndex.entities.get(entityValue);
    if (entrySet) {
      for (const entryId of entrySet) {
        candidateIds.add(entryId);
      }
    }
  }

  // One-hop expansion through relations
  // Look at ALL entries' relations to find connections to query entities
  const oneHopIds = new Set<string>();

  for (const [entryId, relations] of globalIndex.relations.entries()) {
    for (const relation of relations) {
      // Check if this relation connects to any query entity
      const connectsToQuery = queryEntities.has(relation.fromEntity) || queryEntities.has(relation.toEntity);

      if (connectsToQuery) {
        // Find entries that contain either end of the relation
        const fromEntityEntries = globalIndex.entities.get(relation.fromEntity);
        const toEntityEntries = globalIndex.entities.get(relation.toEntity);

        if (fromEntityEntries) {
          for (const relatedEntryId of fromEntityEntries) {
            oneHopIds.add(relatedEntryId);
          }
        }

        if (toEntityEntries) {
          for (const relatedEntryId of toEntityEntries) {
            oneHopIds.add(relatedEntryId);
          }
        }
      }
    }
  }

  // Combine direct and one-hop results
  for (const entryId of oneHopIds) {
    candidateIds.add(entryId);
  }

  return candidateIds;
}

/**
 * Calculate relation strength for a candidate entry.
 *
 * This checks both:
 * 1. The entry's own relations that connect to query entities
 * 2. Other entries' relations that connect from query entities to this entry's entities
 *
 * @param entryId - The candidate entry ID
 * @param queryEntities - Set of query entity values
 * @returns Total relation weight supporting this candidate
 */
function calculateRelationStrength(entryId: string, queryEntities: Set<string>): number {
  const globalIndex = getGlobalGraphIndex();
  let strength = 0;

  // Check this entry's own relations
  const relations = globalIndex.relations.get(entryId);
  if (relations) {
    for (const relation of relations) {
      // Boost if relation connects to a query entity
      if (queryEntities.has(relation.fromEntity) || queryEntities.has(relation.toEntity)) {
        strength += relation.weight;
      }
    }
  }

  // Check other entries' relations that might connect to this entry
  // Get all entities for this entry
  const entryEntities = new Set<string>();
  for (const [entityValue, entrySet] of globalIndex.entities.entries()) {
    if (entrySet.has(entryId)) {
      entryEntities.add(entityValue);
    }
  }

  // For each query entity, check if any relations connect to this entry's entities
  for (const queryEntity of queryEntities) {
    // Find entries that have the query entity
    const entriesWithQueryEntity = globalIndex.entities.get(queryEntity);
    if (entriesWithQueryEntity) {
      for (const otherEntryId of entriesWithQueryEntity) {
        if (otherEntryId === entryId) continue; // Skip self

        const otherRelations = globalIndex.relations.get(otherEntryId);
        if (otherRelations) {
          for (const relation of otherRelations) {
            // Check if this relation connects the query entity to one of our entities
            if ((queryEntities.has(relation.fromEntity) && entryEntities.has(relation.toEntity)) ||
                (queryEntities.has(relation.toEntity) && entryEntities.has(relation.fromEntity))) {
              strength += relation.weight;
            }
          }
        }
      }
    }
  }

  return strength;
}

/**
 * Perform graph-assisted recall over eligible entries.
 *
 * This function:
 * - Extracts entities from the query using shared extraction logic
 * - Expands one hop through graph relationships
 * - Intersects graph-derived entries with the eligible entry set (T-09-07)
 * - Scores candidates based on entity matches and relation strength
 * - Returns internal candidates compatible with merge/rerank pipeline
 *
 * @param queryText - The search query text
 * @param eligibleEntries - Map of entry ID to already-filtered knowledge entries
 * @param config - Optional scoring configuration
 * @returns Array of recall candidates sorted by descending graph score
 *
 * Security: This function only returns entries from the eligibleEntries map.
 * Graph expansion can discover related entries, but they must be in the
 * eligible set to appear in results.
 */
export async function graphAssistedRecall(
  queryText: string,
  eligibleEntries: Map<string, KnowledgeRecord>,
  config?: GraphScoringConfig,
): Promise<RecallCandidate[]> {
  // Handle empty query
  if (!queryText || queryText.trim().length === 0) {
    return [];
  }

  // Handle empty eligible entries
  if (eligibleEntries.size === 0) {
    return [];
  }

  // Extract entities from query
  const queryEntities = extractQueryEntities(queryText);

  // No entities extracted = no graph matches
  if (queryEntities.size === 0) {
    return [];
  }

  // Expand one hop through graph relationships
  const graphCandidateIds = expandOneHop(queryEntities);

  // Intersect with eligible entries (T-09-07: authorization safety)
  const candidates: RecallCandidate[] = [];

  for (const entryId of graphCandidateIds) {
    const entry = eligibleEntries.get(entryId);
    if (!entry) {
      // Skip entries not in eligible set (unauthorized or not approved)
      continue;
    }

    // Count direct entity matches for this entry
    const entryDoc = toNormalizedDocument(entry);
    const entryExtraction = extractGraphEntities(entryDoc);
    const directMatches = new Set<string>();

    for (const entity of entryExtraction.entities) {
      if (queryEntities.has(entity.normalizedValue)) {
        directMatches.add(entity.normalizedValue);
      }
    }

    // Calculate relation strength
    const relationStrength = calculateRelationStrength(entryId, queryEntities);

    // Calculate graph score
    const score = calculateGraphScore(directMatches.size, relationStrength, config);

    // Only include candidates with positive score
    if (score > 0) {
      candidates.push({
        entry,
        channel: 'graph',
        score,
        tokenMatches: [], // Graph channel doesn't use token matches
      });
    }
  }

  // Sort by descending score
  candidates.sort((a, b) => b.score - a.score);

  return candidates;
}
