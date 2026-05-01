/**
 * PostgreSQL pgvector recall for similarity search.
 *
 * This module provides:
 * - Vector similarity search using pgvector `<=>` operator
 * - Team, scope, and security level filtering
 * - Feature flag support for gradual rollout
 *
 * The recall uses cosine distance (1 - similarity) for ordering results.
 * Lower distance = higher similarity.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import { generateEmbedding } from '../../embeddings.js';
import { knowledgeEmbeddings } from '../../persistence/schema.js';
import type { RecallCandidate } from '../types.js';

export interface PgVectorRecallConfig {
  /** PostgreSQL connection pool */
  pool: Pool;
  /** Optional feature flag check - return empty if disabled */
  featureFlag?: () => boolean;
}

/**
 * Filters for vector recall query.
 */
export interface VectorRecallFilters {
  /** Team ID for access control (null for global-only access) */
  teamId: string | null;
  /** Maximum required level the user can access */
  securityLevel: number;
  /** Whether user is system admin (bypasses team filter) */
  isSystemAdmin: boolean;
  /** Scopes to include in search */
  scopes: string[];
  /** Labels for boosting (not filtering) */
  labels: string[];
}

export interface VectorRecallResult {
  entryId: string;
  score: number;
  vector: number[];
  scope: string;
  requiredLevel: number;
  labels: string[];
}

/**
 * Create a pgvector recall function.
 *
 * Returns a function that performs similarity search using pgvector.
 */
export function createPgVectorRecall(config: PgVectorRecallConfig) {
  const db = drizzle(config.pool, { schema: { knowledgeEmbeddings } });

  return async function pgVectorRecall(
    queryText: string,
    filters: VectorRecallFilters,
    maxResults: number,
  ): Promise<VectorRecallResult[]> {
    // Feature flag check - return empty if disabled
    if (config.featureFlag && !config.featureFlag()) {
      return [];
    }

    // Generate query embedding
    const queryVector = await generateEmbedding(queryText);

    // Build filter conditions
    const conditions = [eq(knowledgeEmbeddings.status, 'synced')];

    // Team filter (null for global, match teamId for project)
    if (!filters.isSystemAdmin) {
      if (filters.teamId) {
        // Can see global OR team-specific
        conditions.push(
          sql`(${knowledgeEmbeddings.teamId} IS NULL OR ${knowledgeEmbeddings.teamId} = ${filters.teamId})`,
        );
      } else {
        // Can only see global
        conditions.push(sql`${knowledgeEmbeddings.teamId} IS NULL`);
      }
    }

    // Security level filter
    conditions.push(sql`${knowledgeEmbeddings.requiredLevel} <= ${filters.securityLevel}`);

    // Scope filter
    if (filters.scopes.length > 0) {
      conditions.push(inArray(knowledgeEmbeddings.scope, filters.scopes));
    }

    // Format vector for SQL
    const vectorLiteral = `[${queryVector.join(',')}]`;

    // Execute similarity search using pgvector
    // <=> is cosine distance, lower = more similar
    // Convert to similarity: 1 - distance
    const results = await db
      .select({
        entryId: knowledgeEmbeddings.entryId,
        vector: knowledgeEmbeddings.vector,
        scope: knowledgeEmbeddings.scope,
        requiredLevel: knowledgeEmbeddings.requiredLevel,
        labels: knowledgeEmbeddings.labels,
        distance: sql<number>`(${knowledgeEmbeddings.vector} <=> ${sql.raw(`'${vectorLiteral}'::vector`)})`,
      })
      .from(knowledgeEmbeddings)
      .where(and(...conditions))
      .orderBy(sql`${knowledgeEmbeddings.vector} <=> ${sql.raw(`'${vectorLiteral}'::vector`)}`)
      .limit(maxResults);

    // Convert distance to similarity score and apply label boosts
    return results.map((r) => {
      let score = 1 - (r.distance ?? 0);

      // Apply label boosts
      if (filters.labels.length > 0) {
        const matchingLabels = filters.labels.filter((label) => r.labels.includes(label));
        const labelBoost = matchingLabels.length * 0.05;
        score = Math.min(1, score + labelBoost);
      }

      return {
        entryId: r.entryId,
        score,
        vector: r.vector as number[],
        scope: r.scope,
        requiredLevel: r.requiredLevel,
        labels: r.labels,
      };
    });
  };
}
