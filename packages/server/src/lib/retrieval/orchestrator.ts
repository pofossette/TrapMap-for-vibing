import {
  type RetrievalQuery,
  type RetrievalResponse,
  retrievalQuerySchema,
} from '@skill-shareer/contracts';

import type { ResolvedAuthContext, SkillShareerServices } from '../context.js';
import { generateEmbedding, hashEmbeddingText } from '../embeddings.js';
import { AppError } from '../errors.js';
import type { KnowledgeRecord } from '../store.js';
import { nowIso } from '../store.js';
import { buildEmptyResponse, buildRetrievalResponse, assembleResponseBuckets } from './assembly.js';
import { filterEligibleEntries } from './filters.js';
import { mergeCandidates, toScoredEntries, createSemanticCandidate } from './merge.js';
import { keywordRecall, normalizeQuery } from './recall/keyword.js';
import { graphAssistedRecall as graphRecall } from './recall/graph-assisted.js';
import { buildEmbeddingText, cosineSimilarity, computeScore, getEntryEmbedding as semanticGetEntryEmbedding, getQueryEmbedding } from './recall/semantic.js';
import { rerankCandidates, toScoredEntriesFromReranked } from './rerank.js';
import type { MergedCandidate, RetrievalPipelineContext, ScoredEntry } from './types.js';

/**
 * Main retrieval pipeline orchestrator.
 *
 * Pipeline order (enforced for security):
 * 1. Eligibility filtering (approval, team, level, metadata)
 * 2. Mode dispatch (semantic, hybrid, graph-assisted)
 * 3. Response assembly (bucket split and output shaping)
 * 4. Optional refinement (if requested and provider configured)
 *
 * Query modes:
 * - semantic: embedding-based retrieval (default)
 * - hybrid: combines semantic and keyword channels with weighted merge
 * - graph-assisted: hybrid baseline + graph expansion through relationships
 *
 * @param services - Server services (config, store)
 * @param auth - Resolved auth context
 * @param query - Retrieval query with filters
 * @returns Retrieval response with global constraints and project knowledge
 */
export async function searchKnowledge(
  services: SkillShareerServices,
  auth: ResolvedAuthContext,
  query: RetrievalQuery,
): Promise<RetrievalResponse> {
  // Parse and validate query
  const parsed = retrievalQuerySchema.parse(query);

  // Get current data snapshot
  const data = await services.store.snapshot();

  // Filter eligible entries (approval, team, level, metadata)
  const eligibleEntries = filterEligibleEntries(data.knowledgeEntries, auth, parsed.filters);

  if (eligibleEntries.length === 0) {
    return buildEmptyResponse();
  }

  // Dispatch based on query mode
  const topMatches = await dispatchByMode(parsed.mode, parsed.seed, eligibleEntries, parsed);

  // Assemble response buckets
  const { globalConstraints, projectKnowledge } = assembleResponseBuckets(topMatches, parsed.filters);

  // Generate refinement summary if requested and available
  const refinementSummary = parsed.includeRefinement
    ? await generateRefinement(parsed.seed, globalConstraints, projectKnowledge)
    : null;

  return buildRetrievalResponse(globalConstraints, projectKnowledge, refinementSummary);
}

/**
 * Dispatch retrieval based on query mode.
 *
 * @param mode - Query mode (semantic, hybrid, graph-assisted)
 * @param seed - Search query text
 * @param eligibleEntries - Entries that passed eligibility filters
 * @param parsed - Parsed retrieval query
 * @returns Scored entries sorted by relevance
 */
async function dispatchByMode(
  mode: string,
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
): Promise<ScoredEntry[]> {
  switch (mode) {
    case 'semantic':
      return await semanticRecall(seed, eligibleEntries, parsed);
    case 'hybrid':
      return await hybridRecall(seed, eligibleEntries, parsed);
    case 'graph-assisted':
      return await graphAssistedRecall(seed, eligibleEntries, parsed);
    default:
      // This should never happen due to Zod validation, but we handle it for safety
      throw new AppError(
        400,
        'invalid_mode',
        `Invalid query mode: ${mode}. Must be one of: semantic, hybrid, graph-assisted`,
      );
  }
}

/**
 * Semantic recall using embeddings.
 * This is the current default retrieval path.
 *
 * @param seed - Search query text
 * @param eligibleEntries - Entries that passed eligibility filters
 * @param parsed - Parsed retrieval query
 * @returns Scored entries sorted by relevance
 */
