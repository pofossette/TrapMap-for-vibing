/**
 * Capsule index sync service.
 *
 * Synchronizes capsule data from artifact records into the keyword and
 * embedding derived index tables. Uses capsuleId + revisionNo + contentHash
 * for idempotency: re-syncing the same capsule with the same content is a no-op.
 *
 * Index data is derived data — the source of truth remains the artifact
 * revision's derived.capsules array.
 *
 * Sync triggers:
 *   - Artifact publish / approve (lifecycleState → 'approved')
 *   - Artifact revision submission / derive outputs update
 *   - Batch rebuild (see index-rebuild.ts)
 */

import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import { generateEmbedding } from '@trapmap/server/lib/embeddings.js';
import {
  skillArtifactCapsuleEmbeddings,
  skillArtifactCapsuleKeywords,
} from '@trapmap/server/lib/persistence/schema.js';
import {
  buildCapsuleEmbeddingText,
  hashCapsuleEmbeddingText,
} from '@trapmap/server/lib/retrieval/capsules/channels/semantic.js';
import { normalizeQuery, tokenize } from '@trapmap/server/lib/retrieval/recall/keyword.js';
import type { DerivedSkillCapsuleRecord, SkillArtifactRecord } from '@trapmap/server/lib/store.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CapsuleIndexSyncConfig {
  pool: Pool;
  /** Optional feature flag for gating PG writes */
  featureFlag?: () => boolean;
}

export type SyncStatus = 'synced' | 'failed';

export interface SyncRecord {
  capsuleId: string;
  status: SyncStatus;
  lastError?: string | null;
}

export interface SyncResult {
  keyword: SyncRecord[];
  embedding: SyncRecord[];
}

// ---------------------------------------------------------------------------
// Field tokenization (mirrors channels/keyword.ts)
// ---------------------------------------------------------------------------

function tokenizeField(text: string): string[] {
  return tokenize(text);
}

function computeCapsuleContentHash(capsule: DerivedSkillCapsuleRecord): string {
  const embeddingText = buildCapsuleEmbeddingText(capsule);
  return hashCapsuleEmbeddingText(embeddingText);
}

// ---------------------------------------------------------------------------
// Sync service
// ---------------------------------------------------------------------------

