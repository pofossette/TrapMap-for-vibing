import {
  retrievalQuerySchema,
  retrievalResponseSchema,
  retrievalMatchSchema,
  type RetrievalQuery,
  type RetrievalResponse,
} from '@skill-shareer/contracts';

import type { ResolvedAuthContext, SkillShareerServices } from './context.js';
import { AppError } from './errors.js';
import { generateEmbedding, hashEmbeddingText } from './embeddings.js';
import type { EmbeddingCacheRecord, KnowledgeRecord, StoreData } from './store.js';
import { nowIso } from './store.js';

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
async function getEntryEmbedding(
  entry: KnowledgeRecord,
): Promise<number[]> {
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
 * Main retrieval pipeline.
 * Filters eligible entries, computes embeddings, ranks by similarity,
 * and shapes results into global constraints and project knowledge buckets.
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

  // Filter eligible entries
  const eligibleEntries = data.knowledgeEntries.filter((entry) =>
    isEntryEligible(entry, auth, parsed.filters)
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
    })
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

  // TODO: Implement refinement when includeRefinement is true
  // For now, we skip refinement and return null
  const refinementSummary = parsed.includeRefinement ? null : null;

  return retrievalResponseSchema.parse({
    globalConstraints,
    projectKnowledge,
    refinementSummary,
  });
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
