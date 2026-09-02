import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

import {
  createExperienceGeneContentHash,
  createExperienceGeneIdempotencyKeyFromGene,
} from '@trapmap/backend-core';
import { createExperienceGeneFixture } from '@trapmap/backend-core/testing/index.js';
import { experienceGeneEventSchema, experienceGeneSchema } from '@trapmap/contracts';
import { PgExperienceGeneRepository } from '../src/experience-gene-repository.js';

type QueryHandler = (sql: string, params: unknown[]) => { rows: unknown[]; rowCount?: number };

function createQueryPool(handler: QueryHandler = () => ({ rows: [], rowCount: 1 })) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const pool = Object.assign(new Pool(), {
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });
      return handler(sql, params);
    },
  });
  return { pool, queries };
}

function validCandidate() {
  const base = createExperienceGeneFixture();
  const contentHash = createExperienceGeneContentHash(base);
  return experienceGeneSchema.parse({
    ...base,
    contentHash,
  });
}

function databaseRow(gene: ReturnType<typeof validCandidate>, overrides = {}) {
  return {
    id: gene.geneId,
    schema_version: gene.schemaVersion,
    status: gene.status,
    title: gene.title,
    signals_match: gene.signalsMatch,
    summary: gene.summary,
    strategy: gene.strategy,
    avoid: gene.avoid,
    constraints: gene.constraints,
    validation: gene.validation,
    labels: gene.labels,
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
    content_hash: gene.contentHash,
    parent_event_id: gene.lineage.parentEventId,
    prior_gene_hash: gene.lineage.priorGeneHash,
    generator_kind: gene.generator.kind,
    generator_model: gene.generator.model,
    prompt_version: gene.generator.promptVersion,
    index_status: gene.indexing.status,
    index_last_error: gene.indexing.lastError,
    created_at: new Date(gene.createdAt),
    updated_at: new Date(gene.updatedAt),
    ...overrides,
  };
}