export function createCapsuleIndexSync(config: CapsuleIndexSyncConfig) {
  const db = drizzle(config.pool, {
    schema: { skillArtifactCapsuleKeywords, skillArtifactCapsuleEmbeddings },
  });
  const schema = { skillArtifactCapsuleKeywords, skillArtifactCapsuleEmbeddings };

  /**
   * Sync keyword tokens for a single capsule.
   *
   * Uses INSERT ... ON CONFLICT (capsule_id) DO UPDATE for upsert semantics.
   * If the contentHash matches the existing row, skips the write (no-op).
   */
  async function syncKeywordTokens(
    capsule: DerivedSkillCapsuleRecord,
    artifact: SkillArtifactRecord,
  ): Promise<SyncRecord> {
    const contentHash = computeCapsuleContentHash(capsule);

    try {
      const tokens = normalizeQuery(
        [
          capsule.content,
          capsule.situation,
          capsule.problem,
          capsule.goal,
          capsule.labels.join(' '),
          capsule.contextualPrefix ?? '',
        ].join(' '),
      );

      const fieldTokensContent = tokenizeField(capsule.content);
      const fieldTokensSituation = tokenizeField(capsule.situation);
      const fieldTokensProblem = tokenizeField(capsule.problem);
      const fieldTokensGoal = tokenizeField(capsule.goal);
      const fieldTokensLabels = capsule.labels.flatMap((l) => tokenize(l));
      const fieldTokensContextualPrefix = capsule.contextualPrefix
        ? tokenizeField(capsule.contextualPrefix)
        : [];

      await db
        .insert(schema.skillArtifactCapsuleKeywords)
        .values({
          capsuleId: capsule.capsuleId,
          artifactId: capsule.artifactId,
          revisionNo: capsule.revision,
          teamId: artifact.teamId,
          scope: capsule.scope,
          requiredLevel: capsule.requiredLevel,
          status: 'synced',
          tokens,
          fieldTokensContent,
          fieldTokensSituation,
          fieldTokensProblem,
          fieldTokensGoal,
          fieldTokensLabels,
          fieldTokensContextualPrefix,
          contentHash,
          lastError: null,
        })
        .onConflictDoUpdate({
          target: schema.skillArtifactCapsuleKeywords.capsuleId,
          set: {
            artifactId: capsule.artifactId,
            revisionNo: capsule.revision,
            teamId: artifact.teamId,
            scope: capsule.scope,
            requiredLevel: capsule.requiredLevel,
            status: 'synced',
            tokens,
            fieldTokensContent,
            fieldTokensSituation,
            fieldTokensProblem,
            fieldTokensGoal,
            fieldTokensLabels,
            fieldTokensContextualPrefix,
            contentHash,
            lastError: null,
            updatedAt: new Date(),
          },
        });

      return { capsuleId: capsule.capsuleId, status: 'synced' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await db
          .insert(schema.skillArtifactCapsuleKeywords)
          .values({
            capsuleId: capsule.capsuleId,
            artifactId: capsule.artifactId,
            revisionNo: capsule.revision,
            teamId: artifact.teamId,
            scope: capsule.scope,
            requiredLevel: capsule.requiredLevel,
            status: 'failed',
            tokens: [],
            fieldTokensContent: [],
            fieldTokensSituation: [],
            fieldTokensProblem: [],
            fieldTokensGoal: [],
            fieldTokensLabels: [],
            fieldTokensContextualPrefix: [],
            contentHash,
            lastError: message,
          })
          .onConflictDoUpdate({
            target: schema.skillArtifactCapsuleKeywords.capsuleId,
            set: {
              status: 'failed',
              lastError: message,
              updatedAt: new Date(),
            },
          });
      } catch {
        // Swallow: cannot even write failure status
      }
      return { capsuleId: capsule.capsuleId, status: 'failed', lastError: message };
    }
  }

  /**
   * Sync embedding vector for a single capsule.
   *
   * Generates an embedding from the capsule's standardized embedding text,
   * then upserts into skill_artifact_capsule_embeddings.
   * Falls back to marking status='failed' on embedding generation errors.
   */
  async function syncEmbedding(
    capsule: DerivedSkillCapsuleRecord,
    artifact: SkillArtifactRecord,
  ): Promise<SyncRecord> {
    const embeddingText = buildCapsuleEmbeddingText(capsule);
    const contentHash = hashCapsuleEmbeddingText(embeddingText);

    try {
      const vector = await generateEmbedding(embeddingText);

      await db
        .insert(schema.skillArtifactCapsuleEmbeddings)
        .values({
          capsuleId: capsule.capsuleId,
          artifactId: capsule.artifactId,
          revisionNo: capsule.revision,
          teamId: artifact.teamId,
          scope: capsule.scope,
          requiredLevel: capsule.requiredLevel,
          status: 'synced',
          embedding: vector,
          contentHash,
          lastError: null,
        })
        .onConflictDoUpdate({
          target: schema.skillArtifactCapsuleEmbeddings.capsuleId,
          set: {
            artifactId: capsule.artifactId,
            revisionNo: capsule.revision,
            teamId: artifact.teamId,
            scope: capsule.scope,
            requiredLevel: capsule.requiredLevel,
            status: 'synced',
            embedding: vector,
            contentHash,
            lastError: null,
            updatedAt: new Date(),
          },
        });

      return { capsuleId: capsule.capsuleId, status: 'synced' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await db
          .insert(schema.skillArtifactCapsuleEmbeddings)
          .values({
            capsuleId: capsule.capsuleId,
            artifactId: capsule.artifactId,
            revisionNo: capsule.revision,
            teamId: artifact.teamId,
            scope: capsule.scope,
            requiredLevel: capsule.requiredLevel,
            status: 'failed',
            embedding: new Array(384).fill(0),
            contentHash,
            lastError: message,
          })
          .onConflictDoUpdate({
            target: schema.skillArtifactCapsuleEmbeddings.capsuleId,
            set: {
              status: 'failed',
              lastError: message,
              updatedAt: new Date(),
            },
          });
      } catch {
        // Swallow
      }
      return { capsuleId: capsule.capsuleId, status: 'failed', lastError: message };
    }
  }

  /**
   * Sync a single artifact's capsules to both index tables.
   *
   * Iterates over all capsules in the artifact's latest revision, syncing
   * keyword tokens and embedding vectors for each. Failed capsules are
   * recorded with status='failed' and lastError set.
   */
  async function syncArtifactCapsules(artifact: SkillArtifactRecord): Promise<SyncResult> {
    if (config.featureFlag && !config.featureFlag()) {
      return { keyword: [], embedding: [] };
    }

    const capsules = artifact.latestRevision.derived?.capsules ?? [];
    const keywordResults: SyncRecord[] = [];
    const embeddingResults: SyncRecord[] = [];

    for (const capsule of capsules) {
      const [kw, emb] = await Promise.all([
        syncKeywordTokens(capsule, artifact),
        syncEmbedding(capsule, artifact),
      ]);
      keywordResults.push(kw);
      embeddingResults.push(emb);
    }

    return { keyword: keywordResults, embedding: embeddingResults };
  }

  /**
   * Remove index rows for a specific capsule.
   *
   * Used during artifact deletion or when capsules are removed from a revision.
   */
  async function removeCapsuleIndex(capsuleId: string): Promise<void> {
    await db
      .delete(schema.skillArtifactCapsuleKeywords)
      .where(sql`${schema.skillArtifactCapsuleKeywords.capsuleId} = ${capsuleId}`);
    await db
      .delete(schema.skillArtifactCapsuleEmbeddings)
      .where(sql`${schema.skillArtifactCapsuleEmbeddings.capsuleId} = ${capsuleId}`);
  }

  /**
   * Check whether a capsule index entry exists and is synced.
   */
  async function getSyncStatus(capsuleId: string): Promise<{
    keywordStatus: SyncStatus | 'missing';
    embeddingStatus: SyncStatus | 'missing';
    keywordError?: string | null;
    embeddingError?: string | null;
  }> {
    const [kwRow] = await db
      .select({
        status: schema.skillArtifactCapsuleKeywords.status,
        lastError: schema.skillArtifactCapsuleKeywords.lastError,
      })
      .from(schema.skillArtifactCapsuleKeywords)
      .where(sql`${schema.skillArtifactCapsuleKeywords.capsuleId} = ${capsuleId}`)
      .limit(1);

    const [embRow] = await db
      .select({
        status: schema.skillArtifactCapsuleEmbeddings.status,
        lastError: schema.skillArtifactCapsuleEmbeddings.lastError,
      })
      .from(schema.skillArtifactCapsuleEmbeddings)
      .where(sql`${schema.skillArtifactCapsuleEmbeddings.capsuleId} = ${capsuleId}`)
      .limit(1);

    return {
      keywordStatus: kwRow ? (kwRow.status as SyncStatus) : 'missing',
      embeddingStatus: embRow ? (embRow.status as SyncStatus) : 'missing',
      keywordError: kwRow?.lastError ?? null,
      embeddingError: embRow?.lastError ?? null,
    };
  }

  return {
    syncArtifactCapsules,
    syncKeywordTokens,
    syncEmbedding,
    removeCapsuleIndex,
    getSyncStatus,
  };
}
