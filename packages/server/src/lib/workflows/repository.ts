import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import { workflowRuns } from '@trapmap/server/lib/persistence/schema.js';
import type {
  WorkflowRunSnapshot,
  WorkflowRunStatus,
  WorkflowRunUpdate,
  WorkflowType,
} from './types.js';

interface WorkflowRunRow {
  run_id: string;
  workflow_type: WorkflowType;
  subject_id: string;
  status: WorkflowRunStatus;
  step_name: string | null;
  attempt: number;
  started_at: Date | null;
  completed_at: Date | null;
  last_error: string | null;
  stats: Record<string, number | string | boolean | null>;
  created_at: Date;
  updated_at: Date;
}

function rowToSnapshot(row: WorkflowRunRow): WorkflowRunSnapshot {
  return {
    runId: row.run_id,
    workflowType: row.workflow_type,
    subjectId: row.subject_id,
    status: row.status,
    stepName: row.step_name,
    attempt: row.attempt,
    startedAt: row.started_at?.toISOString() ?? null,
    completedAt: row.completed_at?.toISOString() ?? null,
    lastError: row.last_error,
    stats: row.stats ?? {},
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function createWorkflowRepository(pool: Pool) {
  const db = drizzle(pool, { schema: { workflowRuns } });

  async function upsertRun(snapshot: WorkflowRunSnapshot): Promise<void> {
    await db
      .insert(workflowRuns)
      .values({
        runId: snapshot.runId,
        workflowType: snapshot.workflowType,
        subjectId: snapshot.subjectId,
        status: snapshot.status,
        stepName: snapshot.stepName,
        attempt: snapshot.attempt,
        startedAt: snapshot.startedAt ? new Date(snapshot.startedAt) : null,
        completedAt: snapshot.completedAt ? new Date(snapshot.completedAt) : null,
        lastError: snapshot.lastError,
        stats: snapshot.stats,
        createdAt: new Date(snapshot.createdAt),
        updatedAt: new Date(snapshot.updatedAt),
      })
      .onConflictDoUpdate({
        target: workflowRuns.runId,
        set: {
          status: snapshot.status,
          stepName: snapshot.stepName,
          attempt: snapshot.attempt,
          startedAt: snapshot.startedAt ? new Date(snapshot.startedAt) : null,
          completedAt: snapshot.completedAt ? new Date(snapshot.completedAt) : null,
          lastError: snapshot.lastError,
          stats: snapshot.stats,
          updatedAt: new Date(snapshot.updatedAt),
        },
      });
  }

  async function updateRun(runId: string, patch: WorkflowRunUpdate): Promise<void> {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.status !== undefined) updates.status = patch.status;
    if (patch.stepName !== undefined) updates.stepName = patch.stepName;
    if (patch.attempt !== undefined) updates.attempt = patch.attempt;
    if (patch.startedAt !== undefined) {
      updates.startedAt = patch.startedAt ? new Date(patch.startedAt) : null;
    }
    if (patch.completedAt !== undefined) {
      updates.completedAt = patch.completedAt ? new Date(patch.completedAt) : null;
    }
    if (patch.lastError !== undefined) updates.lastError = patch.lastError;
    if (patch.stats !== undefined) updates.stats = patch.stats;

    await db.update(workflowRuns).set(updates).where(eq(workflowRuns.runId, runId));
  }

  async function getByRunId(runId: string): Promise<WorkflowRunSnapshot | null> {
    const result = await pool.query<WorkflowRunRow>(
      'SELECT * FROM workflow_runs WHERE run_id = $1 LIMIT 1',
      [runId],
    );
    return result.rows[0] ? rowToSnapshot(result.rows[0]) : null;
  }

  async function listRecent(limit = 25): Promise<WorkflowRunSnapshot[]> {
    const result = await pool.query<WorkflowRunRow>(
      'SELECT * FROM workflow_runs ORDER BY updated_at DESC LIMIT $1',
      [limit],
    );
    return result.rows.map(rowToSnapshot);
  }

  async function listByWorkflowType(
    workflowType: WorkflowType,
    limit = 25,
  ): Promise<WorkflowRunSnapshot[]> {
    const result = await pool.query<WorkflowRunRow>(
      'SELECT * FROM workflow_runs WHERE workflow_type = $1 ORDER BY updated_at DESC LIMIT $2',
      [workflowType, limit],
    );
    return result.rows.map(rowToSnapshot);
  }

  return {
    upsertRun,
    updateRun,
    getByRunId,
    listRecent,
    listByWorkflowType,
  };
}
