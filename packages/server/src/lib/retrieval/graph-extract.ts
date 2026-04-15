/**
 * Graph entity extraction module.
 *
 * This module provides:
 * - Deterministic extraction of high-value entities from knowledge entries
 * - Classification into required graph classes (service, tool, symptom, root-cause, fix, environment)
 * - Extraction of simple typed relations between entities
 * - Field-aware extraction using normalized labels and tokens
 *
 * STUB: Not yet implemented - will be implemented in Task 2.
 */

import type { NormalizedIndexDocument } from '../indexing/types.js';

export interface GraphEntity {
  type: 'service' | 'tool' | 'symptom' | 'root-cause' | 'fix' | 'environment';
  value: string;
  normalizedValue: string;
}

export interface GraphRelation {
  type: 'mentions' | 'causes' | 'fixed-by' | 'observed-in' | 'uses-tool' | 'runs-in';
  fromEntity: string;
  toEntity: string;
  weight: number;
}

export interface GraphExtractionResult {
  entities: GraphEntity[];
  relations: GraphRelation[];
}

/**
 * Extract graph entities and relations from a normalized index document.
 * STUB: Returns empty arrays.
 */
export function extractGraphEntities(
  _document: NormalizedIndexDocument,
): GraphExtractionResult {
  return {
    entities: [],
    relations: [],
  };
}
