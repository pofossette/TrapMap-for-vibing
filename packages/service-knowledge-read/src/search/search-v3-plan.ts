import type { RetrievalQuery } from '@trapmap/contracts';
import type { ResolvedAuthContext, SkillShareerServices } from '../context.js';
import { searchKnowledge } from '../search-knowledge.js';

/**
 * v3 trap-first plan: prioritize trap documents, fallback to skill capsule.
 * Generates plan that filters by trap type first, then expands.
 */
export interface SearchV3Plan {
  version: 'v3-trap-first';
  description: string;
  primaryScope: 'trap';
  fallbackScope: 'skill';
  maxHops: number;
}

export const searchV3Plan: SearchV3Plan = {
  version: 'v3-trap-first',
  description: 'trap-first search plan: trap scope prioritized, skill fallback',
  primaryScope: 'trap',
  fallbackScope: 'skill',
  maxHops: 2,
};

export async function searchV3(
  services: SkillShareerServices,
  auth: ResolvedAuthContext,
  query: RetrievalQuery,
) {
  const v3Query: RetrievalQuery = {
    ...query,
    mode: 'graph-assisted',
    filters: {
      ...query.filters,
      scopes: ['global', 'project'],
    },
  };
  return searchKnowledge(services, auth, v3Query);
}

export function buildV3Plan(query: RetrievalQuery): SearchV3Plan {
  return {
    ...searchV3Plan,
    description: `${searchV3Plan.description} for ${query.seed.slice(0, 32)}`,
  };
}
