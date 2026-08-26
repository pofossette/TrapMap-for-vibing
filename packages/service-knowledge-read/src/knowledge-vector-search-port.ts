import type {
  VectorSearchFilters,
  VectorSearchPort,
  VectorSearchRecord,
} from '@trapmap/backend-core';
import {
  appendScopeFilter,
  appendTeamFilter,
  clampSimilarity,
  formatVectorLiteral,
} from '@trapmap/infra';
import type { Pool } from 'pg';

export interface KnowledgeEmbeddingVectorSearchFilters
  extends Omit<VectorSearchFilters, 'teamId' | 'maxRequiredLevel' | 'scopes'> {
  teamId?: string | null;
  maxRequiredLevel?: number;
  scopes?: Array<'global' | 'project'>;
}

export interface KnowledgeEmbeddingVectorSearchHit {
  sourceId: string;
  similarity: number;
  metadata: {
    shortcut: string;
    labels: string[];
    scope: string;
    requiredLevel: number;
  };
}

export interface KnowledgeEmbeddingVectorSearchPort extends Omit<VectorSearchPort, 'search'> {
  search(
    vector: number[],
    filters: KnowledgeEmbeddingVectorSearchFilters,
    limit: number,
  ): Promise<KnowledgeEmbeddingVectorSearchHit[]>;
}

export function createKnowledgeEmbeddingsVectorSearchPort(
  pool: Pool,
): KnowledgeEmbeddingVectorSearchPort {
  return {
    async upsert(records: VectorSearchRecord[]): Promise<void> {
      for (const record of records) {
        await pool.query(
          `INSERT INTO knowledge_embeddings
             (id, entry_id, revision_no, content_hash, vector, team_id, scope,
              required_level, status)
           VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8, 'synced')
           ON CONFLICT (entry_id, revision_no) DO UPDATE SET
             content_hash = EXCLUDED.content_hash,
             vector = EXCLUDED.vector,
             team_id = EXCLUDED.team_id,
             scope = EXCLUDED.scope,
             required_level = EXCLUDED.required_level,
             status = 'synced',
             last_error = NULL,
             updated_at = now()`,
          [
            `entry_${record.sourceId}_rev${record.sourceRevision}`,
            record.sourceId,
            record.sourceRevision,
            record.contentHash,
            formatVectorLiteral(record.vector),
            record.teamId,
            record.scope,
            record.requiredLevel,
          ],
        );
      }
    },

    async search(
      vector: number[],
      filters: KnowledgeEmbeddingVectorSearchFilters,
      limit: number,
    ): Promise<KnowledgeEmbeddingVectorSearchHit[]> {
      const conditions = ["ke.status = 'synced'"];
      const params: Array<string | number | string[]> = [];

      appendTeamFilter(conditions, params, filters.teamId, 'ke.team_id');
      conditions.push(`ke.required_level <= $${params.length + 1}`);
      params.push(filters.maxRequiredLevel ?? 0);
      appendScopeFilter(conditions, params, filters.scopes ?? ['global', 'project'], 'ke.scope');
      if (filters.sourceIds && filters.sourceIds.length > 0) {
        conditions.push(`ke.entry_id = ANY($${params.length + 1})`);
        params.push(filters.sourceIds);
      }

      const vectorIndex = params.length + 1;
      params.push(formatVectorLiteral(vector));
      params.push(limit);
      const result = await pool.query<{
        entry_id: string;
        similarity: number;
        shortcut: string | null;
        labels: string[] | null;
        scope: string;
        required_level: number;
      }>(
        `SELECT ke.entry_id,
                1 - (ke.vector <=> $${vectorIndex}::vector) AS similarity,
                COALESCE(entries.shortcut, ke.entry_id) AS shortcut,
                COALESCE(entries.labels, '{}'::text[]) AS labels,
                ke.scope,
                ke.required_level
         FROM knowledge_embeddings ke
         LEFT JOIN knowledge_entries entries ON entries.id = ke.entry_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY ke.vector <=> $${vectorIndex}::vector
         LIMIT $${vectorIndex + 1}`,
        params,
      );

      return result.rows.map((row) => ({
        sourceId: row.entry_id,
        similarity: clampSimilarity(row.similarity),
        metadata: {
          shortcut: row.shortcut ?? row.entry_id,
          labels: row.labels ?? [],
          scope: row.scope,
          requiredLevel: row.required_level,
        },
      }));
    },

    async deleteBySource(sourceId: string): Promise<void> {
      await pool.query('DELETE FROM knowledge_embeddings WHERE entry_id = $1', [sourceId]);
    },

    async health(): Promise<{ ok: boolean; reason?: string }> {
      try {
        await pool.query('SELECT 1');
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}
