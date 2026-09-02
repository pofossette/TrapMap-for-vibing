// fallow-ignore duplication -- shared DB fallback pattern, tracked
import type { retrievalQuerySchema } from '@trapmap/contracts';
import type { ResolvedAuthContext, SkillShareerServices } from '../context.js';
import { getRetrievalInfra } from '../retrieval-infra.js';
import { keywordRecall, normalizeQuery } from '../retrieval-keyword.js';
import { getQueryEmbedding } from '../retrieval-semantic.js';
import type { KnowledgeRecord } from '../store.js';
import type { RecallExecutionResult } from '../retrieval-recall-coordinator.js';
import { getDbSearchConfig, versionMultiplierFor, rerankRecallResults, computeSemanticCandidates } from './recall-helpers.js';

// fallow-ignore-next-line complexity -- B1 channel logic, behavior-preserving, tracked in B
export async function hybridRecall(
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
  services?: SkillShareerServices,
  auth?: ResolvedAuthContext,
): Promise<RecallExecutionResult> {
  const queryTokens = normalizeQuery(seed);
  const infra = services ? getRetrievalInfra(services) : null;
  const dbConfig = services ? getDbSearchConfig(services) : { enabled: false, pool: null };
  if (dbConfig.enabled && dbConfig.pool && auth) {
    try {
      const eligibleIds = new Set(eligibleEntries.map((e) => e.id));
      const entryMap = new Map(eligibleEntries.map((e) => [e.id, e]));
      const [queryVector, keywordResults] = await Promise.all([
        getQueryEmbedding(services!, seed),
        infra!.pgRecall.keywordRecall(
          dbConfig.pool,
          seed,
          {
            teamId: auth.activeTeamId,
            securityLevel: auth.securityLevel,
            isSystemAdmin: auth.subjectType === 'system-admin',
            scopes: parsed.filters?.scopes?.length ? parsed.filters.scopes : ['global', 'project'],
          },
          parsed.maxResults * 2,
        ),
      ]);
      const dbScopeFilter = parsed.filters?.scopes?.length === 1 ? parsed.filters.scopes[0] : undefined;
      const dbVectorResults = await infra!.pgRecall.vectorSimilaritySearch(dbConfig.pool, {
        queryVector,
        limit: parsed.maxResults * 2,
        teamId: auth.activeTeamId,
        maxLevel: auth.securityLevel,
        ...(dbScopeFilter ? { scope: dbScopeFilter } : {}),
      });
      const createSemanticCandidate = infra!.scoring.createSemanticCandidate;
      const semanticCandidates = dbVectorResults
        .filter((r) => eligibleIds.has(r.entryId))
        .map((r) => {
          const entry = entryMap.get(r.entryId);
          if (!entry) return null;
          return createSemanticCandidate(entry, r.similarity * versionMultiplierFor(infra!, entry, parsed));
        })
        .filter((c): c is NonNullable<ReturnType<typeof createSemanticCandidate>> => c !== null);
      const keywordCandidates: Awaited<ReturnType<typeof keywordRecall>> = [];
      for (const result of keywordResults) {
        if (!eligibleIds.has(result.entryId)) continue;
        const entry = entryMap.get(result.entryId);
        if (!entry) continue;
        keywordCandidates.push({ entry, channel: 'keyword', score: result.score, tokenMatches: result.tokenMatches });
      }
      const mergedCandidates = infra!.scoring.mergeCandidates(semanticCandidates, keywordCandidates);
      return await rerankRecallResults(infra!, mergedCandidates, queryTokens, parsed);
    } catch (error) {
      console.error('[hybridRecall] DB search failed, falling back to in-memory:', error);
    }
  }
  const [semanticCandidates, keywordCandidates] = await Promise.all([
    computeSemanticCandidates(services!, seed, eligibleEntries, parsed.filters, parsed.boundaryContext?.versions),
    keywordRecall(seed, eligibleEntries),
  ]);
  const mergedCandidates = infra!.scoring.mergeCandidates(semanticCandidates, keywordCandidates);
  return await rerankRecallResults(infra!, mergedCandidates, queryTokens, parsed);
}
