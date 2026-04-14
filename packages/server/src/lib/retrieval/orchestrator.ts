import {
  type RetrievalQuery,
  type RetrievalResponse,
  retrievalMatchSchema,
  retrievalQuerySchema,
  retrievalResponseSchema,
} from '@skill-shareer/contracts';

import type { ResolvedAuthContext, SkillShareerServices } from '../context.js';
import { generateEmbedding, hashEmbeddingText } from '../embeddings.js';
import { AppError } from '../errors.js';
import type { EmbeddingCacheRecord, KnowledgeRecord } from '../store.js';
import { nowIso } from '../store.js';
import type { RetrievalPipelineContext, ScoredEntry } from './types.js';

/**
 * Build the embedding text from a knowledge entry.
 * Uses shortcut, detail, and labels - excludes images, attachments, and review metadata.
 */
function buildEmbeddingText(entry: KnowledgeRecord): string {
  const labelsText = entry.labels.join(' ');
  return `${entry.shortcut}\n${entry.detail}\n${labelsText}`.trim();
}

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vector dimensions must match');
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dotProduct += ai * bi;
    magnitudeA += ai * ai;
    magnitudeB += bi * bi;
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Get or compute embedding vector for a knowledge entry.
 * Uses cache if available and text hasn't changed.
 */
async function getEntryEmbedding(entry: KnowledgeRecord): Promise<number[]> {
  const text = buildEmbeddingText(entry);
  const textHash = hashEmbeddingText(text);

  // Check cache: only use if revision matches and text hash matches
  if (
    entry.embeddingCache &&
    entry.embeddingCache.revision === entry.history.length &&
    entry.embeddingCache.textHash === textHash
  ) {
    return entry.embeddingCache.vector;
  }

  // Cache miss or outdated - compute new embedding
  const vector = await generateEmbedding(text);

  // Note: We don't update the cache here because we're working with a snapshot
  // The cache would be updated when the entry is modified or approved
  return vector;
}

/**
 * Check if an entry is eligible for retrieval given auth context and filters.
 * Enforces approval state, team access, security level, and metadata filters.
 */
function isEntryEligible(
  entry: KnowledgeRecord,
  auth: ResolvedAuthContext,
  filters: RetrievalQuery['filters'],
): boolean {
  // Must be approved
  if (entry.lifecycleState !== 'approved') {
    return false;
  }

  // Must have required level <= caller's security level
  if (entry.requiredLevel > auth.securityLevel) {
    return false;
  }

  // Project entries must match active team (unless system admin)
  if (entry.teamId && auth.subjectType !== 'system-admin') {
    if (entry.teamId !== auth.activeTeamId) {
      return false;
    }
  }

  // Apply scope filter if provided
  if (filters.scopes.length > 0 && !filters.scopes.includes(entry.scope)) {
    return false;
  }

  // Apply label filter if provided (all labels must match)
  if (filters.labels.length > 0) {
    const hasAllLabels = filters.labels.every((label) => entry.labels.includes(label));
    if (!hasAllLabels) {
      return false;
    }
  }

  return true;
}

/**
 * Compute relevance score with metadata-aware boosts.
 * Base score is embedding similarity, boosted by exact label/scope matches.
 */
function computeScore(
  similarity: number,
  entry: KnowledgeRecord,
  filters: RetrievalQuery['filters'],
): number {
  // Clamp similarity to [0, 1] range first
  let score = Math.max(0, Math.min(1, similarity));

  // Boost for exact label matches
  if (filters.labels.length > 0) {
    const matchingLabels = filters.labels.filter((label) => entry.labels.includes(label));
    const labelBoost = matchingLabels.length * 0.05; // Small boost per matching label
    score = Math.min(1, score + labelBoost);
  }

  // Boost for exact scope match
  if (filters.scopes.length === 1 && filters.scopes[0] === entry.scope) {
    score = Math.min(1, score + 0.03);
  }

  return score;
}

/**
 * Generate a human-readable reason for the match.
 */
function generateMatchReason(
  entry: KnowledgeRecord,
  score: number,
  filters: RetrievalQuery['filters'],
): string {
  const parts: string[] = [];

  if (filters.labels.length > 0) {
    const matchingLabels = filters.labels.filter((label) => entry.labels.includes(label));
    if (matchingLabels.length > 0) {
      parts.push(`matches labels: ${matchingLabels.join(', ')}`);
    }
  }

  if (filters.scopes.length === 1 && filters.scopes[0] === entry.scope) {
    parts.push(`scope: ${entry.scope}`);
  }

  const baseReason = parts.length > 0 ? parts.join('; ') : 'semantic similarity';
  return `${baseReason} (score: ${score.toFixed(2)})`;
}

/**
 * Convert a knowledge entry to a retrieval match.
 */
function toRetrievalMatch(
  entry: KnowledgeRecord,
  score: number,
  filters: RetrievalQuery['filters'],
) {
  return retrievalMatchSchema.parse({
    entryId: entry.id,
    scope: entry.scope,
    requiredLevel: entry.requiredLevel,
    shortcut: entry.shortcut,
    detail: entry.detail,
    labels: entry.labels,
    score,
    reason: generateMatchReason(entry, score, filters),
  });
}

/**
 * Main retrieval pipeline orchestrator.
 *
 * Pipeline order (enforced for security):
 * 1. Approval state filtering (server-owned gate)
 * 2. Permission/team filtering (server-owned gate)
 * 3. Vector embedding retrieval (semantic search)
 * 4. Response assembly and output shaping
 *
 * This orchestrator is the entrypoint for Phase 7+ extensions:
 * - Hybrid recall (vector + keyword)
 * - Reranking for improved ordering
 * - Query mode support (semantic/hybrid/graph-assisted)
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
  const eligibleEntries = data.knowledgeEntries.filter((entry) =>
    isEntryEligible(entry, auth, parsed.filters),
  );

  if (eligibleEntries.length === 0) {
    return retrievalResponseSchema.parse({
      globalConstraints: [],
      projectKnowledge: [],
      refinementSummary: null,
    });
  }

  // Generate query embedding
  const queryText = parsed.seed;
  const queryVector = await generateEmbedding(queryText);

  // Compute embeddings and scores for all eligible entries
  const scoredEntries = await Promise.all(
    eligibleEntries.map(async (entry) => {
      const entryVector = await getEntryEmbedding(entry);
      const similarity = cosineSimilarity(queryVector, entryVector);
      const score = computeScore(similarity, entry, parsed.filters);
      return { entry, score };
    }),
  );

  // Sort by score descending
  scoredEntries.sort((a, b) => b.score - a.score);

  // Take top maxResults
  const topMatches = scoredEntries.slice(0, parsed.maxResults);

  // Split into global constraints and project knowledge
  const globalConstraints = [];
  const projectKnowledge = [];

  for (const { entry, score } of topMatches) {
    const match = toRetrievalMatch(entry, score, parsed.filters);
    if (entry.scope === 'global') {
      globalConstraints.push(match);
    } else {
      projectKnowledge.push(match);
    }
  }

  // Generate refinement summary if requested and available
  const refinementSummary = parsed.includeRefinement
    ? await generateRefinement(parsed.seed, globalConstraints, projectKnowledge)
    : null;

  return retrievalResponseSchema.parse({
    globalConstraints,
    projectKnowledge,
    refinementSummary,
  });
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
