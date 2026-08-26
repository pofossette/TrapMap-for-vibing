import { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { createExperienceGeneFixture } from '@trapmap/backend-core/testing/index.js';

import { createPgExperienceGeneSearchPort } from './experience-gene-retrieval.js';

const gene = createExperienceGeneFixture();

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: gene.geneId,
    schema_version: gene.schemaVersion,
    status: 'solidified',
    title: gene.title,
    signals_match: JSON.stringify(gene.signalsMatch),
    summary: gene.summary,
    strategy: JSON.stringify(gene.strategy),
    avoid: JSON.stringify(gene.avoid),
    constraints: JSON.stringify(gene.constraints),
    validation: JSON.stringify(['Verified against a reproduced failure']),
    labels: JSON.stringify(gene.labels),
    scope: gene.scope,
    team_id: gene.teamId,
    required_level: gene.requiredLevel,
    source_type: gene.source.kind,
    source_id: gene.source.sourceId,
    source_revision: gene.source.sourceRevision,
    source_hash: gene.source.sourceHash,
    artifact_id: gene.source.artifactId,
    capsule_id: gene.source.capsuleId,
    artifact_revision: gene.source.artifactRevision,
    derivation_unit_id: gene.lineage.derivationUnitId,
    parent_event_id: gene.lineage.parentEventId,
    prior_gene_hash: gene.lineage.priorGeneHash,
    generator_kind: gene.generator.kind,
    generator_model: gene.generator.model,
    prompt_version: gene.generator.promptVersion,
    index_status: 'ready',
    index_last_error: null,
    content_hash: gene.contentHash,
    created_at: new Date(gene.createdAt),
    updated_at: new Date(gene.updatedAt),
    semantic_score: 0.9,
    keyword_score: 0.4,
    ...overrides,
  };
}

function poolWithRows(rows: Record<string, unknown>[]) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const pool = Object.assign(new Pool(), {
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });
      return { rows };
    },
  });
  return { pool, queries };
}

describe('PostgreSQL experience gene search port', () => {
  it('merges governed keyword and vector candidates through the pure selector', async () => {
    const { pool, queries } = poolWithRows([row()]);
    const embed = vi.fn(async () => Array.from({ length: 384 }, (_, index) => (index ? 0 : 1)));
    const port = createPgExperienceGeneSearchPort({ pool, embed });

    const result = await port.searchGenes(
      {
        seed: 'queue retry storm',
        filters: { labels: ['queue'], scopes: ['project'] },
        maxResults: 1,
        includeActivationHints: false,
      },
      { teamId: 'team-1', maxRequiredLevel: 3 },
    );

    expect(embed).toHaveBeenCalledWith('queue retry storm');
    expect(result.primaryGene?.gene.geneId).toBe(gene.geneId);
    expect(result.primaryGene?.score).toBeGreaterThan(0);
    expect(result.primaryGene?.sourceCitation).toEqual({
      kind: gene.source.kind,
      sourceId: gene.source.sourceId,
      sourceRevision: gene.source.sourceRevision,
      artifactId: gene.source.artifactId,
      capsuleId: gene.source.capsuleId,
    });
    expect(result.routingTrace?.channelsUsed).toEqual(['keyword', 'semantic']);

    const keywordQuery = queries.find(({ sql }) => sql.includes('ts_rank'))!;
    const vectorQuery = queries.find(({ sql }) => sql.includes('<=>'))!;
    expect(keywordQuery.params[0]).toBe('queue retry storm');
    expect(keywordQuery.sql).toContain("g.status = 'solidified'");
    expect(keywordQuery.sql).toContain('(g.team_id IS NULL OR g.team_id = $2)');
    expect(keywordQuery.sql).toContain('g.required_level <= $3');
    expect(keywordQuery.sql).toContain('g.scope = ANY($4::text[])');
    expect(keywordQuery.sql).toContain('g.labels @> $5::jsonb');
    expect(keywordQuery.params[3]).toEqual(['project']);
    expect(keywordQuery.params[4]).toBe(JSON.stringify(['queue']));
    expect(vectorQuery.sql).toContain("p.status = 'ready'");
  });

  it('returns an empty canonical envelope when neither channel recalls a Gene', async () => {
    const { pool } = poolWithRows([]);
    const result = await createPgExperienceGeneSearchPort({
      pool,
      embed: async () => Array.from({ length: 384 }, () => 0),
    }).searchGenes(
      {
        seed: 'unknown',
        filters: { labels: [], scopes: [] },
        maxResults: 1,
        includeActivationHints: false,
      },
      { teamId: null, maxRequiredLevel: 1 },
    );

    expect(result.primaryGene).toBeNull();
    expect(result.supplementaryAvoid).toEqual([]);
  });
});
