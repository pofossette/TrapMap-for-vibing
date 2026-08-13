import type { CandidateCorpusReadPort } from '@trapmap/contracts';

interface Queryable {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

async function listApproved<T>(
  pool: Queryable,
  teamId: string | null,
  query: string,
  map: (row: Record<string, unknown>) => T,
): Promise<T[]> {
  const { rows } = await pool.query(query, [teamId]);
  return rows.map(map);
}

export function createCandidateCorpusPgReadPort(pool: Queryable): CandidateCorpusReadPort {
  return {
    async listApprovedTraps(teamId) {
      return listApproved(
        pool,
        teamId,
        `SELECT id, team_id, shortcut, detail, labels FROM knowledge_entries
         WHERE lifecycle_state = 'approved' AND ($1::text IS NULL OR team_id = $1)`,
        (row) => ({
          id: String(row.id),
          teamId: (row.team_id as string | null) ?? null,
          shortcut: String(row.shortcut),
          detail: String(row.detail),
          labels: Array.isArray(row.labels) ? row.labels.map(String) : [],
        }),
      );
    },
    async listApprovedSkills(teamId) {
      return listApproved(
        pool,
        teamId,
        `SELECT id, team_id, title, metadata, labels FROM skill_artifacts
         WHERE lifecycle_state = 'approved' AND ($1::text IS NULL OR team_id = $1)`,
        (row) => ({
          id: String(row.id),
          teamId: (row.team_id as string | null) ?? null,
          title: String(row.title),
          summary:
            row.metadata &&
            typeof row.metadata === 'object' &&
            typeof (row.metadata as Record<string, unknown>).summary === 'string'
              ? ((row.metadata as Record<string, unknown>).summary as string)
              : '',
          keywords: Array.isArray(row.labels) ? row.labels.map(String) : [],
        }),
      );
    },
  };
}
