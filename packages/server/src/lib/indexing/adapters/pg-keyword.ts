/**
 * PostgreSQL keyword adapter for lifecycle-driven indexing.
 *
 * This module provides:
 * - Keyword sync to PostgreSQL knowledge_keywords table
 * - Idempotent upsert based on revision and content hash
 * - Feature flag support for gradual rollout
 *
 * Security note: This adapter operates on already-approved entries.
 * The pipeline is responsible for gating on lifecycleState before calling sync.
 */

import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import { knowledgeKeywords } from '../../persistence/schema.js';
import type { IndexAdapter, IndexSyncResult, NormalizedIndexDocument } from '../types.js';

export interface PgKeywordAdapterConfig {
  /** PostgreSQL connection pool */
  pool: Pool;
  /** Optional feature flag check - return false to disable writes */
  featureFlag?: () => boolean;
}

/**
 * Create a PostgreSQL keyword adapter for token storage.
 *
 * The adapter writes to knowledge_keywords table and supports:
 * - Idempotent sync (skips if revision + contentHash match)
 * - Feature flag disable
 * - Field-weighted token extraction
 */
export function createPgKeywordAdapter(config: PgKeywordAdapterConfig): IndexAdapter {
  const db = drizzle(config.pool, { schema: { knowledgeKeywords } });

  return {
    kind: 'keyword',

    async sync(document: NormalizedIndexDocument): Promise<IndexSyncResult> {
      // Feature flag check - skip if disabled
      if (config.featureFlag && !config.featureFlag()) {
        return {
          adapterKind: 'keyword',
          success: true,
          error: null,
          performedWork: false,
        };
      }

      try {
        // Check for idempotency
        const existing = await db
          .select()
          .from(knowledgeKeywords)
          .where(
            and(
              eq(knowledgeKeywords.entryId, document.entryId),
              eq(knowledgeKeywords.revisionNo, document.revision),
            ),
          )
          .limit(1);

        if (existing.length > 0 && existing[0]?.contentHash === document.contentHash) {
          return {
            adapterKind: 'keyword',
            success: true,
            error: null,
            performedWork: false,
          };
        }

        // Build keyword state from normalized document
        const tokens = document.tokens;
        const fieldTokensShortcut = tokens.filter((t) =>
          document.shortcut.toLowerCase().includes(t),
        );
        const fieldTokensDetail = tokens.filter((t) => document.detail.toLowerCase().includes(t));
        const fieldTokensLabels = tokens.filter((t) =>
          document.labels.some((l) => l.toLowerCase().includes(t)),
        );

        // Build primary key
        const id = `entry_${document.entryId}_rev${document.revision}`;

        // Upsert to PostgreSQL
        await db
          .insert(knowledgeKeywords)
          .values({
            id,
            entryId: document.entryId,
            revisionNo: document.revision,
            contentHash: document.contentHash,
            tokens,
            fieldTokensShortcut,
            fieldTokensDetail,
            fieldTokensLabels,
            teamId: document.teamId,
            scope: document.scope,
            requiredLevel: document.requiredLevel,
            status: 'synced',
          })
          .onConflictDoUpdate({
            target: knowledgeKeywords.id,
            set: {
              contentHash: document.contentHash,
              tokens,
              fieldTokensShortcut,
              fieldTokensDetail,
              fieldTokensLabels,
              status: 'synced',
              updatedAt: new Date(),
            },
          });

        return {
          adapterKind: 'keyword',
          success: true,
          error: null,
          performedWork: true,
          payload: {
            tokens,
            fieldTokens: {
              shortcut: fieldTokensShortcut,
              detail: fieldTokensDetail,
              labels: fieldTokensLabels,
            },
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          adapterKind: 'keyword',
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
        .delete(knowledgeKeywords)
        .where(
          and(
            eq(knowledgeKeywords.entryId, ref.entryId),
            eq(knowledgeKeywords.revisionNo, ref.revision),
          ),
        );
    },
  };
}
