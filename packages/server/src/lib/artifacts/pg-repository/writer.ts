/**
 * Write operations for PgArtifactRepository.
 *
 * Contains insert, appendRevision, updateRevisionDerived, appendLifecycleEvent,
 * and updateGovernance. All use row-level SELECT FOR UPDATE locking for
 * concurrent-safe mutations.
 */

import type { Pool } from 'pg';

import type {
  SkillArtifactLifecycleEventRecord,
  SkillArtifactRecord,
  SkillArtifactRevisionRecord,
} from '@trapmap/server/lib/store.js';

import {
  insertArtifactBoundarySubTables,
  upsertArtifactAgentReview,
  upsertArtifactMaintenanceAssignment,
  upsertArtifactMetadata,
} from './derived-store.js';
import { type DrizzleSkillArtifactRow } from './record-reconstruction.js';
import { getArtifactById } from './reader.js';
import {
  replaceStructuredDerivedRows,
  syncRevisionCount,
  upsertStructuredRevisionRows,
} from './revision-writer.js';

/**
 * Insert a new artifact with all related data inside a single transaction.
 */
export async function insertArtifact(pool: Pool, artifact: SkillArtifactRecord): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO skill_artifacts (
        id, team_id, scope, labels, title, slug, required_level,
        lifecycle_state, owner_user_id, metadata, agent_review,
        maintenance_meta, boundary, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
      [
        artifact.id,
        artifact.teamId,
        artifact.scope,
        JSON.stringify(artifact.labels),
        artifact.title,
        artifact.slug,
        artifact.requiredLevel,
        artifact.lifecycleState,
        artifact.ownerUserId,
        JSON.stringify(artifact.metadata),
        artifact.agentReview ? JSON.stringify(artifact.agentReview) : null,
        artifact.maintenanceMeta ? JSON.stringify(artifact.maintenanceMeta) : null,
        artifact.boundary ? JSON.stringify(artifact.boundary) : null,
        artifact.createdAt,
        artifact.updatedAt,
      ],
    );

    for (const revision of artifact.history) {
      const revisionId = `${artifact.id}_rev${revision.revision}`;
      await client.query(
        `INSERT INTO artifact_revisions (
          id, artifact_id, revision_no, source_hash, files, submitted_at,
          submitted_by_user_id, script_descriptors, derived, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          revisionId,
          artifact.id,
          revision.revision,
          revision.sourceHash,
          JSON.stringify(revision.files),
          revision.submittedAt,
          revision.submittedByUserId,
          JSON.stringify(revision.scriptDescriptors),
          revision.derived ? JSON.stringify(revision.derived) : null,
          revision.submittedAt,
        ],
      );
      await upsertStructuredRevisionRows(client, artifact.id, revisionId, revision);
    }

    for (const event of artifact.lifecycleHistory) {
      await client.query(
        `INSERT INTO artifact_lifecycle_events (
          id, artifact_id, type, created_at, actor_user_id,
          submission_id, revision_no, state, note
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          event.id,
          artifact.id,
          event.type,
          event.createdAt,
          event.actorUserId,
          event.submissionId,
          event.revision,
          event.state,
          event.note,
        ],
      );
    }

    if (artifact.boundary) {
      await insertArtifactBoundarySubTables(client, artifact.id, artifact.boundary);
    }
    if (artifact.maintenanceMeta) {
      await upsertArtifactMaintenanceAssignment(client, artifact.id, artifact.maintenanceMeta);
    }
    if (artifact.agentReview) {
      await upsertArtifactAgentReview(client, artifact.id, artifact.agentReview);
    }
    await upsertArtifactMetadata(client, artifact.id, artifact.metadata);
    await syncRevisionCount(client, artifact.id);

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Append a revision to an existing artifact with row-level locking.
 */
