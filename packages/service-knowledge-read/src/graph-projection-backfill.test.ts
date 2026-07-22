import { describe, expect, it, vi } from 'vitest';

import { createKnowledgeReadGraphProjectionRebuilder } from './graph-projection-backfill.js';

function createTransactionPool(respond: (sql: string) => { rows: unknown[] }) {
  const query = vi.fn(async (sql: string) => respond(sql));
  const client = { query, release: vi.fn() };
  return { client, pool: { connect: vi.fn(async () => client) } };
}

describe('knowledge-read graph projection backfill', () => {
  it('rebuilds graph documents from authoritative knowledge and artifact rows', async () => {
    const { client, pool } = createTransactionPool((sql) => {
      if (sql.includes('FROM knowledge_entries')) {
        return {
          rows: [
            {
              id: 'knowledge-1',
              team_id: null,
              scope: 'global',
              required_level: 2,
              shortcut: 'Avoid unbounded retries',
              detail: 'Use bounded retry policies.',
              updated_at: '2026-07-22T00:00:00.000Z',
              revision_no: 3,
            },
          ],
        };
      }
      if (sql.includes('FROM skill_artifacts')) {
        return {
          rows: [
            {
              id: 'skill-1',
              team_id: 'team-1',
              scope: 'project',
              required_level: 4,
              title: 'Retry policy skill',
              metadata: { summary: 'Reusable retry-policy guidance.' },
              updated_at: '2026-07-22T00:00:00.000Z',
              revision_no: 2,
            },
          ],
        };
      }
      if (sql.includes('COUNT(*)')) return { rows: [{ count: '2' }] };
      return { rows: [] };
    });
    const rebuild = createKnowledgeReadGraphProjectionRebuilder(pool as never);

    await expect(rebuild()).resolves.toEqual({ sourceCount: 2, destinationCount: 2 });

    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('FROM knowledge_entries'));
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('FROM skill_artifacts'));
    expect(client.query).not.toHaveBeenCalledWith(expect.stringContaining('store_snapshot'));
    const inserts = client.query.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO graph_index_documents'),
    );
    expect(inserts).toHaveLength(2);
    expect(inserts.map(([, params]) => params?.[0])).toEqual([
      'graphdoc_trap_knowledge-1_r3',
      'graphdoc_skill_skill-1_r2',
    ]);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rolls back when graph document readback count differs from authoritative sources', async () => {
    const { client, pool } = createTransactionPool((sql) => {
      if (sql.includes('FROM knowledge_entries')) return { rows: [{ id: 'knowledge-1' }] };
      if (sql.includes('FROM skill_artifacts')) return { rows: [] };
      if (sql.includes('COUNT(*)')) return { rows: [{ count: '0' }] };
      return { rows: [] };
    });
    const rebuild = createKnowledgeReadGraphProjectionRebuilder(pool as never);

    await expect(rebuild()).rejects.toThrow(
      'Graph projection readback count mismatch: expected 1, got 0',
    );

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query).not.toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledOnce();
  });
});
