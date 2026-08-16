/**
 * knowledge-read host ports (Phase 3 shared/ports retirement).
 *
 * The distributed knowledge-read service owns its PostgreSQL read-model
 * projection and ILIKE retrieval query. These were previously bundled into
 * the shared simplified `shared/ports.ts`; they now live next to the
 * knowledge-read service so the shared bundle (taskQueue/outbox simplified
 * implementations) can be retired. Behavior is unchanged.
 *
 * Design note (D5/D6): the ILIKE retrieval here is the legacy read seam; the
 * complete retrieval-engine pipeline convergence is a Phase 4 follow-up, so
 * this host keeps behaviour identical to the pre-convergence path.
 */
import type {
  KnowledgeEntryRecord,
  KnowledgeReadProjectionPort,
  RetrievalQueryPort,
} from '@trapmap/backend-core';
import type { LifecycleState } from '@trapmap/contracts';

/** Minimal pool seam used by the knowledge-read pg ports (query-only). */
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
  listByFilter(filter: Record<string, never>): Promise<KnowledgeEntryRecord[]>;
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
    async listByFilter(_filter: Record<string, never>) {
      const { rows } = await pool.query(
        'SELECT * FROM knowledge_entries ORDER BY created_at DESC LIMIT 100',
      );
      return rows.map((row) => mapKnowledgeRow(row as Record<string, unknown>));
    },
  };
}

export function createPgRetrievalQuery(pool: KnowledgeReadPool): RetrievalQueryPort {
  return {
    async search(params) {
      const limit = params.limit ?? 10;
      const conditions: string[] = ["lifecycle_state = 'approved'"];
      const queryParams: unknown[] = [];
      let paramIndex = 1;

      if (params.teamId) {
        conditions.push(`team_id = $${paramIndex++}`);
        queryParams.push(params.teamId);
      }

      conditions.push(`(content ILIKE $${paramIndex} OR title ILIKE $${paramIndex})`);
      queryParams.push(`%${params.query}%`);
      paramIndex++;

      const whereClause = conditions.join(' AND ');
      const { rows } = await pool.query(
        `SELECT id, content, title FROM knowledge_entries
         WHERE ${whereClause}
         LIMIT $${paramIndex}`,
        [...queryParams, limit],
      );

      return {
        results: (rows as Array<{ id: string; content: string; title: string }>).map((r) => ({
          entryId: r.id,
          score: 1.0,
          snippet: r.content.slice(0, 200),
          metadata: { title: r.title },
        })),
      };
    },
  };
}
