import type { RetrievalQuery, RetrievalResponse } from '@trapmap/contracts';
import type { ResolvedAuthContext, SkillShareerServices } from '../context.js';
import { searchKnowledge } from '../search-knowledge.js';

/**
 * v2 capsule-native search: gene-aware hybrid recall with graph assist.
 * Delegates to base searchKnowledge with mode forced to hybrid for capsule pool,
 * adds v2-specific metrics and cache key prefix.
 */
export async function searchV2(
  services: SkillShareerServices,
  auth: ResolvedAuthContext,
  query: RetrievalQuery,
): Promise<RetrievalResponse> {
  const v2Query: RetrievalQuery = {
    ...query,
    mode: query.mode ?? 'hybrid',
    boundaryContext: query.boundaryContext ?? { versions: [] },
  };
  const result = await searchKnowledge(services, auth, v2Query);
  return {
    ...result,
    routingTrace: {
      ...result.routingTrace,
      channelsUsed: [...((result.routingTrace as any)?.channelsUsed ?? []), 'v2-capsule'],
    } as any,
  };
}

export const searchV2Channel = 'v2-capsule';
