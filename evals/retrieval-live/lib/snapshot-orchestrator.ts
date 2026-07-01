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

import {
  liveSnapshotMetaSchema,
  type LiveSnapshotMeta,
  type LiveEvalServiceProfile,
} from '@trapmap/contracts/evals';

import { loadConfig } from '../../../packages/server/src/config.js';
import { buildServer } from '../../../packages/server/src/app.js';
import { hashSecret, nowIso } from '../../../packages/server/src/lib/store.js';
import type { SkillShareerRepos } from '../../../packages/server/src/lib/repos/index.js';

import type { IndexHealthSummary, SnapshotOrchestratorOptions } from './types.js';

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
    throw new Error('Database URL is required for snapshot restore');
  }

  const app = buildServer({ config: { databaseUrl } });
  await app.ready();

  try {
    const repos = app.skillShareer.repos;
    if (!repos) {
      throw new Error('Snapshot restore requires PostgreSQL mode (repos not available)');
    }

    // Step 1: Truncate all retrieval-related tables
    await truncateRetrievalTables(repos);

    // Step 2: Create eval runner user
    const actorId = 'user_eval_runner';
    await repos.user.insert({
      id: actorId,
      handle: 'eval-runner',
      notes: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    // Step 3: Import corpus data based on derivation mode
    if (meta.derivationContext.mode === 'frozen') {
      await importFrozenCorpus(repos, corpus, actorId);
    } else {
      await importRebuildCorpus(repos, corpus, actorId);
    }

    // Step 4: Rebuild graph projection from graph index documents
    const graphDocs = (corpus.graphIndexDocuments ?? []) as Array<Record<string, unknown>>;
    if (graphDocs.length > 0) {
      await app.skillShareer.graphQueryBackend.rebuildProjection(
        graphDocs as Parameters<typeof app.skillShareer.graphQueryBackend.rebuildProjection>[0],
      );
    }

    // Step 5: Health check
    const health = await collectIndexHealth(repos);

    return { meta, health };
  } finally {
    await app.close();
  }
}

// =============================================================================
// Table Truncation
// =============================================================================

async function truncateRetrievalTables(repos: SkillShareerRepos): Promise<void> {
  // Use the knowledge repo's pool directly for TRUNCATE
  // The repos share a pool, so we can use any repo's access
  const pool = (repos as unknown as { _pool?: import('pg').Pool })._pool;
  if (!pool) {
    throw new Error('Cannot access database pool from repos');
  }
  const tableList = RETRIEVAL_TRUNCATE_TABLES.join(', ');
  await pool.query(`TRUNCATE TABLE ${tableList} CASCADE`);
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
  repos: SkillShareerRepos,
  corpus: Record<string, unknown>,
  actorId: string,
): Promise<void> {
  const createdAt = nowIso();

  // Import knowledge entries (with embedding_cache and index_state intact)
  const entries = (corpus.knowledgeEntries ?? []) as Array<Record<string, unknown>>;
  for (const entry of entries) {
    await repos.knowledge.insert(entry as Parameters<typeof repos.knowledge.insert>[0]);
  }

  // Import skill artifacts (with derived.capsules intact)
  const artifacts = (corpus.skillArtifacts ?? []) as Array<Record<string, unknown>>;
  for (const artifact of artifacts) {
    await repos.artifact.insert(artifact as Parameters<typeof repos.artifact.insert>[0]);
  }

  // Import graph index documents
  const graphDocs = (corpus.graphIndexDocuments ?? []) as Array<Record<string, unknown>>;
  for (const doc of graphDocs) {
    await repos.graphIndex.upsert(doc as Parameters<typeof repos.graphIndex.upsert>[0]);
  }

  // Import capsule embeddings (frozen mode only)
  const capsuleEmbeddings = (corpus.capsuleEmbeddings ?? []) as Array<Record<string, unknown>>;
  if (capsuleEmbeddings.length > 0) {
    await importCapsuleEmbeddings(repos, capsuleEmbeddings);
  }

  // Import capsule keywords (frozen mode only)
  const capsuleKeywords = (corpus.capsuleKeywords ?? []) as Array<Record<string, unknown>>;
  if (capsuleKeywords.length > 0) {
    await importCapsuleKeywords(repos, capsuleKeywords);
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
  repos: SkillShareerRepos,
  corpus: Record<string, unknown>,
  actorId: string,
): Promise<void> {
  const createdAt = nowIso();

  // Import knowledge entries (source only - pipeline will compute embeddings)
  const entries = (corpus.knowledgeEntries ?? []) as Array<Record<string, unknown>>;
  for (const entry of entries) {
    // Strip derived fields so pipeline re-computes them
    const sourceEntry = { ...entry };
    delete sourceEntry.embeddingCache;
    delete sourceEntry.indexState;
    await repos.knowledge.insert(sourceEntry as Parameters<typeof repos.knowledge.insert>[0]);
  }

  // Import skill artifacts (capsules are source data for derivation)
  const artifacts = (corpus.skillArtifacts ?? []) as Array<Record<string, unknown>>;
  for (const artifact of artifacts) {
    await repos.artifact.insert(artifact as Parameters<typeof repos.artifact.insert>[0]);
  }

  // Graph index documents will be regenerated by the indexing pipeline.
  // If the corpus has pre-built graph docs (e.g., from a previous frozen export),
  // import them as a starting point - the pipeline will update as needed.
  const graphDocs = (corpus.graphIndexDocuments ?? []) as Array<Record<string, unknown>>;
  for (const doc of graphDocs) {
    await repos.graphIndex.upsert(doc as Parameters<typeof repos.graphIndex.upsert>[0]);
  }
}

// =============================================================================
// Capsule Index Import Helpers
// =============================================================================

/**
 * Import capsule embedding rows into skill_artifact_capsule_embeddings.
 * Uses raw SQL since there's no dedicated repository method for bulk import.
 */
async function importCapsuleEmbeddings(
  repos: SkillShareerRepos,
  embeddings: Array<Record<string, unknown>>,
): Promise<void> {
  const pool = (repos as unknown as { _pool?: import('pg').Pool })._pool;
  if (!pool) return;

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
  repos: SkillShareerRepos,
  keywords: Array<Record<string, unknown>>,
): Promise<void> {
  const pool = (repos as unknown as { _pool?: import('pg').Pool })._pool;
  if (!pool) return;

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
async function collectIndexHealth(repos: SkillShareerRepos): Promise<IndexHealthSummary> {
  const pool = (repos as unknown as { _pool?: import('pg').Pool })._pool;
  if (!pool) {
    return {
      knowledgeEntryCount: 0,
      skillArtifactCount: 0,
      graphDocCount: 0,
      capsuleEmbeddingCount: 0,
      graphProjectionHealthy: false,
    };
  }

  const [knowledgeCount, artifactCount, graphCount, capsuleCount] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS count FROM knowledge_entries'),
    pool.query('SELECT COUNT(*)::int AS count FROM skill_artifacts'),
    pool.query('SELECT COUNT(*)::int AS count FROM graph_index_documents'),
    pool.query('SELECT COUNT(*)::int AS count FROM skill_artifact_capsule_embeddings'),
  ]);

  return {
    knowledgeEntryCount: knowledgeCount.rows[0]?.count ?? 0,
    skillArtifactCount: artifactCount.rows[0]?.count ?? 0,
    graphDocCount: graphCount.rows[0]?.count ?? 0,
    capsuleEmbeddingCount: capsuleCount.rows[0]?.count ?? 0,
    graphProjectionHealthy: true,
  };
}

// =============================================================================
// Service Profile Detection
// =============================================================================

/**
 * Detect the current service profile from environment variables.
 * Used to compare against snapshot expectations.
 */
export function detectServiceProfile(): LiveEvalServiceProfile {
  return {
    embeddingModel: process.env.OPENAI_API_KEY
      ? 'text-embedding-3-small'
      : (process.env.AI_EMBEDDING_MODEL ?? 'fallback-hash'),
    useDbSearch: process.env.USE_DB_SEARCH === 'true',
    capsulePgKeyword: process.env.RETRIEVAL_CAPSULE_PG_KEYWORD === 'true',
    capsulePgSemantic: process.env.RETRIEVAL_CAPSULE_PG_SEMANTIC === 'true',
    graphDbEnabled: process.env.TRAPMAP_GRAPH_DB_ENABLED === 'true',
    graphDbProvider:
      process.env.TRAPMAP_GRAPH_DB_ENABLED === 'true'
        ? (process.env.TRAPMAP_GRAPH_DB_PROVIDER ?? 'neo4j')
        : null,
    decayEnabled: process.env.TRAPMAP_DECAY_ENABLED === 'true',
  };
}

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
