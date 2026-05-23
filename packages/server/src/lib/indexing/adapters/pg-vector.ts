/**
 * PostgreSQL pgvector adapter for lifecycle-driven indexing.
 *
 * This module provides:
 * - Vector sync to PostgreSQL knowledge_embeddings table
 * - Idempotent upsert based on revision and content hash
 * - Feature flag support for gradual rollout
 *
 * Security note: This adapter operates on already-approved entries.
 * The pipeline is responsible for gating on lifecycleState before calling sync.
 */

import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import { generateEmbedding } from '@trapmap/server/lib/embeddings.js';
import type {
  IndexAdapter,
  IndexSyncResult,
  NormalizedIndexDocument,
} from '@trapmap/server/lib/indexing/types.js';
import { knowledgeEmbeddings } from '@trapmap/server/lib/persistence/schema.js';

export interface PgVectorAdapterConfig {
  /** PostgreSQL connection pool */
  pool: Pool;
  /** Optional feature flag check - return false to disable writes */
  featureFlag?: () => boolean;
}

/**
 * Create a PostgreSQL pgvector adapter for embedding storage.
 *
 * The adapter writes to knowledge_embeddings table and supports:
 * - Idempotent sync (skips if revision + contentHash match)
 * - Feature flag disable
 * - Automatic embedding generation
 */
export function createPgVectorAdapter(config: PgVectorAdapterConfig): IndexAdapter {
  const db = drizzle(config.pool, { schema: { knowledgeEmbeddings } });

  return {
    kind: 'vector',

    async sync(document: NormalizedIndexDocument): Promise<IndexSyncResult> {
      // Feature flag check - skip if disabled
      if (config.featureFlag && !config.featureFlag()) {
        return {
          adapterKind: 'vector',
          success: true,
          error: null,
          performedWork: false,
        };
      }

      try {
        // Check if already synced (idempotency)
        const existing = await db
          .select()
          .from(knowledgeEmbeddings)
          .where(
            and(
              eq(knowledgeEmbeddings.entryId, document.entryId),
              eq(knowledgeEmbeddings.revisionNo, document.revision),
            ),
          )
          .limit(1);

        if (existing.length > 0 && existing[0]?.contentHash === document.contentHash) {
          return {
            adapterKind: 'vector',
            success: true,
            error: null,
            performedWork: false,
          };
        }

        // Generate embedding
        const vector = await generateEmbedding(document.canonicalText);

        // Build primary key
        const id = `entry_${document.entryId}_rev${document.revision}`;

        // Upsert to PostgreSQL
        await db
          .insert(knowledgeEmbeddings)
          .values({
            id,
            entryId: document.entryId,
            revisionNo: document.revision,
            contentHash: document.contentHash,
            vector,
            teamId: document.teamId,
            scope: document.scope,
            requiredLevel: document.requiredLevel,
            labels: document.labels,
            status: 'synced',
          })
          .onConflictDoUpdate({
            target: knowledgeEmbeddings.id,
            set: {
              contentHash: document.contentHash,
              vector,
              teamId: document.teamId,
              scope: document.scope,
              requiredLevel: document.requiredLevel,
              labels: document.labels,
              status: 'synced',
              updatedAt: new Date(),
            },
          });

        return {
          adapterKind: 'vector',
          success: true,
          error: null,
          performedWork: true,
          payload: vector, // Return for embeddingCache compatibility
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          adapterKind: 'vector',
          success: false,
          error: errorMessage,
          performedWork: false,
        };
      }
    },

    async remove(ref: { entryId: string; revision: number }): Promise<void> {
      if (config.featureFlag && !config.featureFlag()) {
        return;
      }

      await db
        .delete(knowledgeEmbeddings)
        .where(
          and(
            eq(knowledgeEmbeddings.entryId, ref.entryId),
            eq(knowledgeEmbeddings.revisionNo, ref.revision),
          ),
        );
    },
  };
}
