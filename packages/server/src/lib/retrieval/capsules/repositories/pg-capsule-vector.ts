/**
 * PostgreSQL capsule vector search for semantic recall.
 *
 * Provides cosine-similarity search via pgvector on the
 * skill_artifact_capsule_embeddings derived index table.
 *
 * Uses pgvector's `<=>` operator for cosine distance, converted to
 * similarity as `1 - distance` for intuitive [0,1] scoring.
 */

import { and, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import { skillArtifactCapsuleEmbeddings } from '../../../persistence/schema.js';
import type { CapsuleRecallCandidate, CapsuleRecallChannelName } from '../../types.js';

export interface PgCapsuleVectorConfig {
  pool: Pool;
  featureFlag?: () => boolean;
}

export interface PgCapsuleVectorFilters {
  teamId: string | null;
  securityLevel: number;
  isSystemAdmin: boolean;
  scopes: string[];
}

/**
 * Format a vector array as a PostgreSQL vector literal.
 */
function formatVectorLiteral(vector: number[]): string {
  return `[${vector.join(',')}]`;
}

/**
 * Create a PostgreSQL capsule vector recall function.
 */
export function createPgCapsuleVectorRecall(config: PgCapsuleVectorConfig) {
  const db = drizzle(config.pool, { schema: { skillArtifactCapsuleEmbeddings } });

  return async function pgCapsuleVectorRecall(
    queryVector: number[],
    filters: PgCapsuleVectorFilters,
    maxResults: number,
  ): Promise<CapsuleRecallCandidate[]> {
    if (config.featureFlag && !config.featureFlag()) return [];

    const conditions = [sql`${skillArtifactCapsuleEmbeddings.status} = 'synced'`];

    if (!filters.isSystemAdmin) {
      if (filters.teamId) {
        conditions.push(
          sql`(${skillArtifactCapsuleEmbeddings.teamId} IS NULL OR ${skillArtifactCapsuleEmbeddings.teamId} = ${filters.teamId})`,
        );
      } else {
        conditions.push(sql`${skillArtifactCapsuleEmbeddings.teamId} IS NULL`);
      }
    }

    conditions.push(
      sql`${skillArtifactCapsuleEmbeddings.requiredLevel} <= ${filters.securityLevel}`,
    );

    if (filters.scopes.length > 0) {
      const scopeList = filters.scopes.map((s) => `'${s}'`).join(',');
      conditions.push(sql`${skillArtifactCapsuleEmbeddings.scope} IN (${sql.raw(scopeList)})`);
    }

    const vectorLiteral = formatVectorLiteral(queryVector);

    const rows = await db
      .select({
        capsuleId: skillArtifactCapsuleEmbeddings.capsuleId,
        artifactId: skillArtifactCapsuleEmbeddings.artifactId,
        revisionNo: skillArtifactCapsuleEmbeddings.revisionNo,
        similarity: sql<number>`1 - (${skillArtifactCapsuleEmbeddings.embedding} <=> ${sql.raw(`'${vectorLiteral}'::vector`)})`,
      })
      .from(skillArtifactCapsuleEmbeddings)
      .where(and(...conditions))
      .orderBy(
        sql`${skillArtifactCapsuleEmbeddings.embedding} <=> ${sql.raw(`'${vectorLiteral}'::vector`)}`,
      )
      .limit(maxResults * 2);

    const candidates: CapsuleRecallCandidate[] = rows
      .filter((r) => (r.similarity ?? 0) > 0)
      .map((r) => ({
        capsuleId: r.capsuleId,
        artifactId: r.artifactId,
        revision: r.revisionNo,
        channel: 'capsule-semantic' as CapsuleRecallChannelName,
        score: Math.max(0, Math.min(1, Math.round((r.similarity ?? 0) * 10000) / 10000)),
      }));

    return candidates.sort((a, b) => b.score - a.score).slice(0, maxResults);
  };
}

/**
 * Create HNSW index on skill_artifact_capsule_embeddings if not exists.
 *
 * HNSW (Hierarchical Navigable Small World) provides O(log n) search complexity.
 *
 * @param pool - PostgreSQL connection pool
 */
export async function ensureCapsuleVectorIndex(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_capsule_embeddings_vector_hnsw
    ON skill_artifact_capsule_embeddings
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
  `);
}

/**
 * Drop the HNSW index if it exists.
 */
export async function dropCapsuleVectorIndex(pool: Pool): Promise<void> {
  await pool.query(`
    DROP INDEX IF EXISTS idx_capsule_embeddings_vector_hnsw
  `);
}
