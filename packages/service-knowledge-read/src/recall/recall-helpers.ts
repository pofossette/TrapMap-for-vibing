import { versionMatchMultiplier } from '@trapmap/backend-core';
import type { retrievalQuerySchema } from '@trapmap/contracts';
import { getRetrievalInfra } from '../retrieval-infra.js';
import type { SkillShareerServices } from '../context.js';
import type { Pool } from 'pg';
import { type ScoredEntry, artifactVersionOf } from '../retrieval-types.js';
import { getGoAcceleratorClient } from '@trapmap/infra/go-accelerator/client.js';
import type { KnowledgeRecord } from '../store.js';

export interface DbSearchConfig { enabled: boolean; pool: Pool | null; }
export function getDbSearchConfig(services: SkillShareerServices): DbSearchConfig {
  const infra = getRetrievalInfra(services);
  const enabled = infra.pgRecall.isEnabled();
  const pool = infra.pgRecall.getPool(services.store);
  return { enabled: enabled && pool !== null, pool };
}
export function finalizeSemanticResults(infra: NonNullable<ReturnType<typeof getRetrievalInfra>>, scoredEntries: ScoredEntry[], parsed: ReturnType<typeof retrievalQuerySchema.parse>) {
  scoredEntries.sort((a, b) => b.score - a.score);
  const sliced = scoredEntries.slice(0, parsed.maxResults);
  const mergedCandidates = infra.scoring.mergeCandidates(sliced.map(({ entry, score }) => infra.scoring.createSemanticCandidate(entry, score)), []);
  return { scoredEntries: sliced, mergedCandidates };
}
export function versionMultiplierFor(infra: NonNullable<ReturnType<typeof getRetrievalInfra>>, entry: KnowledgeRecord, parsed: ReturnType<typeof retrievalQuerySchema.parse>): number {
  return versionMatchMultiplier({ artifactVersion: artifactVersionOf(entry), queryVersions: parsed.boundaryContext?.versions, freshnessType: entry.decayMeta?.freshnessType ?? null, decayConfig: infra.scoring.freshnessConfig });
}
export function toScoredEntry(entry: KnowledgeRecord, score: number, boundaryExplanation?: ScoredEntry['boundaryExplanation']): ScoredEntry {
  const scoredEntry: ScoredEntry = { entry, score };
  const version = artifactVersionOf(entry);
  if (version !== undefined) scoredEntry.version = version;
  const revision = entry.latestRevision?.revision;
  if (revision !== undefined) scoredEntry.revision = revision;
  if (boundaryExplanation !== undefined) scoredEntry.boundaryExplanation = boundaryExplanation;
  return scoredEntry;
}
export async function rerankRecallResults(_infra: any, mergedCandidates: any, queryTokens: any, parsed: any) {
  const goClient = getGoAcceleratorClient();
  if ((goClient as any).isEnabled) {
    try {
      const payload = mergedCandidates.map((c:any) => ({ id: c.entry.id, semanticScore: c.semanticScore, keywordScore: c.keywordScore, graphScore: c.graphScore, channelScores: c.channelScores, combinedScore: c.combinedScore, tokenMatches: c.tokenMatches.map((tm:any) => ({ token: tm.token, fields: [...tm.fields] })), channels: [...c.channels], preRerankScore: c.preRerankScore, finalScore: c.finalScore, labels: [...c.entry.labels], scope: c.entry.scope, shortcut: c.entry.shortcut, detail: c.entry.detail, decayState: c.entry.decayMeta?.freshnessType, boundary: c.entry.boundary }));
      const result = await (goClient as any).rankingBatch({ entries: payload, queryTokens, maxCandidates: parsed.maxResults });
      const entryMap = new Map(mergedCandidates.map((c:any) => [c.entry.id, c.entry]));
      const scoredEntries: ScoredEntry[] = result.candidates.slice(0, parsed.maxResults).map((r: any) => {
        const orig = entryMap.get(r.id);
        if (!orig) return null as any;
        return toScoredEntry(orig as any, r.finalScore);
      }).filter(Boolean);
      return { scoredEntries, mergedCandidates: result.candidates.map((r: any) => entryMap.get(r.id)!).filter(Boolean) as any };
    } catch (e) { console.error('[rerank] go fallback', e); }
  }
  const scored = mergedCandidates.map((c:any) => ({ entry: c.entry, score: c.finalScore })).sort((a:any,b:any)=>b.score-a.score).slice(0, parsed.maxResults);
  return { scoredEntries: scored.map(({entry,score}:any)=>toScoredEntry(entry,score)), mergedCandidates };
}
export async function computeSemanticCandidates(services: SkillShareerServices, seed: string, eligibleEntries: KnowledgeRecord[], filters: any, queryVersions?: any) {
  const infra = getRetrievalInfra(services);
  const { getQueryEmbedding, optimizedSemanticRecall } = await import('../retrieval-semantic.js');
  const queryVector = await getQueryEmbedding(services, seed);
  const { scoredEntries } = await optimizedSemanticRecall(services, queryVector, eligibleEntries, filters, seed, queryVersions);
  const candidates = scoredEntries.map(({ entry, score }:any) => infra.scoring.createSemanticCandidate(entry, score));
  candidates.sort((a:any, b:any) => b.score - a.score);
  return candidates;
}
