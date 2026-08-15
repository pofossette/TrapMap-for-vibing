/**
 * Snapshot orchestrator for live retrieval evaluation.
 *
 * Manages the full lifecycle of a named snapshot version:
 * validate → truncate → restore → health check → cleanup.
 *
 * Two restore modes:
 * - frozen: imports all tables including derived state (embeddings, keywords, capsule indexes)
 * - rebuild: imports source data only, then triggers the indexing pipeline to re-derive
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { Pool } from 'pg';

import {
  type LiveEvalServiceProfile,
  type LiveSnapshotMeta,
  liveSnapshotMetaSchema,
} from '@trapmap/contracts/evals';

import { nowIso } from '@trapmap/lib';

import { loadConfig } from '../../../packages/host-local/src/nest/config/config.js';
import type { HostLocalServices } from '../../../packages/host-local/src/nest/runtime/host-services.js';

import { buildPostgresComposedServer } from '../../../scripts/testing/postgres-server-composition.js';

import { detectServiceProfile, materializeCorpusRecords } from './snapshot-support.js';
import type { IndexHealthSummary, SnapshotOrchestratorOptions } from './types.js';

export { detectServiceProfile, materializeCorpusRecords } from './snapshot-support.js';

// =============================================================================
// Table list for TRUNCATE
// =============================================================================

/**
 * Complete list of retrieval-related tables to truncate during snapshot restore.
 * Extends the offline eval truncation list with capsule index tables.
 */
const RETRIEVAL_TRUNCATE_TABLES = [
  'knowledge_entries',
  'knowledge_labels',
  'knowledge_keywords',
  'knowledge_embeddings',
  'knowledge_revisions',
  'knowledge_search_documents',
  'knowledge_boundary_contexts',
  'knowledge_boundary_evidence',
  'knowledge_boundary_exclusions',
  'knowledge_boundary_prerequisites',
  'knowledge_boundary_signals',
  'knowledge_boundary_versions',
  'knowledge_maintenance_assignments',
  'skill_artifacts',
  'skill_artifact_capsules',
  'skill_artifact_capsule_embeddings',
  'skill_artifact_capsule_keywords',
  'skill_artifact_files',
  'skill_artifact_profiles',
  'skill_artifact_client_manifests',
  'skill_artifact_script_descriptors',
  'skill_artifact_metadata',
  'skill_artifact_agent_reviews',
  'skill_artifact_maintenance_assignments',
  'skill_artifact_manifest_assets',
  'skill_artifact_manifest_references',
  'skill_artifact_manifest_scripts',
  'skill_artifact_boundary_contexts',
  'skill_artifact_boundary_evidence',
  'skill_artifact_boundary_exclusions',
  'skill_artifact_boundary_prerequisites',
  'skill_artifact_boundary_signals',
  'skill_artifact_boundary_versions',
  'artifact_revisions',
  'artifact_lifecycle_events',
  'candidates',
  'candidate_analyses',
  'candidate_duplicate_cases',
  'candidate_duplicate_matches',
  'candidate_manual_results',
  'candidate_resolution_outcomes',
  'sessions',
  'users',
  'teams',
  'memberships',
  'access_keys',
  'feedback_records',
  'feedback_custom_answers',
  'graph_index_documents',
  'entity_lineage',
  'lifecycle_events',
  'usage_events',
  'usage_events_daily_rollup',
  'store_snapshot',
  'task_queue',
];

// =============================================================================
// Snapshot Loading
// =============================================================================

/**
 * Load and validate a snapshot version from disk.
 */
export async function loadSnapshot(
  snapshotDir: string,
): Promise<{ meta: LiveSnapshotMeta; corpus: Record<string, unknown> }> {
  const metaPath = path.join(snapshotDir, 'meta.json');
  const corpusPath = path.join(snapshotDir, 'corpus.json');

  const [metaRaw, corpusRaw] = await Promise.all([
    readFile(metaPath, 'utf8'),
    readFile(corpusPath, 'utf8'),
  ]);

  const meta = liveSnapshotMetaSchema.parse(JSON.parse(metaRaw));
  const corpus = JSON.parse(corpusRaw) as Record<string, unknown>;

  return { meta, corpus };
}

// =============================================================================
// Snapshot Restore
// =============================================================================

/**
 * Restore a snapshot into the test database.
 *
 * @param options - Orchestrator options
 * @returns Index health summary after restore
 */
