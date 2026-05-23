/**
 * Capsule index rebuild and reconciliation utilities.
 *
 * Provides batch operations for maintaining the derived index tables:
 *   - rebuildAllCapsuleIndexes(): Full wipe-and-rebuild of both keyword and embedding tables
 *   - rebuildCapsuleIndexForArtifact(): Targeted rebuild for a single artifact
 *   - verifyCapsuleIndexHealth(): Reconcile source vs. index data and report gaps
 *
 * These are intended for operational use (CLI scripts, admin endpoints, cron jobs)
 * and not part of the hot retrieval path.
 */

import { inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import {
  skillArtifactCapsuleEmbeddings,
  skillArtifactCapsuleKeywords,
} from '../../../persistence/schema.js';
import type { SkillArtifactRecord } from '../../../store.js';
import type { SyncResult } from './index-sync.js';
import { createCapsuleIndexSync } from './index-sync.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RebuildStats {
  /** Total artifacts processed */
  artifactsProcessed: number;
  /** Total capsules synced */
  capsulesSynced: number;
  /** Keyword sync results grouped by artifact */
  keywordSynced: number;
  keywordFailed: number;
  /** Embedding sync results grouped by artifact */
  embeddingSynced: number;
  embeddingFailed: number;
  /** Duration in milliseconds */
  durationMs: number;
}

export interface HealthReport {
  /** Total source capsules (from artifact records) */
  totalSourceCapsules: number;
  /** Total keyword index rows */
  totalKeywordRows: number;
  /** Total embedding index rows */
  totalEmbeddingRows: number;
  /** Capsule IDs in source but missing from keyword index */
  missingKeywords: string[];
  /** Capsule IDs in source but missing from embedding index */
  missingEmbeddings: string[];
  /** Capsule IDs with keyword status='failed' */
  failedKeywords: Array<{ capsuleId: string; error: string | null }>;
  /** Capsule IDs with embedding status='failed' */
  failedEmbeddings: Array<{ capsuleId: string; error: string | null }>;
  /** Orphan index rows (in index but not in source artifacts) */
  orphanKeywords: string[];
  orphanEmbeddings: string[];
}

export interface RebuildConfig {
  pool: Pool;
  /** Source artifact records for the rebuild */
  artifacts: SkillArtifactRecord[];
  /** Callback for progress reporting */
  onProgress?: (stats: { processed: number; total: number; currentArtifact: string }) => void;
}

export interface HealthCheckConfig {
  pool: Pool;
  /** Source artifact records for reconciliation */
  artifacts: SkillArtifactRecord[];
}

// ---------------------------------------------------------------------------
// Rebuild
// ---------------------------------------------------------------------------

/**
 * Rebuild all capsule indexes from source artifact records.
 *
 * 1. Wipes both index tables
 * 2. Iterates all artifacts, syncing each capsule's keyword tokens + embedding
 * 3. Returns aggregate stats
 *
 * This is a heavy operation that regenerates embeddings for every capsule.
 * Use only for initial seeding or disaster recovery.
 */
export async function rebuildAllCapsuleIndexes(config: RebuildConfig): Promise<RebuildStats> {
  const start = Date.now();
  const db = drizzle(config.pool);
  const schema = { skillArtifactCapsuleKeywords, skillArtifactCapsuleEmbeddings };
  const sync = createCapsuleIndexSync({ pool: config.pool });

  // Wipe existing index data
  await db.delete(schema.skillArtifactCapsuleKeywords);
  await db.delete(schema.skillArtifactCapsuleEmbeddings);

  const stats: RebuildStats = {
    artifactsProcessed: 0,
    capsulesSynced: 0,
    keywordSynced: 0,
    keywordFailed: 0,
    embeddingSynced: 0,
    embeddingFailed: 0,
    durationMs: 0,
  };

  const total = config.artifacts.length;

  for (const artifact of config.artifacts) {
    config.onProgress?.({
      processed: stats.artifactsProcessed,
      total,
      currentArtifact: artifact.id,
    });

    const result: SyncResult = await sync.syncArtifactCapsules(artifact);

    stats.artifactsProcessed++;
    stats.keywordSynced += result.keyword.filter((r) => r.status === 'synced').length;
    stats.keywordFailed += result.keyword.filter((r) => r.status === 'failed').length;
    stats.embeddingSynced += result.embedding.filter((r) => r.status === 'synced').length;
    stats.embeddingFailed += result.embedding.filter((r) => r.status === 'failed').length;
    stats.capsulesSynced +=
      result.keyword.filter((r) => r.status === 'synced').length +
      result.embedding.filter((r) => r.status === 'synced').length;
  }

  stats.durationMs = Date.now() - start;
  return stats;
}

/**
 * Rebuild indexes for a single artifact.
 *
 * Useful for targeted repair when a specific artifact's capsules change
 * (e.g., after a revision or lifecycle transition).
 */
export async function rebuildCapsuleIndexForArtifact(
  config: RebuildConfig,
  artifactId: string,
): Promise<SyncResult | null> {
  const artifact = config.artifacts.find((a) => a.id === artifactId);
  if (!artifact) return null;

  const sync = createCapsuleIndexSync({ pool: config.pool });
  return sync.syncArtifactCapsules(artifact);
}

// ---------------------------------------------------------------------------
// Health Check (Reconciliation)
// ---------------------------------------------------------------------------

/**
 * Verify index health by reconciling source artifacts against index tables.
 *
 * Compares the capsule IDs in source artifacts with those in the index tables,
 * reporting missing entries, failed-status entries, and orphan rows.
 *
 * This is a read-only operation and does not modify any data.
 */
