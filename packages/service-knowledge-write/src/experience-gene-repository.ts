import {
  type ExperienceGeneAccessContext,
  type ExperienceGeneDuplicateProjection,
  type ExperienceGeneDuplicateProjectionPort,
  type ExperienceGeneReadPort,
  type ExperienceGeneWritePort,
  createExperienceGeneContentHash,
  createExperienceGeneIdempotencyKeyFromGene,
} from '@trapmap/backend-core';
import {
  EXPERIENCE_GENE_SOLIDIFIED_OUTBOX_EVENT,
  type ExperienceGene,
  type ExperienceGeneEvent,
  type ExperienceGeneEventPayload,
  type ExperienceGeneValidationReport,
  experienceGeneEventSchema,
  experienceGeneSchema,
  experienceGeneSolidifiedOutboxPayloadSchema,
} from '@trapmap/contracts';
import {
  buildGeneSearchDocument,
  createFallbackEmbedding,
  formatVectorLiteral,
} from '@trapmap/infra';
import { prefixedId } from '@trapmap/lib';

type GeneRow = {
  id: string;
  schema_version: string;
  status: ExperienceGene['status'];
  title: string;
  signals_match: string[];
  summary: string;
  strategy: string[];
  avoid: string[];
  constraints: string[];
  validation: string[];
  labels: string[];
  scope: ExperienceGene['scope'];
  team_id: string | null;
  required_level: number;
  source_type: ExperienceGene['source']['kind'];
  source_id: string;
  source_revision: number;
  source_hash: string;
  artifact_id: string | null;
  capsule_id: string | null;
  artifact_revision: number | null;
  derivation_unit_id: string;
  content_hash: string;
  parent_event_id: string | null;
  prior_gene_hash: string | null;
  generator_kind: ExperienceGene['generator']['kind'];
  generator_model: string | null;
  prompt_version: string;
  index_status: ExperienceGene['indexing']['status'];
  index_last_error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type ExperienceGeneQueryable = {
  query<T extends Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
};

const GENE_COLUMNS = `id, schema_version, status, title, signals_match, summary, strategy,
  avoid, "constraints", validation, labels, scope, team_id, required_level,
  source_type, source_id, source_revision, source_hash, artifact_id, capsule_id,
  artifact_revision, derivation_unit_id, content_hash, parent_event_id, prior_gene_hash,
  generator_kind, generator_model, prompt_version, index_status, index_last_error,
  created_at, updated_at`;

type LifecycleEventDetails = {
  actor: { kind: 'system' | 'user' | 'agent'; id: string | null };
  validatorSummary: { valid: boolean; issueCodes: string[] };
  reasonClass: string | null;
  payloadSnapshotHash: string;
  payload: ExperienceGeneEventPayload;
};

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

const searchDocument = buildGeneSearchDocument;

function vectorLiteral(vector: number[]): string {
  return formatVectorLiteral(vector);
}

const FALLBACK_EMBEDDING_MODEL_VERSION = 'experience-gene-fallback-v1';

function mapGene(row: GeneRow): ExperienceGene {
  return experienceGeneSchema.parse({
    geneId: row.id,
    schemaVersion: row.schema_version,
    status: row.status,
    title: row.title,
    signalsMatch: strings(row.signals_match),
    summary: row.summary,
    strategy: strings(row.strategy),
    avoid: strings(row.avoid),
    constraints: strings(row.constraints),
    validation: strings(row.validation),
    labels: strings(row.labels),
    scope: row.scope,
    teamId: row.team_id,
    requiredLevel: row.required_level,
    source: {
      kind: row.source_type,
      sourceId: row.source_id,
      sourceRevision: row.source_revision,
      sourceHash: row.source_hash,
      artifactId: row.artifact_id,
      capsuleId: row.capsule_id,
      artifactRevision: row.artifact_revision,
    },
    lineage: {
      derivationUnitId: row.derivation_unit_id,
      parentEventId: row.parent_event_id,
      promptVersion: row.prompt_version,
      priorGeneHash: row.prior_gene_hash,
    },
    generator: {
      kind: row.generator_kind,
      model: row.generator_model,
      promptVersion: row.prompt_version,
    },
    indexing: {
      status: row.index_status,
      lastError: row.index_last_error,
      updatedAt: iso(row.updated_at),
    },
    contentHash: row.content_hash,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  });
}

export class PgExperienceGeneRepository
  implements ExperienceGeneWritePort, ExperienceGeneReadPort, ExperienceGeneDuplicateProjectionPort
{
  private readonly pool: ExperienceGeneQueryable;

  constructor(config: { pool: ExperienceGeneQueryable }) {
    this.pool = config.pool;
  }

  async saveCandidate(gene: ExperienceGene): Promise<ExperienceGene> {
    if (gene.contentHash !== createExperienceGeneContentHash(gene)) {
      throw new Error('experience gene content hash mismatch');
    }

    return this.transaction(async () => {
      const inserted = await this.pool.query<GeneRow>(
        `INSERT INTO experience_genes (${GENE_COLUMNS}, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
                 $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)
         ON CONFLICT (idempotency_key) WHERE status IN ('candidate','validated','solidified')
         DO NOTHING RETURNING ${GENE_COLUMNS}`,
        [
          gene.geneId,
          gene.schemaVersion,
          gene.status,
          gene.title,
          JSON.stringify(gene.signalsMatch),
          gene.summary,
          JSON.stringify(gene.strategy),
          JSON.stringify(gene.avoid),
          JSON.stringify(gene.constraints),
          JSON.stringify(gene.validation),
          JSON.stringify(gene.labels),
          gene.scope,
          gene.teamId,
          gene.requiredLevel,
          gene.source.kind,
          gene.source.sourceId,
          gene.source.sourceRevision,
          gene.source.sourceHash,
          gene.source.artifactId,
          gene.source.capsuleId,
          gene.source.artifactRevision,
          gene.lineage.derivationUnitId,
          gene.contentHash,
          gene.lineage.parentEventId,
          gene.lineage.priorGeneHash,
          gene.generator.kind,
          gene.generator.model,
          gene.generator.promptVersion,
          gene.indexing.status,
          gene.indexing.lastError,
          gene.createdAt,
          gene.updatedAt,
          this.idempotencyKey(gene),
        ],
      );
      const insertedRow = inserted.rows[0];
      if (insertedRow) {
        await this.insertEvent(gene, 'derived', {
          actor: { kind: 'system', id: null },
          validatorSummary: { valid: true, issueCodes: [] },
          reasonClass: null,
          payloadSnapshotHash: gene.contentHash,
          payload: {},
        });
        const embedding = createFallbackEmbedding(searchDocument(gene));
        await this.pool.query(
          `INSERT INTO experience_gene_embeddings
             (gene_id,content_hash,embedding,embedding_model_version,status,last_error,updated_at)
           VALUES ($1,$2,$3::vector,$4,'pending',NULL,now())
           ON CONFLICT (gene_id) DO UPDATE SET
             content_hash = EXCLUDED.content_hash, embedding = EXCLUDED.embedding,
             embedding_model_version = EXCLUDED.embedding_model_version, status = 'pending',
             last_error = NULL, updated_at = now()`,
          [
            gene.geneId,
            gene.contentHash,
            vectorLiteral(embedding),
            FALLBACK_EMBEDDING_MODEL_VERSION,
          ],
        );
        await this.pool.query(
          `UPDATE experience_gene_embeddings SET document = $2, labels = $3, status = 'pending', last_error = NULL, updated_at = now() WHERE gene_id = $1`,
          [gene.geneId, searchDocument(gene), gene.labels],
        );
        return mapGene(insertedRow);
      }

      const existing = await this.pool.query<GeneRow>(
        `SELECT ${GENE_COLUMNS} FROM experience_genes
         WHERE idempotency_key = $1 AND status IN ('candidate','validated','solidified')
         ORDER BY updated_at DESC, id ASC LIMIT 1`,
        [this.idempotencyKey(gene)],
      );
      const row = existing.rows[0];
      if (!row) throw new Error(`experience gene candidate disappeared: ${gene.geneId}`);
      return mapGene(row);
    });
  }

  async findDuplicateProjection(
    gene: ExperienceGene,
    embedding: number[],
  ): Promise<ExperienceGeneDuplicateProjection | null> {
    const result = await this.pool.query<{
      gene_id: string;
      source_type: ExperienceGene['source']['kind'];
      source_id: string;
      cosine_similarity: number;
    }>(
      `SELECT e.id AS gene_id, e.source_type, e.source_id,
              1 - (p.embedding <=> $2::vector) AS cosine_similarity
       FROM experience_genes e
       JOIN experience_gene_embeddings p ON p.gene_id = e.id AND p.content_hash = e.content_hash
       WHERE p.status = 'ready'
         AND e.status IN ('candidate', 'validated', 'solidified')
         AND e.content_hash <> $3
         AND 1 - (p.embedding <=> $2::vector) >= 0.93
       ORDER BY cosine_similarity DESC, e.id ASC
       LIMIT 1`,
      [gene.geneId, `[${embedding.join(',')}]`, gene.contentHash],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      geneId: row.gene_id,
      source: { kind: row.source_type, sourceId: row.source_id },
      similarity: row.cosine_similarity,
    };
  }

  async prepareProjections(
    geneId: string,
    embedding: number[],
    modelVersion: string,
  ): Promise<ExperienceGene> {
    if (embedding.length !== 384 || embedding.some((value) => !Number.isFinite(value))) {
      throw new Error('experience gene embedding must contain 384 finite values');
    }

    return this.transaction(async () => {
      const current = await this.selectForUpdate(geneId);
      if (current.status !== 'validated') {
        throw new Error(`experience gene projections cannot be prepared from ${current.status}`);
      }

      const embeddingResult = await this.pool.query(
        `UPDATE experience_gene_embeddings
         SET content_hash = $2, embedding = $3::vector, embedding_model_version = $4,
             status = 'ready', last_error = NULL, updated_at = now()
         WHERE gene_id = $1`,
        [geneId, current.content_hash, vectorLiteral(embedding), modelVersion],
      );
      if (embeddingResult.rowCount !== 1) {
        throw new Error(`missing retry projection for experience gene: ${geneId}`);
      }
      const updated = await this.pool.query<GeneRow>(
        `UPDATE experience_genes SET index_status = 'ready', index_last_error = NULL,
           updated_at = now()
         WHERE id = $1 AND status = 'validated' RETURNING ${GENE_COLUMNS}`,
        [geneId],
      );
      const row = updated.rows[0];
      if (!row) throw new Error(`experience gene cannot ready projections: ${geneId}`);
      return mapGene(row);
    });
  }

  async markValidated(
    geneId: string,
    report: ExperienceGeneValidationReport,
  ): Promise<ExperienceGene> {
    if (!report.valid) throw new Error('validated gene requires a passing report');

    return this.transaction(async () => {
      const current = await this.selectForUpdate(geneId);
      if (current.status !== 'candidate') {
        throw new Error(`experience gene cannot be validated from ${current.status}`);
      }

      const updated = await this.updateStatus(geneId, 'validated', ['candidate']);
      await this.insertEvent(updated, 'validated', {
        actor: { kind: 'system', id: null },
        validatorSummary: {
          valid: true,
          issueCodes: report.issues.map((issue) => issue.code),
        },
        reasonClass: null,
        payloadSnapshotHash: updated.contentHash,
        payload: {},
      });
      return updated;
    });
  }

  async solidify(geneId: string): Promise<ExperienceGene> {
    return this.transaction(async () => {
      const current = await this.selectForUpdate(geneId);
      if (current.status !== 'validated') {
        throw new Error(`experience gene cannot solidify from ${current.status}`);
      }
      if (current.index_status !== 'ready') {
        throw new Error(`experience gene projections are not ready: ${geneId}`);
      }

      await this.pool.query(
        `UPDATE experience_gene_embeddings SET document = $2, labels = $3, status = 'ready', last_error = NULL, updated_at = now() WHERE gene_id = $1`,
        [geneId, searchDocument(current), current.labels],
      );

      const updated = await this.updateStatus(geneId, 'solidified', ['validated']);
      await this.insertEvent(updated, 'solidified', {
        actor: { kind: 'system', id: null },
        validatorSummary: { valid: true, issueCodes: [] },
        reasonClass: null,
        payloadSnapshotHash: updated.contentHash,
        payload: {},
      });
      const outboxPayload = experienceGeneSolidifiedOutboxPayloadSchema.parse({
        geneId,
        source: updated.source,
        contentHash: updated.contentHash,
        occurredAt: new Date().toISOString(),
      });
      await this.pool.query(
        `INSERT INTO domain_event_outbox
           (id, aggregate_type, aggregate_id, event_name, payload, status,
            available_at, attempts, created_at)
         VALUES ($1, 'experience-gene', $2, $3, $4, 'pending', NOW(), 0, NOW())`,
        [
          prefixedId('evt'),
          geneId,
          EXPERIENCE_GENE_SOLIDIFIED_OUTBOX_EVENT,
          JSON.stringify(outboxPayload),
        ],
      );
      return updated;
    });
  }

  async markIndexStatus(
    geneId: string,
    status: ExperienceGene['indexing']['status'],
    error?: string | undefined,
  ): Promise<ExperienceGene> {
    if (error !== undefined && (error.length === 0 || error.length > 500)) {
      throw new Error('invalid experience gene index error');
    }
    if (status === 'ready' && error !== undefined) {
      throw new Error('ready genes cannot have an index error');
    }

    return this.transaction(async () => {
      if (status !== 'pending') {
        const result = await this.pool.query(
          `UPDATE experience_gene_embeddings SET status = $2, last_error = $3, updated_at = now() WHERE gene_id = $1`,
          [geneId, status, error ?? null],
        );
        if (status === 'ready' && result.rowCount !== 1) {
          throw new Error(`missing ready projection in experience_gene_embeddings`);
        }
      }

      const updated = await this.pool.query<GeneRow>(
        `UPDATE experience_genes SET index_status = $2, index_last_error = $3, updated_at = now()
         WHERE id = $1 RETURNING ${GENE_COLUMNS}`,
        [geneId, status, error ?? null],
      );
      const row = updated.rows[0];
      if (!row) throw new Error(`experience gene not found: ${geneId}`);
      const mapped = mapGene(row);
      if (status === 'failed') {
        await this.insertEvent(mapped, 'index-failed', {
          actor: { kind: 'system', id: null },
          validatorSummary: { valid: false, issueCodes: ['projection-index'] },
          reasonClass: 'indexing',
          payloadSnapshotHash: mapped.contentHash,
          payload: {},
        });
      }
      return mapped;
    });
  }

  async markStale(source: ExperienceGene['source']): Promise<number> {
    return this.transaction(async () => {
      const selected = await this.pool.query<Pick<GeneRow, 'id' | 'content_hash'>>(
        `SELECT id, content_hash FROM experience_genes
         WHERE source_type = $1 AND source_id = $2 AND source_revision = $3 AND source_hash = $4
           AND status IN ('candidate','validated','solidified') FOR UPDATE`,
        [source.kind, source.sourceId, source.sourceRevision, source.sourceHash],
      );

      for (const row of selected.rows) {
        await this.pool.query(
          `UPDATE experience_genes SET status = 'stale', updated_at = now() WHERE id = $1`,
          [row.id],
        );
        await this.pool.query(
          `INSERT INTO experience_gene_events
             (id,gene_id,type,source_type,source_id,source_revision,source_hash,actor_kind,actor_id,
              validator_summary,reason_class,payload_snapshot_hash,payload,created_at)
           VALUES ($1,$2,'staled',$3,$4,$5,$6,'system',NULL,$7,NULL,$8,$9,now())`,
          [
            `${row.id}:staled`,
            row.id,
            source.kind,
            source.sourceId,
            source.sourceRevision,
            source.sourceHash,
            JSON.stringify({ valid: true, issueCodes: [] }),
            row.content_hash,
            '{}',
          ],
        );
      }
      return selected.rows.length;
    });
  }

  async markStaleForSource(
    source: Pick<ExperienceGene['source'], 'kind' | 'sourceId'>,
    reasonClass: string,
  ): Promise<number> {
    return this.transaction(async () => {
      const selected = await this.pool.query<
        Pick<
          GeneRow,
          'id' | 'content_hash' | 'source_type' | 'source_id' | 'source_revision' | 'source_hash'
        >
      >(
        `SELECT id, content_hash, source_type, source_id, source_revision, source_hash
         FROM experience_genes
         WHERE source_type = $1 AND source_id = $2
           AND status IN ('candidate','validated','solidified')
         FOR UPDATE`,
        [source.kind, source.sourceId],
      );

      for (const row of selected.rows) {
        await this.pool.query(
          `UPDATE experience_genes SET status = 'stale', updated_at = now() WHERE id = $1`,
          [row.id],
        );
        await this.pool.query(
          `INSERT INTO experience_gene_events
             (id,gene_id,type,source_type,source_id,source_revision,source_hash,actor_kind,actor_id,
              validator_summary,reason_class,payload_snapshot_hash,payload,created_at)
           VALUES ($1,$2,'staled',$3,$4,$5,$6,'system',NULL,$7,$8,$9,$10,now())`,
          [
            `${row.id}:staled`,
            row.id,
            row.source_type,
            row.source_id,
            row.source_revision,
            row.source_hash,
            JSON.stringify({ valid: true, issueCodes: [] }),
            reasonClass,
            row.content_hash,
            '{}',
          ],
        );
      }
      return selected.rows.length;
    });
  }

  async saveRejectedCandidate(event: ExperienceGeneEvent): Promise<void> {
    const parsed = experienceGeneEventSchema.parse(event);
    if (parsed.type !== 'rejected') throw new Error('rejected candidate event required');

    await this.transaction(async () => {
      await this.insertEvent(parsed, 'rejected', {
        actor: parsed.actor,
        validatorSummary: parsed.validatorSummary,
        reasonClass: parsed.reasonClass,
        payloadSnapshotHash: parsed.payloadSnapshotHash,
        payload: parsed.payload,
      });
    });
  }

  async getById(
    geneId: string,
    access: ExperienceGeneAccessContext,
  ): Promise<ExperienceGene | null> {
    const conditions = ['id = $1'];
    const params: Array<string | number | null> = [geneId];
    this.appendAccessFilters(conditions, params, access);
    const result = await this.pool.query<GeneRow>(
      `SELECT ${GENE_COLUMNS} FROM experience_genes WHERE ${conditions.join(' AND ')}`,
      params,
    );
    const row = result.rows[0];
    return row ? mapGene(row) : null;
  }

  async listBySource(
    source: ExperienceGene['source'],
    access: ExperienceGeneAccessContext,
  ): Promise<ExperienceGene[]> {
    const conditions = [
      'source_type = $1',
      'source_id = $2',
      'source_revision = $3',
      'source_hash = $4',
    ];
    const params: Array<string | number | null> = [
      source.kind,
      source.sourceId,
      source.sourceRevision,
      source.sourceHash,
    ];
    this.appendAccessFilters(conditions, params, access);
    const result = await this.pool.query<GeneRow>(
      `SELECT ${GENE_COLUMNS} FROM experience_genes WHERE ${conditions.join(' AND ')}
       ORDER BY updated_at DESC, id ASC`,
      params,
    );
    return result.rows.map((row) => mapGene(row));
  }

  // fallow-ignore-next-line unused-class-member -- consumed through ExperienceGeneStaleRepository's structural contract
  async listActiveBySource(
    source: Pick<ExperienceGene['source'], 'kind' | 'sourceId'>,
  ): Promise<ExperienceGene[]> {
    const result = await this.pool.query<GeneRow>(
      `SELECT ${GENE_COLUMNS} FROM experience_genes
       WHERE source_type = $1 AND source_id = $2
         AND status IN ('candidate', 'validated', 'solidified')
       ORDER BY updated_at DESC, id ASC`,
      [source.kind, source.sourceId],
    );
    return result.rows.map((row) => mapGene(row));
  }

  private idempotencyKey(gene: ExperienceGene): string {
    return createExperienceGeneIdempotencyKeyFromGene(gene);
  }

  private appendAccessFilters(
    conditions: string[],
    params: Array<string | number | null>,
    access: ExperienceGeneAccessContext,
  ): void {
    if (access.teamId === null) {
      conditions.push('team_id IS NULL');
    } else {
      params.push(access.teamId);
      conditions.push(`(team_id IS NULL OR team_id = $${params.length})`);
    }
    params.push(access.maxRequiredLevel);
    conditions.push(`required_level <= $${params.length}`);
  }

  private async selectForUpdate(geneId: string): Promise<GeneRow> {
    const result = await this.pool.query<GeneRow>(
      `SELECT ${GENE_COLUMNS} FROM experience_genes WHERE id = $1 FOR UPDATE`,
      [geneId],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`experience gene not found: ${geneId}`);
    return row;
  }

  private async updateStatus(
    geneId: string,
    status: Extract<ExperienceGene['status'], 'validated' | 'solidified'>,
    allowedFrom: Array<ExperienceGene['status']>,
  ): Promise<ExperienceGene> {
    const result = await this.pool.query<GeneRow>(
      `UPDATE experience_genes SET status = $2, updated_at = now()
       WHERE id = $1 AND status = ANY($3::text[]) RETURNING ${GENE_COLUMNS}`,
      [geneId, status, allowedFrom],
    );
    const row = result.rows[0];
    if (!row) throw new Error(`experience gene cannot transition to ${status}: ${geneId}`);
    return mapGene(row);
  }

  private async insertEvent(
    gene: Pick<ExperienceGene, 'geneId' | 'source'>,
    type: Extract<
      ExperienceGeneEvent['type'],
      'derived' | 'validated' | 'solidified' | 'rejected' | 'index-failed'
    >,
    details: LifecycleEventDetails,
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO experience_gene_events
         (id,gene_id,type,source_type,source_id,source_revision,source_hash,actor_kind,actor_id,
          validator_summary,reason_class,payload_snapshot_hash,payload,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())`,
      [
        `${gene.geneId}:${type}`,
        gene.geneId,
        type,
        gene.source.kind,
        gene.source.sourceId,
        gene.source.sourceRevision,
        gene.source.sourceHash,
        details.actor.kind,
        details.actor.id,
        JSON.stringify(details.validatorSummary),
        details.reasonClass,
        details.payloadSnapshotHash,
        JSON.stringify(details.payload),
      ],
    );
  }

  private async transaction<T>(operation: () => Promise<T>): Promise<T> {
    await this.pool.query('BEGIN');
    try {
      const result = await operation();
      await this.pool.query('COMMIT');
      return result;
    } catch (error) {
      await this.pool.query('ROLLBACK');
      throw error;
    }
  }
}
