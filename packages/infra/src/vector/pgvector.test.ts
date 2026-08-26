import { describe, expect, it } from 'vitest';

import {
  appendExperienceGeneGovernanceFilters,
  appendScopeFilter,
  appendTeamFilter,
  buildGeneSearchDocument,
  clampSimilarity,
  formatVectorLiteral,
  vectorDistanceExpression,
  vectorSimilarityExpression,
} from './pgvector.js';

describe('infra vector helpers', () => {
  it('formats vector literal', () => {
    expect(formatVectorLiteral([1, 2, 3])).toBe('[1,2,3]');
  });

  it('clamps similarity', () => {
    expect(clampSimilarity(1.5)).toBe(1);
    expect(clampSimilarity(-0.2)).toBe(0);
    expect(clampSimilarity(0.42)).toBe(0.42);
  });

  it('builds distance/similarity expressions', () => {
    expect(vectorDistanceExpression('ke.vector', 2)).toBe('ke.vector <=> $2::vector');
    expect(vectorSimilarityExpression('p.embedding', 3)).toBe('1 - (p.embedding <=> $3::vector)');
  });

  it('appends team filter', () => {
    const cond: string[] = [];
    const params: unknown[] = [];
    appendTeamFilter(cond, params, null, 'ke.team_id');
    expect(cond).toEqual(['ke.team_id IS NULL']);
    const cond2: string[] = [];
    const params2: unknown[] = [];
    appendTeamFilter(cond2, params2, 'team-1', 'ke.team_id');
    expect(params2).toEqual(['team-1']);
    expect(cond2[0]).toContain('team_id');
  });

  it('appends scope filter', () => {
    const cond: string[] = [];
    const params: unknown[] = [];
    appendScopeFilter(cond, params, ['global'], 'scope');
    expect(cond[0]).toBe('scope = $1');
    expect(params).toEqual(['global']);
  });

  it('appends experience gene governance filters', () => {
    const cond: string[] = [];
    const params: unknown[] = [];
    appendExperienceGeneGovernanceFilters(
      cond,
      params,
      { teamId: null, maxRequiredLevel: 2 },
      { labels: [], scopes: [] },
      'g',
    );
    expect(cond).toContain('g.team_id IS NULL');
    expect(cond).toContain('g.required_level <= $1');
  });

  it('builds gene search document', () => {
    expect(
      buildGeneSearchDocument({
        title: 't',
        summary: 's',
        strategy: ['a'],
        avoid: ['b'],
        validation: ['c'],
      }),
    ).toBe('t\ns\na\nb\nc');
  });
});