export async function verifyCapsuleIndexHealth(config: HealthCheckConfig): Promise<HealthReport> {
  const db = drizzle(config.pool, {
    schema: { skillArtifactCapsuleKeywords, skillArtifactCapsuleEmbeddings },
  });
  const schema = { skillArtifactCapsuleKeywords, skillArtifactCapsuleEmbeddings };

  // Collect all source capsule IDs
  const sourceCapsuleIds = new Set<string>();
  for (const artifact of config.artifacts) {
    const capsules = artifact.latestRevision.derived?.capsules ?? [];
    for (const capsule of capsules) {
      sourceCapsuleIds.add(capsule.capsuleId);
    }
  }

  // Query all keyword index rows
  const keywordRows = await db
    .select({
      capsuleId: schema.skillArtifactCapsuleKeywords.capsuleId,
      status: schema.skillArtifactCapsuleKeywords.status,
      lastError: schema.skillArtifactCapsuleKeywords.lastError,
    })
    .from(schema.skillArtifactCapsuleKeywords);

  // Query all embedding index rows
  const embeddingRows = await db
    .select({
      capsuleId: schema.skillArtifactCapsuleEmbeddings.capsuleId,
      status: schema.skillArtifactCapsuleEmbeddings.status,
      lastError: schema.skillArtifactCapsuleEmbeddings.lastError,
    })
    .from(schema.skillArtifactCapsuleEmbeddings);

  const keywordCapsuleIds = new Set(keywordRows.map((r) => r.capsuleId));
  const embeddingCapsuleIds = new Set(embeddingRows.map((r) => r.capsuleId));

  // Find missing entries (in source but not in index)
  const missingKeywords: string[] = [];
  const missingEmbeddings: string[] = [];

  for (const capsuleId of sourceCapsuleIds) {
    if (!keywordCapsuleIds.has(capsuleId)) {
      missingKeywords.push(capsuleId);
    }
    if (!embeddingCapsuleIds.has(capsuleId)) {
      missingEmbeddings.push(capsuleId);
    }
  }

  // Find failed entries
  const failedKeywords = keywordRows
    .filter((r) => r.status === 'failed')
    .map((r) => ({ capsuleId: r.capsuleId, error: r.lastError }));
  const failedEmbeddings = embeddingRows
    .filter((r) => r.status === 'failed')
    .map((r) => ({ capsuleId: r.capsuleId, error: r.lastError }));

  // Find orphan entries (in index but not in source)
  const orphanKeywords: string[] = [];
  const orphanEmbeddings: string[] = [];

  for (const capsuleId of keywordCapsuleIds) {
    if (!sourceCapsuleIds.has(capsuleId)) {
      orphanKeywords.push(capsuleId);
    }
  }
  for (const capsuleId of embeddingCapsuleIds) {
    if (!sourceCapsuleIds.has(capsuleId)) {
      orphanEmbeddings.push(capsuleId);
    }
  }

  return {
    totalSourceCapsules: sourceCapsuleIds.size,
    totalKeywordRows: keywordRows.length,
    totalEmbeddingRows: embeddingRows.length,
    missingKeywords,
    missingEmbeddings,
    failedKeywords,
    failedEmbeddings,
    orphanKeywords,
    orphanEmbeddings,
  };
}

/**
 * Clean up orphan index entries that have no corresponding source capsule.
 *
 * Removes rows from both keyword and embedding tables whose capsule IDs
 * are not present in the source artifact records.
 */
export async function cleanupOrphanCapsuleIndexes(
  config: HealthCheckConfig,
): Promise<{ removedKeywords: number; removedEmbeddings: number }> {
  const db = drizzle(config.pool);
  const schema = { skillArtifactCapsuleKeywords, skillArtifactCapsuleEmbeddings };

  const sourceCapsuleIds = new Set<string>();
  for (const artifact of config.artifacts) {
    const capsules = artifact.latestRevision.derived?.capsules ?? [];
    for (const capsule of capsules) {
      sourceCapsuleIds.add(capsule.capsuleId);
    }
  }

  if (sourceCapsuleIds.size === 0) {
    // No source capsules — wipe everything
    const kw = await db.delete(schema.skillArtifactCapsuleKeywords);
    const emb = await db.delete(schema.skillArtifactCapsuleEmbeddings);
    return { removedKeywords: kw.rowCount ?? 0, removedEmbeddings: emb.rowCount ?? 0 };
  }

  // Query all index capsule IDs
  const keywordRows = await db
    .select({ capsuleId: schema.skillArtifactCapsuleKeywords.capsuleId })
    .from(schema.skillArtifactCapsuleKeywords);

  const embeddingRows = await db
    .select({ capsuleId: schema.skillArtifactCapsuleEmbeddings.capsuleId })
    .from(schema.skillArtifactCapsuleEmbeddings);

  const orphanKwIds = keywordRows
    .filter((r) => !sourceCapsuleIds.has(r.capsuleId))
    .map((r) => r.capsuleId);

  const orphanEmbIds = embeddingRows
    .filter((r) => !sourceCapsuleIds.has(r.capsuleId))
    .map((r) => r.capsuleId);

  let removedKeywords = 0;
  let removedEmbeddings = 0;

  if (orphanKwIds.length > 0) {
    const result = await db
      .delete(schema.skillArtifactCapsuleKeywords)
      .where(inArray(schema.skillArtifactCapsuleKeywords.capsuleId, orphanKwIds));
    removedKeywords = result.rowCount ?? 0;
  }

  if (orphanEmbIds.length > 0) {
    const result = await db
      .delete(schema.skillArtifactCapsuleEmbeddings)
      .where(inArray(schema.skillArtifactCapsuleEmbeddings.capsuleId, orphanEmbIds));
    removedEmbeddings = result.rowCount ?? 0;
  }

  return { removedKeywords, removedEmbeddings };
}