async function semanticRecall(
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
): Promise<ScoredEntry[]> {
  // Generate query embedding
  const queryVector = await getQueryEmbedding(seed);

  // Compute embeddings and scores for all eligible entries
  const scoredEntries = await Promise.all(
    eligibleEntries.map(async (entry) => {
      const entryVector = await semanticGetEntryEmbedding(entry);
      const similarity = cosineSimilarity(queryVector, entryVector);
      const score = computeScore(similarity, entry, parsed.filters);
      return { entry, score };
    }),
  );

  // Sort by score descending
  scoredEntries.sort((a, b) => b.score - a.score);

  // Take top maxResults
  return scoredEntries.slice(0, parsed.maxResults);
}

/**
 * Hybrid recall combining semantic and keyword channels.
 *
 * Pipeline:
 * 1. Run semantic recall in parallel with keyword recall
 * 2. Merge candidates from both channels (dedupe by entry.id)
 * 3. Rerank merged candidates using heuristic boosts
 * 4. Return scored entries sorted by final score
 *
 * @param seed - Search query text
 * @param eligibleEntries - Entries that passed eligibility filters
 * @param parsed - Parsed retrieval query
 * @returns Scored entries sorted by combined relevance
 */
async function hybridRecall(
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
): Promise<ScoredEntry[]> {
  // Normalize query tokens for rerank stage
  const queryTokens = normalizeQuery(seed);

  // Run both channels in parallel
  const [semanticCandidates, keywordCandidates] = await Promise.all([
    // Semantic channel: compute embeddings and scores
    computeSemanticCandidates(seed, eligibleEntries, parsed.filters),
    // Keyword channel: lexical matching
    keywordRecall(seed, eligibleEntries),
  ]);

  // Merge candidates from both channels (no limit yet - rerank first)
  const mergedCandidates = mergeCandidates(semanticCandidates, keywordCandidates);

  // Rerank merged candidates using heuristic boosts
  const rerankedCandidates = rerankCandidates(mergedCandidates, queryTokens, {
    maxCandidates: parsed.maxResults,
  });

  // Convert to scored entries for assembly
  return toScoredEntriesFromReranked(rerankedCandidates);
}

/**
 * Compute semantic candidates for hybrid recall.
 * Returns RecallCandidate[] for merge compatibility.
 *
 * @param seed - Search query text
 * @param eligibleEntries - Entries that passed eligibility filters
 * @param filters - Query filters for score boosting
 * @returns Semantic recall candidates
 */
async function computeSemanticCandidates(
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  filters: RetrievalQuery['filters'],
): Promise<ReturnType<typeof createSemanticCandidate>[]> {
  const queryVector = await getQueryEmbedding(seed);

  const candidates = await Promise.all(
    eligibleEntries.map(async (entry) => {
      const entryVector = await semanticGetEntryEmbedding(entry);
      const similarity = cosineSimilarity(queryVector, entryVector);
      const score = computeScore(similarity, entry, filters);
      return createSemanticCandidate(entry, score);
    }),
  );

  // Sort by score descending for deterministic ordering
  candidates.sort((a, b) => b.score - a.score);

  return candidates;
}

/**
 * Graph-assisted recall combining hybrid baseline with graph expansion.
 *
 * Pipeline:
 * 1. Run hybrid recall (semantic + keyword) as baseline
 * 2. Run graph-assisted recall for relationship-based expansion
 * 3. Merge graph candidates with hybrid candidates
 * 4. Rerank combined candidates using heuristic boosts
 * 5. Return scored entries sorted by final score
 *
 * @param seed - Search query text
 * @param eligibleEntries - Entries that passed eligibility filters
 * @param parsed - Parsed retrieval query
 * @returns Scored entries sorted by combined relevance
 */
async function graphAssistedRecall(
  seed: string,
  eligibleEntries: KnowledgeRecord[],
  parsed: ReturnType<typeof retrievalQuerySchema.parse>,
): Promise<ScoredEntry[]> {
  // Normalize query tokens for rerank stage
  const queryTokens = normalizeQuery(seed);

  // Convert eligible entries array to Map for graph recall
  const eligibleEntriesMap = new Map<string, KnowledgeRecord>();
  for (const entry of eligibleEntries) {
    eligibleEntriesMap.set(entry.id, entry);
  }

  // Run hybrid baseline and graph recall in parallel
  const [semanticCandidates, keywordCandidates, graphCandidates] = await Promise.all([
    // Semantic channel: compute embeddings and scores
    computeSemanticCandidates(seed, eligibleEntries, parsed.filters),
    // Keyword channel: lexical matching
    keywordRecall(seed, eligibleEntries),
    // Graph channel: relationship-based expansion
    graphRecall(seed, eligibleEntriesMap),
  ]);

  // Merge semantic and keyword candidates first
  const hybridMerged = mergeCandidates(semanticCandidates, keywordCandidates);

  // Now merge graph candidates with hybrid results
  // We need to extend mergeCandidates to handle graph channel
  const finalMerged = mergeCandidatesWithGraph(hybridMerged, graphCandidates);

  // Rerank merged candidates using heuristic boosts
  const rerankedCandidates = rerankCandidates(finalMerged, queryTokens, {
    maxCandidates: parsed.maxResults,
  });

  // Convert to scored entries for assembly
  return toScoredEntriesFromReranked(rerankedCandidates);
}