describe('PostgreSQL experience gene repository', () => {
  it('saves candidates and the derived event in one transaction', async () => {
    const gene = validCandidate();
    const { pool, queries } = createQueryPool((sql) =>
      sql.includes('INSERT INTO experience_genes')
        ? { rows: [databaseRow(gene)], rowCount: 1 }
        : { rows: [], rowCount: 1 },
    );
    const repository = new PgExperienceGeneRepository({ pool });

    await expect(repository.saveCandidate(gene)).resolves.toEqual(gene);

    expect(queries.map(({ sql }) => sql)).toEqual([
      'BEGIN',
      expect.stringContaining('INSERT INTO experience_genes'),
      expect.stringContaining('INSERT INTO experience_gene_events'),
      expect.stringContaining('INSERT INTO experience_gene_embeddings'),
      expect.stringContaining('UPDATE experience_gene_embeddings'),
      'COMMIT',
    ]);
    const geneInsert = queries[1]!;
    const expectedKey = createExperienceGeneIdempotencyKeyFromGene(gene);
    expect(geneInsert.params.at(-1)).toBe(expectedKey);
    expect(queries[3]!.sql).toContain("'pending'");
    expect(queries[4]!.sql).toContain("'pending'");
  });

  it('keeps governance filtering inside every read statement', async () => {
    const { pool, queries } = createQueryPool();
    const repository = new PgExperienceGeneRepository({ pool });

    await repository.getById('gene-1', { teamId: 'team-1', maxRequiredLevel: 4 });
    await repository.listBySource(createExperienceGeneFixture().source, {
      teamId: null,
      maxRequiredLevel: 0,
    });

    expect(queries[0]?.sql).toContain('(team_id IS NULL OR team_id = $2)');
    expect(queries[0]?.sql).toContain('required_level <= $3');
    expect(queries[1]?.sql).toContain('team_id IS NULL');
    expect(queries[1]?.sql).toContain('required_level <= $5');
  });

  it('finds the nearest different-content projection above the duplicate threshold', async () => {
    const gene = validCandidate();
    const embedding = Array.from({ length: 384 }, (_, index) => (index === 0 ? 1 : 0));
    const duplicate = {
      gene_id: 'gene-existing',
      source_type: 'trap',
      source_id: 'entry-existing',
      cosine_similarity: 0.97,
    };
    const { pool, queries } = createQueryPool(() => ({ rows: [duplicate], rowCount: 1 }));

    await expect(
      new PgExperienceGeneRepository({ pool }).findDuplicateProjection(gene, embedding),
    ).resolves.toEqual({
      geneId: 'gene-existing',
      source: { kind: 'trap', sourceId: 'entry-existing' },
      similarity: 0.97,
    });

    const query = queries[0]!;
    expect(query.sql).toContain('JOIN experience_gene_embeddings');
    expect(query.sql).toContain('<=>');
    expect(query.sql).toContain('e.content_hash <> $3');
    expect(query.sql).toContain("e.status IN ('candidate', 'validated', 'solidified')");
    expect(query.sql).toContain('ORDER BY cosine_similarity DESC');
    expect(query.sql).toContain('LIMIT 1');
    expect(query.params[1]).toBe(`[${embedding.join(',')}]`);
  });

  it('validates a candidate atomically and appends its event', async () => {
    const gene = validCandidate();
    const validatedRow = databaseRow(gene, { status: 'validated' });
    const { pool, queries } = createQueryPool((sql) => {
      if (sql.includes('FOR UPDATE')) return { rows: [databaseRow(gene)], rowCount: 1 };
      if (sql.startsWith('UPDATE experience_genes')) return { rows: [validatedRow], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    const result = await new PgExperienceGeneRepository({ pool }).markValidated('gene-1', {
      valid: true,
      issues: [],
    });

    expect(result.status).toBe('validated');
    expect(queries[0]?.sql).toBe('BEGIN');
    expect(queries.at(-1)?.sql).toBe('COMMIT');
    expect(queries.some(({ sql }) => sql.includes('INSERT INTO experience_gene_events'))).toBe(
      true,
    );
  });

  it('solidifies only ready projections and writes the search document atomically', async () => {
    const gene = validCandidate();
    const solidRow = databaseRow(gene, { status: 'solidified', index_status: 'ready' });
    const { pool, queries } = createQueryPool((sql) => {
      if (sql.includes('FOR UPDATE')) {
        return {
          rows: [databaseRow(gene, { status: 'validated', index_status: 'ready' })],
          rowCount: 1,
        };
      }
      if (sql.startsWith('UPDATE experience_genes')) return { rows: [solidRow], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    const result = await new PgExperienceGeneRepository({ pool }).solidify('gene-1');

    expect(result.status).toBe('solidified');
    expect(queries.some(({ sql }) => sql.includes('UPDATE experience_gene_embeddings'))).toBe(true);
    expect(queries.some(({ sql }) => sql.includes('INSERT INTO domain_event_outbox'))).toBe(true);
    expect(queries[0]?.sql).toBe('BEGIN');
    expect(queries.at(-1)?.sql).toBe('COMMIT');
  });

  it('readies both projections for an embedding retry from validated state', async () => {
    const gene = validCandidate();
    const readyRow = databaseRow(gene, { status: 'validated', index_status: 'ready' });
    const { pool, queries } = createQueryPool((sql) => {
      if (sql.includes('FOR UPDATE')) {
        return {
          rows: [databaseRow(gene, { status: 'validated', index_status: 'failed' })],
          rowCount: 1,
        };
      }
      if (sql.startsWith('UPDATE experience_genes')) return { rows: [readyRow], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const embedding = Array.from({ length: 384 }, (_, index) => (index === 0 ? 0.5 : 0));

    await expect(
      new PgExperienceGeneRepository({ pool }).prepareProjections(
        'gene-1',
        embedding,
        'provider-model-v1',
      ),
    ).resolves.toEqual(
      experienceGeneSchema.parse({
        ...gene,
        status: 'validated',
        indexing: { status: 'ready', lastError: null, updatedAt: gene.indexing.updatedAt },
      }),
    );

    expect(queries.filter(({ sql }) => sql.includes('UPDATE experience_gene_'))).toHaveLength(1); // embeddings + genes (search merged)
    expect(
      queries.find(({ sql }) => sql.includes('UPDATE experience_gene_embeddings'))?.params,
    ).toEqual(['gene-1', gene.contentHash, `[${embedding.join(',')}]`, 'provider-model-v1']);
  });

  it('records an index-failed event while retaining validated lifecycle state', async () => {
    const gene = validCandidate();
    const failedRow = databaseRow(gene, {
      status: 'validated',
      index_status: 'failed',
      index_last_error: 'embedding unavailable',
    });
    const { pool, queries } = createQueryPool((sql) => {
      if (sql.startsWith('UPDATE experience_genes')) return { rows: [failedRow], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    const result = await new PgExperienceGeneRepository({ pool }).markIndexStatus(
      'gene-1',
      'failed',
      'embedding unavailable',
    );

    expect(result.indexing.status).toBe('failed');
    expect(result.status).toBe('validated');
    expect(
      queries.filter(({ sql }) => sql.includes('experience_gene')).map(({ sql }) => sql),
    ).toEqual([
      expect.stringContaining('UPDATE experience_gene_embeddings'),

      expect.stringContaining('UPDATE experience_genes'),
      expect.stringContaining('INSERT INTO experience_gene_events'),
    ]);
  });

  it('returns an existing identical candidate without updating its aggregate', async () => {
    const gene = validCandidate();
    const existingRow = databaseRow(gene);
    const { pool, queries } = createQueryPool((sql) => {
      if (sql.includes('ON CONFLICT (idempotency_key)')) return { rows: [], rowCount: 0 };
      if (sql.includes('idempotency_key = $1')) return { rows: [existingRow], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });

    await expect(new PgExperienceGeneRepository({ pool }).saveCandidate(gene)).resolves.toEqual(
      gene,
    );

    expect(queries.some(({ sql }) => sql.includes('DO NOTHING'))).toBe(true);
    expect(queries.some(({ sql }) => sql.includes('UPDATE\n           title'))).toBe(false);
    expect(
      queries.filter(({ sql }) => sql.includes('INSERT INTO experience_gene_events')),
    ).toHaveLength(0);
  });

  it('marks every active revision stale and appends one event per Gene', async () => {
    const gene = validCandidate();
    const { pool, queries } = createQueryPool((sql) => {
      if (sql.includes('FOR UPDATE')) {
        return { rows: [{ id: gene.geneId, content_hash: gene.contentHash }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    });

    await expect(new PgExperienceGeneRepository({ pool }).markStale(gene.source)).resolves.toBe(1);

    expect(queries.filter(({ sql }) => sql.includes("status = 'stale'"))).toHaveLength(1);
    expect(queries.filter(({ sql }) => sql.includes("'staled'"))).toHaveLength(1);
  });

  it('marks every active Gene for a source stale without requiring old provenance', async () => {
    const gene = validCandidate();
    const rows = [
      { id: `${gene.geneId}-1`, content_hash: gene.contentHash },
      { id: `${gene.geneId}-2`, content_hash: gene.contentHash },
    ];
    const { pool, queries } = createQueryPool((sql) => {
      if (sql.includes('FOR UPDATE')) return { rows, rowCount: rows.length };
      return { rows: [], rowCount: 1 };
    });

    await expect(
      new PgExperienceGeneRepository({ pool }).markStaleForSource(
        { kind: gene.source.kind, sourceId: gene.source.sourceId },
        'source-revision',
      ),
    ).resolves.toBe(2);

    const select = queries.find(({ sql }) => sql.includes('FOR UPDATE'));
    expect(select?.sql).toContain('source_type = $1 AND source_id = $2');
    const whereClause = select?.sql.slice(select.sql.indexOf('WHERE')) ?? '';
    expect(whereClause).not.toContain('source_revision');
    expect(whereClause).not.toContain('source_hash');
    expect(queries.filter(({ sql }) => sql.includes("status = 'stale'"))).toHaveLength(2);
    expect(queries.filter(({ params }) => params.includes('source-revision'))).toHaveLength(2);
  });

  it('persists rejected validator reports without mutating an aggregate', async () => {
    const gene = validCandidate();
    const event = experienceGeneEventSchema.parse({
      id: 'rejected-1',
      type: 'rejected',
      geneId: 'candidate-gene-1',
      source: gene.source,
      actor: { kind: 'agent', id: 'deriver-1' },
      validatorSummary: { valid: false, issueCodes: ['summary-empty'] },
      reasonClass: 'schema-validation',
      payloadSnapshotHash: 'c'.repeat(64),
      payload: {
        validatorReport: {
          valid: false,
          issues: [{ code: 'summary-empty', field: 'summary', message: 'Summary is required' }],
        },
      },
      createdAt: '2026-08-25T00:00:00.000Z',
    });
    const { pool, queries } = createQueryPool();

    await new PgExperienceGeneRepository({ pool }).saveRejectedCandidate(event);

    expect(queries.map(({ sql }) => sql)).toEqual([
      'BEGIN',
      expect.stringContaining('INSERT INTO experience_gene_events'),
      'COMMIT',
    ]);
    expect(queries.some(({ sql }) => sql.includes('UPDATE experience_genes'))).toBe(false);
  });
});
