import type { ExperienceGeneMetricsPort } from '@trapmap/backend-core';
import type { ArtifactReadProjection, KnowledgeOwnerPort } from '@trapmap/contracts';
import type { ExperienceGeneDerivationTaskPayload, ExperienceGeneMode } from '@trapmap/contracts';
import { createDeterministicFallbackVector } from '@trapmap/lib';
import {
  type ArtifactBundleImportPort,
  type ArtifactWritePort,
  createArtifactBundleImportPort,
  createArtifactReadProjection,
  createArtifactWritePort,
} from './artifact-ports.js';
import {
  type ExperienceGeneDerivationDependencies,
  deriveExperienceGeneFromRule,
  experienceGeneEmbeddingText,
} from './experience-gene-derivation.js';
import { withExperienceGeneDerivationMetrics } from './experience-gene-metrics.js';
import { PgExperienceGeneRepository } from './experience-gene-repository.js';
import { createPgExperienceGeneSourceLoaders } from './experience-gene-snapshots.js';
import { createExperienceGeneStaleHandler } from './experience-gene-staleness-handler.js';
import {
  persistEntryUpdateTx,
  persistEvidenceReviewTx,
  persistOperationalDecisionTx,
  persistSubmissionTx,
  persistSupersedeTx,
} from './knowledge-entry-tx.js';
import { createKnowledgeOwnerProjection } from './knowledge-projection.js';

/** Minimal query-only pool seam (structural; satisfied by pg.Pool). */
export interface Queryable {
  query<T extends Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount?: number | null }>;
}

/** Minimal transactional pool seam (structural; satisfied by pg.Pool). */
export interface TransactionPool extends Queryable {
  connect(): Promise<{
    query<T extends Record<string, unknown>>(
      sql: string,
      values?: unknown[],
    ): Promise<{ rows: T[]; rowCount?: number | null }>;
    release(): void;
  }>;
}

export interface KnowledgeWriteOwnerBundle {
  knowledgeOwner: KnowledgeOwnerPort;
  artifactWriter: ArtifactWritePort;
  artifactReadProjection: ArtifactReadProjection;
  artifactBundleImporter: ArtifactBundleImportPort;
}

export interface KnowledgeWriteOutboxDiagnostics {
  getStatusSnapshot(): Promise<{
    provider: 'postgres';
    pending: number;
    processing: number;
    failed: number;
    staleProcessing: number;
    reclaimCount: number;
  }>;
}

export interface ExperienceGeneDerivationRuntimeOptions
  extends Pick<ExperienceGeneDerivationDependencies, 'llm' | 'embedding'> {
  metrics?: ExperienceGeneMetricsPort;
  mode?: ExperienceGeneMode;
}

export function createExperienceGeneDerivationOperation(
  pool: TransactionPool,
  options: ExperienceGeneDerivationRuntimeOptions = {},
) {
  const repository = new PgExperienceGeneRepository({ pool });
  const loaders = createPgExperienceGeneSourceLoaders(pool);
  const operation = async (request: ExperienceGeneDerivationTaskPayload) =>
    deriveExperienceGeneFromRule(request, {
      loaders,
      repository,
      nowIso: new Date().toISOString(),
      findDuplicate: async (gene) => {
        const vector = options.embedding
          ? await options.embedding.generate(experienceGeneEmbeddingText(gene))
          : createDeterministicFallbackVector(experienceGeneEmbeddingText(gene), 384);
        return repository.findDuplicateProjection(gene, vector);
      },
      ...(options.llm ? { llm: options.llm } : {}),
      ...(options.embedding ? { embedding: options.embedding } : {}),
    });

  if (!options.metrics || !options.mode) return operation;
  return withExperienceGeneDerivationMetrics(operation, {
    metrics: options.metrics,
    mode: options.mode,
  });
}

export function createExperienceGeneStaleOperation(
  pool: TransactionPool,
  options: { metrics?: ExperienceGeneMetricsPort; mode?: ExperienceGeneMode } = {},
) {
  return createExperienceGeneStaleHandler({
    pool,
    repository: new PgExperienceGeneRepository({ pool }),
    ...(options.metrics && options.mode
      ? {
          onStale: (reasonClass: string, count: number) => {
            if (options.metrics && options.mode) {
              options.metrics.recordStale({ mode: options.mode, reasonClass, count });
            }
          },
        }
      : {}),
  }).handle;
}

