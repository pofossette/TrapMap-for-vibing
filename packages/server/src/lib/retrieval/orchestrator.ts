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
import { keywordRecall } from './recall/keyword.js';
import { buildEmbeddingText, cosineSimilarity, computeScore, getEntryEmbedding as semanticGetEntryEmbedding, getQueryEmbedding } from './recall/semantic.js';
import type { RetrievalPipelineContext, ScoredEntry } from './types.js';

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
 * - graph-assisted: not yet implemented (planned for future phase)
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
      throw new AppError(
        501,
        'mode_not_implemented',
        'Graph-assisted retrieval mode is not yet implemented. Use semantic or hybrid mode.',
      );
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
 * 3. Return scored entries sorted by combined score
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
  // Run both channels in parallel
  const [semanticCandidates, keywordCandidates] = await Promise.all([
    // Semantic channel: compute embeddings and scores
    computeSemanticCandidates(seed, eligibleEntries, parsed.filters),
    // Keyword channel: lexical matching
    keywordRecall(seed, eligibleEntries),
  ]);

  // Merge candidates from both channels
  const mergedCandidates = mergeCandidates(semanticCandidates, keywordCandidates, {
    maxCandidates: parsed.maxResults,
  });

  // Convert to scored entries for assembly
  return toScoredEntries(mergedCandidates);
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
