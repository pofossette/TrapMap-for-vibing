/**
 * PostgreSQL-backed implementation of ArtifactRepository.
 *
 * Uses row-level SELECT FOR UPDATE locking for safe concurrent operations.
 * Each skill artifact is stored as a separate row with related revisions
 * and lifecycle events in child tables.
 *
 * This module delegates to focused helpers:
 * - record-reconstruction.ts: row-to-record mapping and full record assembly
 * - revision-reader.ts: structured revision data loading
 * - revision-writer.ts: structured revision data writing
 * - derived-store.ts: boundary, maintenance, agent review, metadata CRUD
 *
 * Phase: 63 (WRITE-03)
 */

import type { LifecycleState } from '@trapmap/contracts';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import type { ArtifactRepository } from '@trapmap/server/lib/artifacts/repository.js';
import { transitionLifecycleState } from '@trapmap/server/lib/lifecycle/state-machine.js';
import { skillArtifacts } from '@trapmap/server/lib/persistence/schema.js';
import type {
  SkillArtifactLifecycleEventRecord,
  SkillArtifactRecord,
  SkillArtifactRevisionRecord,
} from '@trapmap/server/lib/store.js';

import {
  insertArtifactBoundarySubTables,
  loadArtifactAgentReview,
  loadArtifactBoundaryFromSubTables,
  loadArtifactMaintenanceMeta,
  loadArtifactMetadata,
  upsertArtifactAgentReview,
  upsertArtifactMaintenanceAssignment,
  upsertArtifactMetadata,
} from './derived-store.js';
import {
  type DrizzleArtifactLifecycleEventRow,
  type DrizzleArtifactRevisionRow,
  type DrizzleSkillArtifactRow,
  reconstructSkillArtifactRecord,
  rowToSkillArtifact,
} from './record-reconstruction.js';
import { loadStructuredRevisionData } from './revision-reader.js';
import {
  replaceStructuredDerivedRows,
  syncRevisionCount,
  upsertStructuredRevisionRows,
} from './revision-writer.js';

/**
 * PostgreSQL-backed repository for skill artifact CRUD operations.
 * Implements row-level locking for concurrent-safe updates.
 */
export class PgArtifactRepository implements ArtifactRepository {
  constructor(private readonly pool: Pool) {
    drizzle(pool, {
      schema: { skillArtifacts },
    });
  }