export function createKnowledgeWriteOwnerBundle(pool: TransactionPool): KnowledgeWriteOwnerBundle {
  const projection = createKnowledgeOwnerProjection(pool);
  const knowledgeOwner: KnowledgeOwnerPort = {
    async submit(input) {
      return {
        entryId: await persistSubmissionTx(pool, input, { entryType: 'knowledge' }),
      };
    },
    async updateEntry(entryId, updates, actorId) {
      await persistEntryUpdateTx(pool, entryId, updates, actorId);
    },
    async resubmit(entryId, updates, actorId) {
      await persistEntryUpdateTx(pool, entryId, updates, actorId, 'submitted');
    },
    async supersede(entryId, replacementId, actorId) {
      await persistSupersedeTx(pool, entryId, replacementId, actorId);
    },
    async createTrap(input) {
      return {
        trapId: await persistSubmissionTx(pool, input, { entryType: 'trap' }),
      };
    },
    async approveReviewDecision(input) {
      const entryId = String(input.entryId);
      await persistEntryUpdateTx(
        pool,
        entryId,
        {},
        input.actorId,
        'approved',
        typeof input.note === 'string' ? input.note : 'Approved',
      );
      return { entryId, lifecycleState: 'approved' };
    },
    async rejectReviewDecision(input) {
      const entryId = String(input.entryId);
      await persistEntryUpdateTx(
        pool,
        entryId,
        {},
        input.actorId,
        'rejected',
        typeof input.note === 'string' ? input.note : 'Rejected',
      );
      return { entryId, lifecycleState: 'rejected' };
    },
    async returnReviewDecision(input) {
      const entryId = String(input.entryId);
      await persistEntryUpdateTx(
        pool,
        entryId,
        {},
        input.actorId,
        'submitted',
        typeof input.note === 'string' ? input.note : 'Returned for correction',
      );
      return { entryId, lifecycleState: 'submitted' };
    },
    async applyMaintenanceDecision(input) {
      return persistOperationalDecisionTx(pool, input, 'maintenance');
    },
    async applyDecayDecision(input) {
      return persistOperationalDecisionTx(pool, input, 'decay');
    },
    async reviewEvidence(entryId, evidence, actorId) {
      await persistEvidenceReviewTx(pool, entryId, evidence, actorId);
      return { entryId, evidence };
    },
    getById: projection.getById,
    getByIds: projection.getByIds,
    getIndexingEntry: projection.getIndexingEntry,
    listIndexingEntries: projection.listIndexingEntries,
    listByFilter: projection.listByFilter,
    async updateEmbeddingCache(entryId, cache) {
      await pool.query(
        'UPDATE knowledge_entries SET embedding_cache = $2, updated_at = NOW() WHERE id = $1',
        [entryId, JSON.stringify(cache)],
      );
    },
    async updateIndexMetadata(entryId, metadata) {
      await pool.query(
        'UPDATE knowledge_entries SET index_state = $2, embedding_cache = $3, updated_at = NOW() WHERE id = $1',
        [entryId, JSON.stringify(metadata.indexState), JSON.stringify(metadata.embeddingCache)],
      );
    },
  };
  return {
    knowledgeOwner,
    artifactWriter: createArtifactWritePort(pool),
    artifactBundleImporter: createArtifactBundleImportPort(pool),
    artifactReadProjection: createArtifactReadProjection(pool),
  };
}

export function createKnowledgeWriteOutboxDiagnostics(
  pool: Queryable,
): KnowledgeWriteOutboxDiagnostics {
  return {
    async getStatusSnapshot() {
      const [pending, processing, failed] = await Promise.all([
        pool.query("SELECT COUNT(*) as count FROM domain_event_outbox WHERE status = 'pending'"),
        pool.query("SELECT COUNT(*) as count FROM domain_event_outbox WHERE status = 'processing'"),
        pool.query("SELECT COUNT(*) as count FROM domain_event_outbox WHERE status = 'failed'"),
      ]);
      return {
        provider: 'postgres',
        pending: Number((pending.rows[0] as { count: string }).count),
        processing: Number((processing.rows[0] as { count: string }).count),
        failed: Number((failed.rows[0] as { count: string }).count),
        staleProcessing: 0,
        reclaimCount: 0,
      };
    },
  };
}
