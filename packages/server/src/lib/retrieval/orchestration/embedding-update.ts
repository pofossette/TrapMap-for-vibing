/**
 * Embedding cache update utility.
 *
 * Regenerates and caches the embedding vector for a single knowledge entry.
 */

import type { SkillShareerServices } from '@trapmap/server/lib/context.js';
import { generateEmbedding, hashEmbeddingText } from '@trapmap/server/lib/embeddings.js';
import { AppError } from '@trapmap/server/lib/errors.js';
import { buildEmbeddingText } from '@trapmap/server/lib/retrieval/recall/semantic.js';
import { nowIso } from '@trapmap/server/lib/store.js';

/**
 * Update the embedding cache for a knowledge entry.
 * Should be called when an entry is approved or its searchable content changes.
 */
export async function updateEntryEmbeddingCache(
  services: SkillShareerServices,
  entryId: string,
): Promise<void> {
  const entry = await services.repos.knowledge.getById(entryId);
  if (!entry) {
    throw new AppError(404, 'knowledge_not_found', 'Knowledge entry not found');
  }

  const text = buildEmbeddingText(entry);
  const textHash = hashEmbeddingText(text);
  const vector = await generateEmbedding(text);

  await services.repos.knowledge.updateEmbeddingCache(entryId, {
    textHash,
    vector,
    createdAt: nowIso(),
    revision: entry.history.length,
  });
}