export async function restoreSnapshot(
  options: SnapshotOrchestratorOptions,
): Promise<{ meta: LiveSnapshotMeta; health: IndexHealthSummary }> {
  const { meta, corpus } = await loadSnapshot(options.snapshotDir);

  // Build a server instance connected to the test database
  const config = loadConfig();
  const databaseUrl = options.databaseUrl || config.databaseUrl;
  if (!databaseUrl) {
    throw new Error(
      'snapshot restore requires TRAPMAP_DATABASE_URL and PostgreSQL host composition',
    );
  }

  const composed = await buildPostgresComposedServer(databaseUrl);
  const { services } = composed;
  const pool = services.store.getPool() as import('pg').Pool;

  try {
    // Step 1: Truncate all retrieval-related tables
    await truncateRetrievalTables(pool);

    // Step 2: Create eval runner user
    const actorId = 'user_eval_runner';
    await services.identity.userRepo.insert({
      id: actorId,
      handle: 'eval-runner',
      notes: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    // Step 3: Import corpus data based on derivation mode
    if (meta.derivationContext.mode === 'frozen') {
      await importFrozenCorpus(pool, services, corpus, actorId);
    } else {
      await importRebuildCorpus(pool, services, corpus, actorId);
    }

    // Step 4: Rebuild graph projection from graph index documents
    const graphDocs = (corpus.graphIndexDocuments ?? []) as Array<Record<string, unknown>>;
    if (graphDocs.length > 0) {
      await services.graphQueryBackend.rebuildProjection(
        graphDocs as Parameters<typeof services.graphQueryBackend.rebuildProjection>[0],
      );
    }

    // Step 5: Health check
    const health = await collectIndexHealth(pool);

    return { meta, health };
  } finally {
    await composed.close();
  }
}

// =============================================================================
// Table Truncation
// =============================================================================

async function truncateRetrievalTables(pool: import('pg').Pool): Promise<void> {
  const tableList = RETRIEVAL_TRUNCATE_TABLES.join(', ');
  await pool.query(`TRUNCATE TABLE ${tableList} CASCADE`);
}

function buildCorpusRepos(services: HostLocalServices): {
  artifact: {
    insert: (record: Record<string, unknown>) => unknown;
  };
  graphIndex: {
    upsert: (record: Record<string, unknown>) => unknown;
  };
  knowledge: {
    insert: (record: Record<string, unknown>) => unknown;
  };
} {
  return {
    knowledge: {
      insert: (record: Record<string, unknown>) => services.knowledgeOwner.submit(record as never),
    },
    artifact: {
      insert: (record: Record<string, unknown>) => services.artifactWriter.insert(record as never),
    },
    graphIndex: {
      upsert: (record: Record<string, unknown>) => services.graphIndex.upsert(record as never),
    },
  };
}

// =============================================================================
// Frozen Mode Import
// =============================================================================

/**
 * Import a frozen corpus: all data including derived state.
 * Writes directly to repository layer, preserving embedding caches,
 * index state, and capsule index tables.
 */
async function importFrozenCorpus(
  pool: Pool,
  services: HostLocalServices,
  corpus: Record<string, unknown>,
  _actorId: string,
): Promise<void> {
  await materializeCorpusRecords(buildCorpusRepos(services), corpus);

  // Import capsule embeddings (frozen mode only)
  const capsuleEmbeddings = (corpus.capsuleEmbeddings ?? []) as Array<Record<string, unknown>>;
  if (capsuleEmbeddings.length > 0) {
    await importCapsuleEmbeddings(pool, capsuleEmbeddings);
  }

  // Import capsule keywords (frozen mode only)
  const capsuleKeywords = (corpus.capsuleKeywords ?? []) as Array<Record<string, unknown>>;
  if (capsuleKeywords.length > 0) {
    await importCapsuleKeywords(pool, capsuleKeywords);
  }
}

// =============================================================================
// Rebuild Mode Import
// =============================================================================

/**
 * Import a rebuild corpus: source data only.
 * The indexing pipeline will re-derive embeddings, keywords, and graph docs.
 */
async function importRebuildCorpus(
  _pool: Pool,
  services: HostLocalServices,
  corpus: Record<string, unknown>,
  _actorId: string,
): Promise<void> {
  await materializeCorpusRecords(buildCorpusRepos(services), corpus, (entry) => ({
    ...entry,
    embeddingCache: undefined,
    indexState: undefined,
  }));
}

// =============================================================================
// Capsule Index Import Helpers
// =============================================================================

/**
 * Import capsule embedding rows into skill_artifact_capsule_embeddings.
 * Uses raw SQL since there's no dedicated repository method for bulk import.
 */
async function importCapsuleEmbeddings(
  pool: import('pg').Pool,
  embeddings: Array<Record<string, unknown>>,
): Promise<void> {
  for (const row of embeddings) {
    await pool.query(
      `INSERT INTO skill_artifact_capsule_embeddings (capsule_id, artifact_id, embedding, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (capsule_id) DO UPDATE SET embedding = EXCLUDED.embedding, updated_at = EXCLUDED.updated_at`,
      [
        row.capsule_id,
        row.artifact_id,
        row.embedding,
        row.created_at ?? nowIso(),
        row.updated_at ?? nowIso(),
      ],
    );
  }
}

/**
 * Import capsule keyword rows into skill_artifact_capsule_keywords.
 */
async function importCapsuleKeywords(
  pool: import('pg').Pool,
  keywords: Array<Record<string, unknown>>,
): Promise<void> {
  for (const row of keywords) {
    await pool.query(
      `INSERT INTO skill_artifact_capsule_keywords (capsule_id, artifact_id, tokens, field_tokens, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (capsule_id) DO UPDATE SET tokens = EXCLUDED.tokens, field_tokens = EXCLUDED.field_tokens, updated_at = EXCLUDED.updated_at`,
      [
        row.capsule_id,
        row.artifact_id,
        row.tokens,
        row.field_tokens,
        row.created_at ?? nowIso(),
        row.updated_at ?? nowIso(),
      ],
    );
  }
}

// =============================================================================
// Index Health Collection
// =============================================================================

/**
 * Collect index health summary from the test database.
 */
async function collectIndexHealth(pool: import('pg').Pool): Promise<IndexHealthSummary> {
  return collectAvailableIndexHealth(pool);
}

async function collectAvailableIndexHealth(pool: import('pg').Pool): Promise<IndexHealthSummary> {
  const [knowledgeCount, artifactCount, graphCount, capsuleCount] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM knowledge_entries'),
    pool.query('SELECT COUNT(*)::int AS count FROM skill_artifacts'),
    pool.query('SELECT COUNT(*)::int AS count FROM graph_index_documents'),
    pool.query('SELECT COUNT(*)::int AS count FROM skill_artifact_capsule_embeddings'),
  ]);

  return {
    knowledgeEntryCount: readCount(knowledgeCount),
    skillArtifactCount: readCount(artifactCount),
    graphDocCount: readCount(graphCount),
    capsuleEmbeddingCount: readCount(capsuleCount),
    graphProjectionHealthy: true,
  };
}

