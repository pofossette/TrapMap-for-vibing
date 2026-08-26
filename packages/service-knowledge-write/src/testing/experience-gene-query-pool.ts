import { Pool } from 'pg';

type Row = Record<string, unknown>;

export function createExperienceGeneQueryPool(
  rowsByTable: Array<{ match: RegExp; rows: Row[] }> = [],
) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const pool = Object.assign(new Pool(), {
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });
      const matched = rowsByTable.find((entry) => entry.match.test(sql));
      return { rows: matched?.rows ?? [], rowCount: matched?.rows.length ?? 0 };
    },
  });
  return { pool, queries };
}