  /**
   * Generate a new unique artifact ID using PostgreSQL SEQUENCE.
   */
  async nextId(): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      "SELECT nextval('skill_artifact_id_seq')::text AS id",
    );
    return `artifact_${result.rows[0]!.id}`;
  }

  /**
   * Insert a new artifact with all related data.
   */
  async insert(artifact: SkillArtifactRecord): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Insert into skill_artifacts
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

      // Insert all revisions
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

      // Insert all lifecycle events
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
   * Get an artifact by ID with all related data.
   */
  async getById(artifactId: string): Promise<SkillArtifactRecord | null> {
    // Query the artifact
    const artifactResult = await this.pool.query<DrizzleSkillArtifactRow>(
      'SELECT * FROM skill_artifacts WHERE id = $1',
      [artifactId],
    );

    if (artifactResult.rows.length === 0) {
      return null;
    }

    const artifactRow = artifactResult.rows[0]!;

    // Query revisions
    const revisionsResult = await this.pool.query<DrizzleArtifactRevisionRow>(
      'SELECT * FROM artifact_revisions WHERE artifact_id = $1 ORDER BY revision_no',
      [artifactId],
    );
    const revisionIds = revisionsResult.rows.map((row) => row.id);
    const structured = await loadStructuredRevisionData(this.pool, revisionIds);

    // Query lifecycle events
    const eventsResult = await this.pool.query<DrizzleArtifactLifecycleEventRow>(
      'SELECT * FROM artifact_lifecycle_events WHERE artifact_id = $1 ORDER BY created_at',
      [artifactId],
    );
    const boundary = await loadArtifactBoundaryFromSubTables(this.pool, artifactId);
    const maintenanceMeta = await loadArtifactMaintenanceMeta(this.pool, artifactId);
    const agentReview = await loadArtifactAgentReview(this.pool, artifactId);
    const metadata = await loadArtifactMetadata(this.pool, artifactId);

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
   * Update lifecycle state with row-level locking.
   * Returns the updated artifact record with appended lifecycle history.
   */
  async updateLifecycle(
    artifactId: string,
    newState: LifecycleState,
    context: { actorId: string; note?: string },
  ): Promise<SkillArtifactRecord> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the row for update
      const { rows } = await client.query<DrizzleSkillArtifactRow>(
        'SELECT * FROM skill_artifacts WHERE id = $1 FOR UPDATE',
        [artifactId],
      );

      if (rows.length === 0) {
        throw new Error(`Artifact ${artifactId} not found`);
      }

      const artifact = rowToSkillArtifact(rows[0]!);

      // Validate transition using state machine
      transitionLifecycleState(artifact, newState, context.note ?? 'update');

      const now = new Date().toISOString();
      const eventId = `ale_${artifactId}_${Date.now()}`;

      // Update the artifact
      await client.query(
        'UPDATE skill_artifacts SET lifecycle_state = $1, updated_at = $2 WHERE id = $3',
        [newState, now, artifactId],
      );

      // Insert lifecycle event
      await client.query(
        `INSERT INTO artifact_lifecycle_events (id, artifact_id, type, created_at, actor_user_id, state, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          eventId,
          artifactId,
          'updated',
          now,
          context.actorId,
          newState,
          context.note ?? null,
        ],
      );

      await client.query('COMMIT');

      // Build and return the updated record with the lifecycle event appended
      const nextEvent: SkillArtifactLifecycleEventRecord = {
        id: eventId,
        type: 'updated',
        createdAt: now,
        actorUserId: context.actorId,
        submissionId: null,
        revision: null,
        state: newState,
        note: context.note ?? null,
      };

      return {
        ...artifact,
        lifecycleState: newState,
        updatedAt: now,
        lifecycleHistory: [...artifact.lifecycleHistory, nextEvent],
      };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  /**
   * Append a revision with row-level locking.
   */
  async appendRevision(artifactId: string, revision: SkillArtifactRevisionRecord): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the row for update
      const { rows } = await client.query<DrizzleSkillArtifactRow>(
        'SELECT * FROM skill_artifacts WHERE id = $1 FOR UPDATE',
        [artifactId],
      );

      if (rows.length === 0) {
        throw new Error(`Artifact ${artifactId} not found`);
      }

      const now = new Date().toISOString();
      const revisionId = `${artifactId}_rev${revision.revision}`;

      // Insert the revision
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

      // Update the artifact's latest revision columns
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
   * Update derived outputs on a specific revision.
   */
  async updateRevisionDerived(
    artifactId: string,
    revision: number,
    derived: SkillArtifactRecord['latestRevision']['derived'],
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the artifact row for update
      const { rows } = await client.query<DrizzleSkillArtifactRow>(
        'SELECT * FROM skill_artifacts WHERE id = $1 FOR UPDATE',
        [artifactId],
      );

      if (rows.length === 0) {
        throw new Error(`Artifact ${artifactId} not found`);
      }

      const now = new Date().toISOString();

      // Update the revision's derived column
      await client.query(
        'UPDATE artifact_revisions SET derived = $1 WHERE artifact_id = $2 AND revision_no = $3',
        [derived ? JSON.stringify(derived) : null, artifactId, revision],
      );
      const revisionId = `${artifactId}_rev${revision}`;
      const revisionRecord = await this.getById(artifactId);
      const targetRevision = revisionRecord?.history.find((item) => item.revision === revision);
      if (targetRevision) {
        await replaceStructuredDerivedRows(client, artifactId, revisionId, {
          ...targetRevision,
          derived,
        });
      }

      // Update the artifact's updated_at
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
   * Append a lifecycle event.
   */
  async appendLifecycleEvent(
    artifactId: string,
    event: SkillArtifactLifecycleEventRecord,
  ): Promise<void> {
    await this.pool.query(
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
   * List artifacts by filter criteria.
   * Returns lightweight records without full revision history.
   */
  async listByFilter(filter: {
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
    maintainerUserId?: string;
  }): Promise<SkillArtifactRecord[]> {
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

    const result = await this.pool.query<DrizzleSkillArtifactRow>(
      `SELECT skill_artifacts.* FROM skill_artifacts ${joinClause} ${whereClause}`,
      params,
    );

    // Return lightweight records (without full history)
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
   * Update governance fields with row-level locking.
   */
  async updateGovernance(
    artifactId: string,
    governance: { labels?: string[]; requiredLevel?: number; title?: string },
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the row for update
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
}