/**
 * Merge graph candidates with hybrid candidates.
 * Extends the merge logic to support graph channel evidence.
 *
 * @param hybridMerged - Already-merged semantic + keyword candidates
 * @param graphCandidates - Graph recall candidates
 * @returns Merged candidates with graph evidence included
 */
function mergeCandidatesWithGraph(
  hybridMerged: ReturnType<typeof mergeCandidates>,
  graphCandidates: Awaited<ReturnType<typeof graphRecall>>,
): MergedCandidate[] {
  const result = [...hybridMerged];

  for (const graphCandidate of graphCandidates) {
    const existing = result.find((c) => c.entry.id === graphCandidate.entry.id);

    if (existing) {
      // Entry exists from hybrid - add graph evidence
      existing.channels.push('graph');
      existing.graphScore = graphCandidate.score;
      // Preserve pre-rerank score and boost final score based on graph evidence
      const preRerankScore = existing.combinedScore;
      const finalScore = Math.min(1, preRerankScore + graphCandidate.score * 0.2);
      existing.combinedScore = finalScore;
      existing.preRerankScore = preRerankScore;
      existing.finalScore = finalScore;
    } else {
      // Entry only from graph channel
      const score = graphCandidate.score;
      result.push({
        entry: graphCandidate.entry,
        semanticScore: 0,
        keywordScore: 0,
        graphScore: graphCandidate.score,
        combinedScore: score,
        tokenMatches: [],
        channels: ['graph'],
        preRerankScore: score,
        finalScore: score,
      });
    }
  }

  // Re-sort by combined score
  result.sort((a, b) => b.combinedScore - a.combinedScore);

  return result;
}

/**
 * Check if a refinement provider is configured.
 * Returns true if a chat model is available for refinement.
 */
function isRefinementAvailable(): boolean {
  // Check if OpenAI API key is configured for refinement
  // In the future, this could support other providers
  return typeof process.env.OPENAI_API_KEY === 'string' && process.env.OPENAI_API_KEY.length > 0;
}

/**
 * Generate a refinement summary for search results.
 * This is best-effort: returns null if no provider is configured.
 *
 * @param query - The original search query
 * @param globalConstraints - Matched global constraints
 * @param projectKnowledge - Matched project knowledge
 * @returns A summary string or null if refinement is unavailable
 */
async function generateRefinement(
  query: string,
  globalConstraints: unknown[],
  projectKnowledge: unknown[],
): Promise<string | null> {
  // Best-effort: only refine if a provider is configured
  if (!isRefinementAvailable()) {
    return null;
  }

  // If we have no matches, return null (nothing to refine)
  if (globalConstraints.length === 0 && projectKnowledge.length === 0) {
    return null;
  }

  // TODO: Implement actual LLM-based refinement here
  // This would use a LangChain chat model to summarize the results
  // For now, we return null to maintain best-effort behavior
  // Future implementation could look like:
  //
  // const { ChatOpenAI } = await import('@langchain/openai');
  // const chat = new ChatOpenAI({ modelName: 'gpt-4o-mini' });
  // const summary = await chat.invoke([
  //   new SystemMessage('Summarize the following search results...'),
  //   new HumanMessage(buildRefinementPrompt(...))
  // ]);
  // return summary.content as string;

  return null;
}

/**
 * Update the embedding cache for a knowledge entry.
 * Should be called when an entry is approved or its searchable content changes.
 */
export async function updateEntryEmbeddingCache(
  services: SkillShareerServices,
  entryId: string,
): Promise<void> {
  await services.store.transact(async (data) => {
    const entry = data.knowledgeEntries.find((e) => e.id === entryId);
    if (!entry) {
      throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
    }

    const text = buildEmbeddingText(entry);
    const textHash = hashEmbeddingText(text);
    const vector = await generateEmbedding(text);

    entry.embeddingCache = {
      textHash,
      vector,
      createdAt: nowIso(),
      revision: entry.history.length,
    };
    entry.updatedAt = nowIso();
  });
}
