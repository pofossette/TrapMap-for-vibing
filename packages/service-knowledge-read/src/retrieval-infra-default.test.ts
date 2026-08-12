import { describe, expect, it } from 'vitest';

import { createDefaultKnowledgeReadRetrievalInfra } from './retrieval-infra-default.js';
import type { MergedCandidate } from './retrieval-types.js';
import type { Pool } from 'pg';
import type { KnowledgeRecord } from './store.js';

function createEntry(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  return {
    id: 'entry-1',
    shortcut: 'entry',
    detail: 'detail',
    labels: [],
    teamId: null,
    scope: 'global',
    requiredLevel: 0,
    lifecycleState: 'approved',
    decayMeta: null,
    history: [],
    ...overrides,
  } as KnowledgeRecord;
}

function createCapturingPool() {
  let captured: { sql: string; params: unknown[] } | undefined;
  return {
    pool: {
      async query(sql: string, params: unknown[]) {
        captured = { sql, params };
        return { rows: [] };
      },
    },
    captured: () => captured,
  };
}

function expectTeamFilteredQuery(
  query: { sql: string; params: unknown[] } | undefined,
  conditions: RegExp[],
  params: unknown[],
) {
  expect(query?.sql).toMatch(/team_id IS NULL OR .*team_id = \$1/);
  for (const condition of conditions) {
    expect(query?.sql).toMatch(condition);
  }
  expect(query?.params).toEqual(params);
}

describe('default knowledge-read retrieval infra', () => {
  it('preserves stale-entry penalties while reranking', () => {
    const infra = createDefaultKnowledgeReadRetrievalInfra();
    const candidate: MergedCandidate = {
      entry: createEntry({ decayMeta: { decayState: 'stale' } as KnowledgeRecord['decayMeta'] }),
      semanticScore: 0.6,
      keywordScore: 0.6,
      graphScore: 0,
      channelScores: { semantic: 0.6, keyword: 0.6 },
      combinedScore: 0.6,
      tokenMatches: [{ token: 'entry', fields: ['shortcut'] }],
      channels: ['semantic', 'keyword'],
      preRerankScore: 0.6,
      finalScore: 0.6,
    };

    const [reranked] = infra.scoring.rerankCandidates([candidate], ['entry'], {
      maxCandidates: 1,
      freshnessConfig: infra.scoring.freshnessConfig,
    });

    expect(reranked?.combinedScore).toBeCloseTo(0.75);
    expect(reranked?.preRerankScore).toBe(0.6);
    expect(reranked?.finalScore).toBeCloseTo(0.75);
  });

  it('applies all vector filters in the PostgreSQL query', async () => {
    const infra = createDefaultKnowledgeReadRetrievalInfra();
    const query = createCapturingPool();

    await infra.pgRecall.vectorSimilaritySearch(query.pool as Pool, {
      queryVector: [1, 0],
      limit: 5,
      teamId: 'team-1',
      maxLevel: 3,
      scope: 'project',
      entryIds: ['entry-1'],
    });

    expectTeamFilteredQuery(
      query.captured(),
      [/scope = \$3/, /entry_id = ANY\(\$4\)/],
      ['team-1', 3, 'project', ['entry-1'], '[1,0]', 5],
    );
  });

  it('honors compatible version ranges and excluded boundary contexts', () => {
    const infra = createDefaultKnowledgeReadRetrievalInfra();
    const entry = createEntry({
      boundary: {
        context: ['production'],
        versions: [{ package: 'react', range: '^2.1.0' }],
        exclusions: [{ kind: 'context', description: 'not for staging environments' }],
      },
    });

    expect(
      infra.scoring.filterByBoundary([entry], {
        versions: [{ package: 'react', version: '2.2.0' }],
      }),
    ).toEqual([entry]);
    expect(infra.scoring.computeBoundaryScoreDelta(entry, { contexts: ['staging'] })).toBe(-0.15);
  });

  it('keeps team and scope filters in PostgreSQL keyword recall', async () => {
    const infra = createDefaultKnowledgeReadRetrievalInfra();
    const query = createCapturingPool();

    await infra.pgRecall.keywordRecall(
      query.pool as Pool,
      'deploy kubernetes',
      {
        teamId: 'team-1',
        securityLevel: 4,
        isSystemAdmin: false,
        scopes: ['project'],
      },
      5,
    );

    expectTeamFilteredQuery(
      query.captured(),
      [/required_level <= \$2/, /scope = ANY\(\$3::text\[\]\)/, /tokens && \$4::text\[\]/],
      ['team-1', 4, ['project'], ['deploy', 'kubernetes'], 10],
    );
  });
});