export async function appendArtifactRevision(
  pool: Pool,
  artifactId: string,
  revision: SkillArtifactRevisionRecord,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<DrizzleSkillArtifactRow>(
      'SELECT * FROM skill_artifacts WHERE id = $1 FOR UPDATE',
      [artifactId],
    );

    if (rows.length === 0) {
      throw new Error(`Artifact ${artifactId} not found`);
    }

    const now = new Date().toISOString();
    const revisionId = `${artifactId}_rev${revision.revision}`;

    await client.query(
      `INSERT INTO artifact_revisions (
        id, artifact_id, revision_no, source_hash, files, submitted_at,
        submitted_by_user_id, script_descriptors, derived, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        revisionId,
        artifactId,
        revision.revision,
        revision.sourceHash,
        JSON.stringify(revision.files),
        revision.submittedAt,
        revision.submittedByUserId,
        JSON.stringify(revision.scriptDescriptors),
        revision.derived ? JSON.stringify(revision.derived) : null,
        revision.submittedAt,
      ],
    );
    await upsertStructuredRevisionRows(client, artifactId, revisionId, revision);

    await client.query(
      `UPDATE skill_artifacts
       SET title = $1, labels = $2, updated_at = $3
       WHERE id = $4`,
      // Note: title stays the same, labels could be updated via revision
      [rows[0]!.title, JSON.stringify(revision.files[0]?.path ?? []), now, artifactId],
    );

    await syncRevisionCount(client, artifactId);

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Update derived outputs on a specific revision with row-level locking.
 */
export async function updateRevisionDerivedData(
  pool: Pool,
  artifactId: string,
  revision: number,
  derived: SkillArtifactRecord['latestRevision']['derived'],
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<DrizzleSkillArtifactRow>(
      'SELECT * FROM skill_artifacts WHERE id = $1 FOR UPDATE',
      [artifactId],
    );

    if (rows.length === 0) {
      throw new Error(`Artifact ${artifactId} not found`);
    }

    const now = new Date().toISOString();

    await client.query(
      'UPDATE artifact_revisions SET derived = $1 WHERE artifact_id = $2 AND revision_no = $3',
      [derived ? JSON.stringify(derived) : null, artifactId, revision],
    );
    const revisionId = `${artifactId}_rev${revision}`;
    const revisionRecord = await getArtifactById(pool, artifactId);
    const targetRevision = revisionRecord?.history.find((item) => item.revision === revision);
    if (targetRevision) {
      await replaceStructuredDerivedRows(client, artifactId, revisionId, {
        ...targetRevision,
        derived,
      });
    }

    await client.query('UPDATE skill_artifacts SET updated_at = $1 WHERE id = $2', [
      now,
      artifactId,
    ]);

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Append a single lifecycle event to an artifact.
 */
export async function appendArtifactLifecycleEvent(
  pool: Pool,
  artifactId: string,
  event: SkillArtifactLifecycleEventRecord,
): Promise<void> {
  await pool.query(
    `INSERT INTO artifact_lifecycle_events (
      id, artifact_id, type, created_at, actor_user_id,
      submission_id, revision_no, state, note
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      event.id,
      artifactId,
      event.type,
      event.createdAt,
      event.actorUserId,
      event.submissionId,
      event.revision,
      event.state,
      event.note,
    ],
  );
}

/**
 * Update governance fields (labels, requiredLevel, title) with row-level locking.
 */
export async function updateArtifactGovernance(
  pool: Pool,
  artifactId: string,
  governance: { labels?: string[]; requiredLevel?: number; title?: string },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query<DrizzleSkillArtifactRow>(
      'SELECT * FROM skill_artifacts WHERE id = $1 FOR UPDATE',
      [artifactId],
    );

    if (rows.length === 0) {
      throw new Error(`Artifact ${artifactId} not found`);
    }

    const now = new Date().toISOString();
    const updates: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

    if (governance.labels !== undefined) {
      updates.push(`labels = $${paramIndex++}`);
      params.push(JSON.stringify(governance.labels));
    }
    if (governance.requiredLevel !== undefined) {
      updates.push(`required_level = $${paramIndex++}`);
      params.push(governance.requiredLevel);
    }
    if (governance.title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      params.push(governance.title);
    }

    updates.push(`updated_at = $${paramIndex++}`);
    params.push(now);

    params.push(artifactId);

    await client.query(
      `UPDATE skill_artifacts SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      params,
    );

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
