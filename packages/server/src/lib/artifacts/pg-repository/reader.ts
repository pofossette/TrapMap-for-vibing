/**
 * Read/query operations for PgArtifactRepository.
 *
 * Contains getById, listByFilter, and listForRetrieval.
 * Extracted from the main class to keep each module single-responsibility.
 */

import type { LifecycleState } from '@trapmap/contracts';
import type { Pool } from 'pg';

import type { SkillArtifactRecord } from '@trapmap/server/lib/store.js';

import {
  loadArtifactAgentReview,
  loadArtifactBoundaryFromSubTables,
  loadArtifactMaintenanceMeta,
  loadArtifactMetadata,
} from './derived-store.js';
import {
  type DrizzleArtifactLifecycleEventRow,
  type DrizzleArtifactRevisionRow,
  type DrizzleSkillArtifactRow,
  reconstructSkillArtifactRecord,
  rowToSkillArtifact,
} from './record-reconstruction.js';
import { loadStructuredRevisionData } from './revision-reader.js';

/**
 * Fetch a single artifact by ID with all related data (revisions, lifecycle
 * events, structured revision data, boundary, maintenance, agent review,
 * metadata). Returns null when no row is found.
 */
export async function getArtifactById(
  pool: Pool,
  artifactId: string,
): Promise<SkillArtifactRecord | null> {
  const artifactResult = await pool.query<DrizzleSkillArtifactRow>(
    'SELECT * FROM skill_artifacts WHERE id = $1',
    [artifactId],
  );

  if (artifactResult.rows.length === 0) {
    return null;
  }

  const artifactRow = artifactResult.rows[0]!;

  const revisionsResult = await pool.query<DrizzleArtifactRevisionRow>(
    'SELECT * FROM artifact_revisions WHERE artifact_id = $1 ORDER BY revision_no',
    [artifactId],
  );
  const revisionIds = revisionsResult.rows.map((row) => row.id);
  const structured = await loadStructuredRevisionData(pool, revisionIds);

  const eventsResult = await pool.query<DrizzleArtifactLifecycleEventRow>(
    'SELECT * FROM artifact_lifecycle_events WHERE artifact_id = $1 ORDER BY created_at',
    [artifactId],
  );
  const boundary = await loadArtifactBoundaryFromSubTables(pool, artifactId);
  const maintenanceMeta = await loadArtifactMaintenanceMeta(pool, artifactId);
  const agentReview = await loadArtifactAgentReview(pool, artifactId);
  const metadata = await loadArtifactMetadata(pool, artifactId);

  return reconstructSkillArtifactRecord(
    artifactRow,
    revisionsResult.rows,
    eventsResult.rows,
    structured,
    boundary,
    maintenanceMeta,
    agentReview,
    metadata,
  );
}

/**
 * List artifacts matching the given filter criteria.
 * Returns lightweight records without full revision history.
 */
export async function listArtifactsByFilter(
  pool: Pool,
  filter: {
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
    maintainerUserId?: string;
  },
): Promise<SkillArtifactRecord[]> {
  const conditions: string[] = [];
  const params: (string | number)[] = [];
  let paramIndex = 1;
  let joinClause = '';

  if (filter.lifecycleState !== undefined) {
    conditions.push(`lifecycle_state = $${paramIndex++}`);
    params.push(filter.lifecycleState);
  }
  if (filter.teamId !== undefined) {
    conditions.push(`team_id = $${paramIndex++}`);
    params.push(filter.teamId);
  }
  if (filter.ownerUserId !== undefined) {
    conditions.push(`owner_user_id = $${paramIndex++}`);
    params.push(filter.ownerUserId);
  }
  if (filter.maintainerUserId !== undefined) {
    joinClause =
      'LEFT JOIN skill_artifact_maintenance_assignments sama ON sama.artifact_id = skill_artifacts.id';
    conditions.push(`sama.maintainer_user_id = $${paramIndex++}`);
    params.push(filter.maintainerUserId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await pool.query<DrizzleSkillArtifactRow>(
    `SELECT skill_artifacts.* FROM skill_artifacts ${joinClause} ${whereClause}`,
    params,
  );

  return result.rows.map((row) => {
    const artifact = rowToSkillArtifact(row);
    // Clear heavy fields for list view
    artifact.history = [];
    artifact.latestRevision = {
      revision: 0,
      sourceHash: '',
      files: [],
      submittedAt: artifact.createdAt,
      submittedByUserId: artifact.ownerUserId,
      scriptDescriptors: [],
      derived: null,
    };
    artifact.lifecycleHistory = [];
    artifact.reviewHistory = [];
    artifact.reviewNotes = [];
    return artifact;
  });
}

/**
 * List artifacts for retrieval with derived capsule data hydrated.
 * Reuses listByFilter logic then batch-loads revision + structured data
 * so latestRevision.derived is populated for capsule recall channels.
 */
export async function listArtifactsForRetrieval(
  pool: Pool,
  filter: {
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
    maintainerUserId?: string;
  },
): Promise<SkillArtifactRecord[]> {
  const lightweight = await listArtifactsByFilter(pool, filter);
  if (lightweight.length === 0) return [];

  const ids = lightweight.map((a) => a.id);
  const placeholders = ids.map((_, i) => `$${i + 1}`);

  const revisionsResult = await pool.query<DrizzleArtifactRevisionRow>(
    `SELECT * FROM artifact_revisions WHERE artifact_id IN (${placeholders.join(',')}) ORDER BY artifact_id, revision_no`,
    ids,
  );

  const revisionsByArtifact = new Map<string, DrizzleArtifactRevisionRow[]>();
  for (const row of revisionsResult.rows) {
    const list = revisionsByArtifact.get(row.artifact_id) ?? [];
    list.push(row);
    revisionsByArtifact.set(row.artifact_id, list);
  }

  const allRevisionIds = revisionsResult.rows.map((r) => r.id);
  const structured =
    allRevisionIds.length > 0 ? await loadStructuredRevisionData(pool, allRevisionIds) : new Map();

  for (const artifact of lightweight) {
    const revisionRows = revisionsByArtifact.get(artifact.id) ?? [];
    if (revisionRows.length === 0) continue;

    const latestRow = revisionRows[revisionRows.length - 1]!;
    const structuredData = structured.get(latestRow.id);

    artifact.latestRevision = {
      revision: latestRow.revision_no,
      sourceHash: latestRow.source_hash,
      files: structuredData?.files ?? [],
      submittedAt: latestRow.submitted_at.toISOString(),
      submittedByUserId: latestRow.submitted_by_user_id,
      scriptDescriptors: structuredData?.scriptDescriptors ?? [],
      derived: structuredData?.derived ?? latestRow.derived ?? null,
    };
  }

  return lightweight;
}
