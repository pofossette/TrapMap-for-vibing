/**
 * Capsule semantic recall channel.
 *
 * Provides embedding-based recall over capsule text fields using cosine similarity.
 * Solves the "same problem, different wording" gap that keyword-only recall misses.
 *
 * Embedding text builder (from v2 multi-recall plan):
 *   labels → situation → problem → goal → contextualPrefix → content
 * Content is truncated to 500 chars to avoid embedding dilution.
 *
 * Supports dual-path recall:
 *   - PG path: uses pgvector similarity search on skill_artifact_capsule_embeddings
 *   - Memory path: in-memory embedding generation and cosine similarity (always available)
 */

import { createHash } from 'node:crypto';
import { generateEmbedding } from '@trapmap/server/lib/embeddings.js';
import { extractGovernedCapsules } from '@trapmap/server/lib/retrieval/capsules/capsule-recall.js';
import {
  type PgCapsuleVectorFilters,
  createPgCapsuleVectorRecall,
} from '@trapmap/server/lib/retrieval/capsules/repositories/pg-capsule-vector.js';
import { cosineSimilarity } from '@trapmap/server/lib/retrieval/recall/semantic.js';
import type {
  ArtifactGovernanceFilters,
  CapsuleRecallCandidate,
  CapsuleRecallChannel,
  CapsuleRecallChannelName,
  ParsedIntent,
} from '@trapmap/server/lib/retrieval/types.js';
import type { SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import type { Pool } from 'pg';

const MAX_CONTENT_CHARS = 500;

/**
 * Build embedding text from a capsule's fields.
 *
 * Field order: labels, situation, problem, goal, contextualPrefix, content.
 * Content is truncated to MAX_CONTENT_CHARS to avoid diluting the embedding
 * with long body text.
 */
export function buildCapsuleEmbeddingText(capsule: {
  labels: string[];
  situation: string;
  problem: string;
  goal: string;
  contextualPrefix?: string;
  content: string;
}): string {
  const parts: string[] = [
    capsule.labels.join(' '),
    capsule.situation,
    capsule.problem,
    capsule.goal,
  ];

  if (capsule.contextualPrefix) {
    parts.push(capsule.contextualPrefix);
  }

  const content =
    capsule.content.length > MAX_CONTENT_CHARS
      ? capsule.content.slice(0, MAX_CONTENT_CHARS)
      : capsule.content;
  parts.push(content);

  return parts.filter((p) => p.length > 0).join('\n');
}

/**
 * Compute a content hash for embedding cache invalidation.
 * Uses SHA-256 of the embedding text.
 */
export function hashCapsuleEmbeddingText(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Perform memory-based semantic recall over governed capsule candidates.
 *
 * Computes query embedding, then scores each governed capsule via cosine
 * similarity between query vector and capsule embedding text vector.
 *
 * @param artifacts - Skill artifact records (must be pre-filtered by governance)
 * @param intent - Parsed intent from seed
 * @param filters - Governance filters
 * @param maxResults - Maximum candidates to return
 */
export async function capsuleSemanticRecall(
  artifacts: SkillArtifactRecord[],
  intent: ParsedIntent,
  filters: ArtifactGovernanceFilters,
  maxResults: number,
): Promise<CapsuleRecallCandidate[]> {
  const governed = extractGovernedCapsules(artifacts, filters);

  if (governed.length === 0) return [];

  const queryText = intent.semanticQuery || intent.seed || intent.normalized;
  if (!queryText || queryText.trim().length === 0) return [];

  let queryVector: number[];
  try {
    queryVector = await generateEmbedding(queryText);
  } catch {
    return [];
  }

  const candidates: CapsuleRecallCandidate[] = [];

  for (const { capsule } of governed) {
    const embeddingText = buildCapsuleEmbeddingText(capsule);
    let capsuleVector: number[];
    try {
      capsuleVector = await generateEmbedding(embeddingText);
    } catch {
      continue;
    }

    const score = Math.max(0, cosineSimilarity(queryVector, capsuleVector));

    if (score > 0) {
      candidates.push({
        capsuleId: capsule.capsuleId,
        artifactId: capsule.artifactId,
        revision: capsule.revision,
        channel: 'capsule-semantic' as CapsuleRecallChannelName,
        score: Math.round(score * 10000) / 10000,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  return candidates.slice(0, maxResults);
}

function governanceToPgVectorFilters(filters: ArtifactGovernanceFilters): PgCapsuleVectorFilters {
  return {
    teamId: filters.teamId,
    securityLevel: filters.securityLevel,
    isSystemAdmin: filters.isSystemAdmin,
    scopes: filters.scopes,
    labels: filters.labels,
  };
}

export interface CapsuleSemanticChannelOptions {
  pgPool?: Pool;
  pgFeatureFlag?: () => boolean;
}

/**
 * Create a capsule semantic recall channel.
 *
 * When pgPool is provided and pgFeatureFlag returns true (or is absent),
 * uses PostgreSQL pgvector similarity search on skill_artifact_capsule_embeddings.
 * Falls back to in-memory embedding generation and cosine similarity
 * when PG is unavailable or returns no results.
 */
export function createCapsuleSemanticChannel(
  options?: CapsuleSemanticChannelOptions,
): CapsuleRecallChannel {
  const pgRecall = options?.pgPool
    ? createPgCapsuleVectorRecall({
        pool: options.pgPool,
        featureFlag: options.pgFeatureFlag ?? undefined,
      } as Parameters<typeof createPgCapsuleVectorRecall>[0])
    : null;

  return {
    name: 'capsule-semantic' as CapsuleRecallChannelName,

    async recall(
      artifacts: SkillArtifactRecord[],
      intent: ParsedIntent,
      filters: ArtifactGovernanceFilters,
      maxResults: number,
    ): Promise<CapsuleRecallCandidate[]> {
      if (pgRecall) {
        const queryText = intent.semanticQuery || intent.seed || intent.normalized;
        if (queryText && queryText.trim().length > 0) {
          try {
            const queryVector = await generateEmbedding(queryText);
            const pgFilters = governanceToPgVectorFilters(filters);
            const pgResults = await pgRecall(queryVector, pgFilters, maxResults);
            if (pgResults.length > 0) return pgResults;
          } catch {
            // PG path failed, fall through to memory
          }
        }
      }
      return capsuleSemanticRecall(artifacts, intent, filters, maxResults);
    },
  };
}

/** @deprecated Use createCapsuleSemanticChannel() instead. */
export const capsuleSemanticChannel: CapsuleRecallChannel = createCapsuleSemanticChannel();
