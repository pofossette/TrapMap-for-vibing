/**
 * knowledge-read host ports (Phase 3 shared/ports retirement, Phase 4 D5).
 *
 * The distributed knowledge-read service owns its PostgreSQL read-model
 * projection. The legacy ILIKE retrieval query was removed in Phase 4 / D5:
 * distributed retrieval now runs the complete retrieval-engine pipeline
 * (assembled in converged-retrieval.ts) so its semantics match the monolith.
 */
import type { KnowledgeEntryRecord, KnowledgeReadProjectionPort } from '@trapmap/backend-core';
import type { LifecycleState } from '@trapmap/contracts';

/** Minimal pool seam used by the knowledge-read pg projection (query-only). */
export interface KnowledgeReadPool {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

function mapKnowledgeRow(row: Record<string, unknown>): KnowledgeEntryRecord {
  const {
    detail,
    shortcut,
    labels,
    owner_user_id: ownerUserId,
    ownerUserId: legacyOwnerUserId,
    team_id: teamId,
    teamId: legacyTeamId,
    lifecycle_state: lifecycleState,
    ...entry
  } = row;
  return {
    ...entry,
    id: String(row.id),
    content: String(detail ?? ''),
    title: String(shortcut ?? ''),
    labels: Array.isArray(labels) ? labels : [],
    ownerUserId: String(ownerUserId ?? legacyOwnerUserId ?? ''),
    teamId: ((teamId as string | null) ?? (legacyTeamId as string | null) ?? null) as string,
    lifecycleState: lifecycleState as LifecycleState,
  };
}

export function createPgKnowledgeReadProjection(
  pool: KnowledgeReadPool,
): KnowledgeReadProjectionPort<KnowledgeEntryRecord> & {
  listByFilter(
    filter: Record<string, never>,
    page?: { offset: number; limit: number },
  ): Promise<{ items: KnowledgeEntryRecord[]; total: number }>;
} {
  return {
    async getById(entryId) {
      const result = await pool.query('SELECT * FROM knowledge_entries WHERE id = $1', [entryId]);
      const row = result.rows.at(0) as Record<string, unknown> | undefined;
      return row ? mapKnowledgeRow(row) : null;
    },
    async listMine({ userId, teamId }) {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;
      conditions.push(`owner_user_id = $${paramIndex++}`);
      params.push(userId);
      if (teamId) {
        conditions.push(`team_id = $${paramIndex++}`);
        params.push(teamId);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const { rows } = await pool.query(
        `SELECT * FROM knowledge_entries ${whereClause} ORDER BY created_at DESC LIMIT 100`,
        params,
      );
      return rows.map((row) => mapKnowledgeRow(row as Record<string, unknown>));
    },
    async getStatus() {
      return {
        phase: 'phase-2-boundary-closed',
        source: 'knowledge-write-owner',
        consistency: 'strong',
        freshness: 'current',
        fallback: 'none',
        surfaces: [],
      };
    },
    async listByFilter(_filter: Record<string, never>, page?: { offset: number; limit: number }) {
      const limit = page?.limit ?? 100;
      const offset = page?.offset ?? 0;
      const { rows } = await pool.query(
        'SELECT *, COUNT(*) OVER() AS __total FROM knowledge_entries ORDER BY created_at DESC LIMIT $1 OFFSET $2',
        [limit, offset],
      );
      const total =
        (rows[0] as { __total?: string | number } | undefined)?.__total !== undefined
          ? Number((rows[0] as { __total: string | number }).__total)
          : rows.length;
      return {
        items: rows.map((row) => mapKnowledgeRow(row as Record<string, unknown>)),
        total,
      };
    },
  };
}
