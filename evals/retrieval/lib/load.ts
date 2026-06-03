/**
 * Case loading and validation for retrieval evaluation.
 *
 * Phase 26-01: REVAL-01
 * Shared case loading and validation through shared contracts.
 */

import {
  type RetrievalEvalCase,
  type RetrievalEvalScenario,
  type RetrievalEvalTier,
  retrievalEvalCaseSchema,
} from '@trapmap/contracts/evals';

import { coreCases, coreScenariosMap } from '../core.js';
import { smokeCases, smokeScenariosMap } from '../smoke.js';

// =============================================================================
// Case Loading
// =============================================================================

/**
 * Load cases for the specified tier.
 * Validates each case against the shared schema.
 */
export function loadCases(tier: RetrievalEvalTier): RetrievalEvalCase[] {
  const rawCases = tier === 'smoke' ? smokeCases : coreCases;

  // Validate each case against the schema
  const validatedCases: RetrievalEvalCase[] = [];
  for (const rawCase of rawCases) {
    try {
      const parsed = retrievalEvalCaseSchema.parse(rawCase);
      validatedCases.push(parsed);
    } catch (error) {
      console.error(`Invalid case in ${tier} tier:`, error);
      throw error;
    }
  }

  return validatedCases;
}

/**
 * Load scenario for a case by scenario ID.
 */
export function loadScenario(scenarioId: string): RetrievalEvalScenario | undefined {
  // Check smoke scenarios first
  const smokeScenario = smokeScenariosMap[scenarioId];
  if (smokeScenario) return smokeScenario;

  // Check core scenarios
  const coreScenario = coreScenariosMap[scenarioId];
  if (coreScenario) return coreScenario;

  return undefined;
}

// =============================================================================
// Case Filtering
// =============================================================================

/**
 * Filter cases by endpoint if specified.
 */
export function filterByEndpoint(
  cases: RetrievalEvalCase[],
  endpoint?:
    | '/v1/retrieval/search'
    | '/v1/retrieval/skills/search-by-content'
    | '/v2/retrieval/search'
    | '/v3/retrieval/search',
): RetrievalEvalCase[] {
  if (!endpoint) return cases;
  return cases.filter((c) => c.endpoint === endpoint);
}

/**
 * Filter cases by tags.
 */
export function filterByTags(cases: RetrievalEvalCase[], tags: string[]): RetrievalEvalCase[] {
  if (tags.length === 0) return cases;
  return cases.filter((c) => tags.some((tag) => c.tags.includes(tag)));
}

// =============================================================================
// Slice Key Extraction
// =============================================================================

/**
 * Get the slice key for a case.
 */
export function getSliceKey(case_: RetrievalEvalCase): {
  tier: RetrievalEvalTier;
  endpoint: typeof case_.endpoint;
  mode?: 'semantic' | 'hybrid' | 'graph-assisted';
} {
  return {
    tier: case_.tier,
    endpoint: case_.endpoint,
    mode: case_.request.mode, // v1 only, undefined for v2
  };
}

/**
 * Get unique slice keys from cases.
 */
export function getUniqueSliceKeys(cases: RetrievalEvalCase[]): Array<{
  tier: RetrievalEvalTier;
  endpoint: (typeof cases)[0]['endpoint'];
  mode?: 'semantic' | 'hybrid' | 'graph-assisted';
}> {
  const keys = new Map<string, ReturnType<typeof getSliceKey>>();

  for (const case_ of cases) {
    const key = getSliceKey(case_);
    const keyStr = `${key.tier}:${key.endpoint}:${key.mode ?? 'none'}`;

    if (!keys.has(keyStr)) {
      keys.set(keyStr, key);
    }
  }

  return Array.from(keys.values());
}
