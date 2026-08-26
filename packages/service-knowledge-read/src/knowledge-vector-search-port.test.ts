import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import { createKnowledgeEmbeddingsVectorSearchPort } from './knowledge-vector-search-port.js';

describe('knowledge embedding vector search port', () => {
  it('preserves the existing governance-filtered pgvector SQL semantics', async () => {
    let captured: { sql: string; params: unknown[] } | undefined;
    const pool = Object.assign(new Pool(), {
      async query(sql: string, params: unknown[]) {
        captured = { sql, params };
        return {
          rows: [
            {
              entry_id: 'entry-2',
              similarity: 1.25,
              shortcut: null,
              labels: [],
              scope: 'project',
              required_level: 1,
            },
          ],
        };
      },
    });

    await expect(
      createKnowledgeEmbeddingsVectorSearchPort(pool).search(
        [1, 0],
        {
          teamId: 'team-1',
          maxRequiredLevel: 3,
          scopes: ['global', 'project'],
          sourceIds: ['entry-1', 'entry-2'],
        },
        5,
      ),
    ).resolves.toEqual([
      {
        sourceId: 'entry-2',
        similarity: 1,
        metadata: {
          shortcut: 'entry-2',
          labels: [],
          scope: 'project',
          requiredLevel: 1,
        },
      },
    ]);

    expect(captured?.sql).toContain("ke.status = 'synced'");
    expect(captured?.sql).toContain('(ke.team_id IS NULL OR ke.team_id = $1)');
    expect(captured?.sql).toContain('ke.required_level <= $2');
    expect(captured?.sql).toContain('ke.scope = ANY($3::text[])');
    expect(captured?.sql).toContain('ke.entry_id = ANY($4)');
    expect(captured?.params).toEqual([
      'team-1',
      3,
      ['global', 'project'],
      ['entry-1', 'entry-2'],
      '[1,0]',
      5,
    ]);
    expect(captured?.sql).toContain('ORDER BY ke.vector <=> $5::vector');
    expect(captured?.sql).toContain('LIMIT $6');
  });
});
