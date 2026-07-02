/**
 * Lifecycle state transition operations for PgArtifactRepository.
 *
 * Contains updateArtifactLifecycle which validates transitions via the
 * state machine and records the resulting lifecycle event inside a
 * row-level-locked transaction.
 */

import type { LifecycleState } from '@trapmap/contracts';
import type { Pool } from 'pg';

import { transitionLifecycleState } from '@trapmap/server/lib/lifecycle/index.js';
import type {
  SkillArtifactLifecycleEventRecord,
  SkillArtifactRecord,
} from '@trapmap/server/lib/store.js';

import { type DrizzleSkillArtifactRow, rowToSkillArtifact } from './record-reconstruction.js';

/**
 * Update the lifecycle state of an artifact with row-level locking.
 * Validates the transition using the state machine, records a lifecycle
 * event, and returns the updated artifact record.
 */
export async function updateArtifactLifecycle(
  pool: Pool,
  artifactId: string,
  newState: LifecycleState,
  context: { actorId: string; note?: string },
): Promise<SkillArtifactRecord> {
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

    const artifact = rowToSkillArtifact(rows[0]!);

    // Validate transition using state machine
    transitionLifecycleState(artifact, newState, context.note ?? 'update');

    const now = new Date().toISOString();
    const eventId = `ale_${artifactId}_${Date.now()}`;

    await client.query(
      'UPDATE skill_artifacts SET lifecycle_state = $1, updated_at = $2 WHERE id = $3',
      [newState, now, artifactId],
    );

    await client.query(
      `INSERT INTO artifact_lifecycle_events (id, artifact_id, type, created_at, actor_user_id, state, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [eventId, artifactId, 'updated', now, context.actorId, newState, context.note ?? null],
    );

    await client.query('COMMIT');

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
