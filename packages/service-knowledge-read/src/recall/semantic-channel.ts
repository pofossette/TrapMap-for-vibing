import { computeScore } from '@trapmap/backend-core';
import type { retrievalQuerySchema } from '@trapmap/contracts';
import type { ResolvedAuthContext, SkillShareerServices } from '../context.js';
import { getRetrievalInfra } from '../retrieval-infra.js';
import { getQueryEmbedding, optimizedSemanticRecall } from '../retrieval-semantic.js';
import type { KnowledgeRecord } from '../store.js';
import type { RecallExecutionResult } from '../retrieval-recall-coordinator.js';
import { getDbSearchConfig, finalizeSemanticResults, toScoredEntry, versionMultiplierFor } from './recall-helpers.js';
import type { ScoredEntry } from '../retrieval-types.js';

export async function semanticRecall(
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
  services?: SkillShareerServices,
  auth?: ResolvedAuthContext,
): Promise<RecallExecutionResult> {
  const infra = services ? getRetrievalInfra(services) : null;
  const dbConfig = services ? getDbSearchConfig(services) : { enabled: false, pool: null };
  if (dbConfig.enabled && dbConfig.pool && auth) {
    try {
      const queryVector = await getQueryEmbedding(services!, seed);
      const scopeFilter = parsed.filters?.scopes?.length === 1 ? parsed.filters.scopes[0] : undefined;
      const dbResults = await infra!.pgRecall.vectorSimilaritySearch(dbConfig.pool, {
        queryVector,
        limit: parsed.maxResults * 2,
        teamId: auth.activeTeamId,
        maxLevel: auth.securityLevel,
        ...(scopeFilter ? { scope: scopeFilter } : {}),
      });
      const eligibleIds = new Set(eligibleEntries.map((e) => e.id));
      const entryMap = new Map(eligibleEntries.map((e) => [e.id, e]));
      const scoredEntries: ScoredEntry[] = [];
      for (const result of dbResults) {
        if (!eligibleIds.has(result.entryId)) continue;
        const entry = entryMap.get(result.entryId);
        if (!entry) continue;
        const boundaryDelta = infra!.scoring.computeBoundaryScoreDelta(entry, parsed.boundaryContext);
        const boostedScore = computeScore(result.similarity, entry, parsed.filters, seed) * versionMultiplierFor(infra!, entry, parsed);
        const finalScore = Math.min(1, Math.max(0, boostedScore + boundaryDelta));
        const boundaryExplanation = parsed.boundaryContext ? infra!.scoring.buildBoundaryExplanation(entry, parsed.boundaryContext, boundaryDelta) : undefined;
        scoredEntries.push(toScoredEntry(entry, finalScore, boundaryExplanation));
      }
      return finalizeSemanticResults(infra!, scoredEntries, parsed);
    } catch (error) {
      console.error('[semanticRecall] DB search failed, falling back to in-memory:', error);
    }
  }
  const queryVector = await getQueryEmbedding(services!, seed);
  const { scoredEntries: rawScoredEntries } = await optimizedSemanticRecall(services!, queryVector, eligibleEntries, parsed.filters, seed, parsed.boundaryContext?.versions);
  const scoredEntries: ScoredEntry[] = rawScoredEntries.map(({ entry, score }) => {
    const boundaryDelta = infra!.scoring.computeBoundaryScoreDelta(entry, parsed.boundaryContext);
    const finalScore = Math.min(1, Math.max(0, score + boundaryDelta));
    const boundaryExplanation = parsed.boundaryContext ? infra!.scoring.buildBoundaryExplanation(entry, parsed.boundaryContext, boundaryDelta) : undefined;
    return toScoredEntry(entry, finalScore, boundaryExplanation);
  });
  return finalizeSemanticResults(infra!, scoredEntries, parsed);
}