function readCount(result: { rows: Array<{ count?: number }> }): number {
  return result.rows[0]?.count ?? 0;
}

// =============================================================================
// Service Profile Detection
// =============================================================================

/**
 * Verify the running service profile matches snapshot expectations.
 * Returns an array of mismatch descriptions (empty = all match).
 */
export function verifyServiceProfile(
  expected: LiveEvalServiceProfile,
  actual: LiveEvalServiceProfile,
): string[] {
  const mismatches: string[] = [];

  if (expected.embeddingModel !== actual.embeddingModel) {
    mismatches.push(
      `embeddingModel: expected "${expected.embeddingModel}", got "${actual.embeddingModel}"`,
    );
  }
  if (expected.useDbSearch !== actual.useDbSearch) {
    mismatches.push(`useDbSearch: expected ${expected.useDbSearch}, got ${actual.useDbSearch}`);
  }
  if (expected.capsulePgKeyword !== actual.capsulePgKeyword) {
    mismatches.push(
      `capsulePgKeyword: expected ${expected.capsulePgKeyword}, got ${actual.capsulePgKeyword}`,
    );
  }
  if (expected.capsulePgSemantic !== actual.capsulePgSemantic) {
    mismatches.push(
      `capsulePgSemantic: expected ${expected.capsulePgSemantic}, got ${actual.capsulePgSemantic}`,
    );
  }
  if (expected.graphDbEnabled !== actual.graphDbEnabled) {
    mismatches.push(
      `graphDbEnabled: expected ${expected.graphDbEnabled}, got ${actual.graphDbEnabled}`,
    );
  }

  return mismatches;
}
