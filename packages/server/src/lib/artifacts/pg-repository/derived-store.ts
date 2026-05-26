/**
 * Derived artifact sub-table operations.
 *
 * Handles insert/update/load for boundary sub-tables,
 * maintenance assignments, agent reviews, and metadata.
 */

import type { Boundary } from '@trapmap/contracts';
import type { Pool } from 'pg';

import type {
  AgentReviewRecord,
  MaintenanceMetaRecord,
  SkillArtifactMetadataRecord,
} from '@trapmap/server/lib/store.js';

import type {
  ArtifactAgentReviewRow,
  ArtifactMaintenanceAssignmentRow,
  ArtifactMetadataRow,
} from './record-reconstruction.js';

// =============================================================================
// Insert / Upsert Helpers
// =============================================================================

export async function insertArtifactBoundarySubTables(
  client: Pick<Pool, 'query'>,
  artifactId: string,
  boundary: Boundary,
): Promise<void> {
  for (const context of boundary.context) {
    await client.query(
      'INSERT INTO skill_artifact_boundary_contexts (artifact_id, context_value) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [artifactId, context],
    );
  }
  for (const version of boundary.versions) {
    await client.query(
      'INSERT INTO skill_artifact_boundary_versions (artifact_id, package_name, range_value, note) VALUES ($1, $2, $3, $4)',
      [artifactId, version.package, version.range, version.note ?? null],
    );
  }
  for (const prerequisite of boundary.prerequisites) {
    await client.query(
      'INSERT INTO skill_artifact_boundary_prerequisites (artifact_id, description, kind, required) VALUES ($1, $2, $3, $4)',
      [
        artifactId,
        prerequisite.description,
        prerequisite.kind ?? null,
        prerequisite.required ? 1 : 0,
      ],
    );
  }
  for (const signal of boundary.signals) {
    await client.query(
      'INSERT INTO skill_artifact_boundary_signals (artifact_id, pattern, kind, description) VALUES ($1, $2, $3, $4)',
      [artifactId, signal.pattern, signal.kind, signal.description ?? null],
    );
  }
  for (const exclusion of boundary.exclusions) {
    await client.query(
      'INSERT INTO skill_artifact_boundary_exclusions (artifact_id, description, kind) VALUES ($1, $2, $3)',
      [artifactId, exclusion.description, exclusion.kind ?? null],
    );
  }
  for (const evidence of boundary.evidence) {
    await client.query(
      'INSERT INTO skill_artifact_boundary_evidence (artifact_id, kind, identifier, url, note) VALUES ($1, $2, $3, $4, $5)',
      [artifactId, evidence.kind, evidence.identifier, evidence.url ?? null, evidence.note ?? null],
    );
  }
}

export async function upsertArtifactMaintenanceAssignment(
  client: Pick<Pool, 'query'>,
  artifactId: string,
  maintenanceMeta: MaintenanceMetaRecord,
): Promise<void> {
  await client.query(
    `INSERT INTO skill_artifact_maintenance_assignments (
      artifact_id, maintainer_user_id, maintainer_handle, maintainer_level, review_by, updated_at
    ) VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (artifact_id) DO UPDATE SET
      maintainer_user_id = EXCLUDED.maintainer_user_id,
      maintainer_handle = EXCLUDED.maintainer_handle,
      maintainer_level = EXCLUDED.maintainer_level,
      review_by = EXCLUDED.review_by,
      updated_at = NOW()`,
    [
      artifactId,
      maintenanceMeta.maintainerUserId,
      maintenanceMeta.maintainerHandle,
      maintenanceMeta.maintainerLevel,
      maintenanceMeta.reviewBy,
    ],
  );
}

export async function upsertArtifactAgentReview(
  client: Pick<Pool, 'query'>,
  artifactId: string,
  agentReview: AgentReviewRecord,
): Promise<void> {
  await client.query(
    `INSERT INTO skill_artifact_agent_reviews (
      artifact_id, status, duplicate_risk, correctness_risk, completeness_risk, checked_at, notes, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    ON CONFLICT (artifact_id) DO UPDATE SET
      status = EXCLUDED.status,
      duplicate_risk = EXCLUDED.duplicate_risk,
      correctness_risk = EXCLUDED.correctness_risk,
      completeness_risk = EXCLUDED.completeness_risk,
      checked_at = EXCLUDED.checked_at,
      notes = EXCLUDED.notes,
      updated_at = NOW()`,
    [
      artifactId,
      agentReview.status,
      agentReview.duplicateRisk,
      agentReview.correctnessRisk,
      agentReview.completenessRisk,
      agentReview.checkedAt,
      JSON.stringify(agentReview.notes),
    ],
  );
}

export async function upsertArtifactMetadata(
  client: Pick<Pool, 'query'>,
  artifactId: string,
  metadata: SkillArtifactMetadataRecord,
): Promise<void> {
  await client.query(
    `INSERT INTO skill_artifact_metadata (
      artifact_id, source_kind, submission_count, resubmission_count, revision_count,
      latest_submission_id, latest_submitted_at, latest_reviewed_at, latest_decision, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
    ON CONFLICT (artifact_id) DO UPDATE SET
      source_kind = EXCLUDED.source_kind,
      submission_count = EXCLUDED.submission_count,
      resubmission_count = EXCLUDED.resubmission_count,
      revision_count = EXCLUDED.revision_count,
      latest_submission_id = EXCLUDED.latest_submission_id,
      latest_submitted_at = EXCLUDED.latest_submitted_at,
      latest_reviewed_at = EXCLUDED.latest_reviewed_at,
      latest_decision = EXCLUDED.latest_decision,
      updated_at = NOW()`,
    [
      artifactId,
      metadata.sourceKind,
      metadata.submissionCount,
      metadata.resubmissionCount,
      metadata.revisionCount,
      metadata.latestSubmissionId,
      metadata.latestSubmittedAt,
      metadata.latestReviewedAt,
      metadata.latestDecision,
    ],
  );
}

// =============================================================================
// Load Helpers
// =============================================================================

export async function loadArtifactBoundaryFromSubTables(
  pool: Pool,
  artifactId: string,
): Promise<Boundary | null> {
  const [contexts, versions, prerequisites, signals, exclusions, evidence] = await Promise.all([
    pool.query<{ context_value: string }>(
      'SELECT context_value FROM skill_artifact_boundary_contexts WHERE artifact_id = $1 ORDER BY context_value',
      [artifactId],
    ),
    pool.query<{ package_name: string; range_value: string; note: string | null }>(
      'SELECT package_name, range_value, note FROM skill_artifact_boundary_versions WHERE artifact_id = $1 ORDER BY id',
      [artifactId],
    ),
    pool.query<{ description: string; kind: string | null; required: number }>(
      'SELECT description, kind, required FROM skill_artifact_boundary_prerequisites WHERE artifact_id = $1 ORDER BY id',
      [artifactId],
    ),
    pool.query<{ pattern: string; kind: string; description: string | null }>(
      'SELECT pattern, kind, description FROM skill_artifact_boundary_signals WHERE artifact_id = $1 ORDER BY id',
      [artifactId],
    ),
    pool.query<{ description: string; kind: string | null }>(
      'SELECT description, kind FROM skill_artifact_boundary_exclusions WHERE artifact_id = $1 ORDER BY id',
      [artifactId],
    ),
    pool.query<{ kind: string; identifier: string; url: string | null; note: string | null }>(
      'SELECT kind, identifier, url, note FROM skill_artifact_boundary_evidence WHERE artifact_id = $1 ORDER BY id',
      [artifactId],
    ),
  ]);

  if (
    contexts.rows.length === 0 &&
    versions.rows.length === 0 &&
    prerequisites.rows.length === 0 &&
    signals.rows.length === 0 &&
    exclusions.rows.length === 0 &&
    evidence.rows.length === 0
  ) {
    return null;
  }

  return {
    context: contexts.rows.map((row) => row.context_value),
    versions: versions.rows.map((row) => ({
      package: row.package_name,
      range: row.range_value,
      note: row.note ?? undefined,
    })),
    prerequisites: prerequisites.rows.map((row) => ({
      description: row.description,
      kind: (row.kind ?? undefined) as any,
      required: row.required === 1,
    })),
    signals: signals.rows.map((row) => ({
      pattern: row.pattern,
      kind: row.kind as any,
      description: row.description ?? undefined,
    })),
    exclusions: exclusions.rows.map((row) => ({
      description: row.description,
      kind: (row.kind ?? undefined) as any,
    })),
    evidence: evidence.rows.map((row) => ({
      kind: row.kind as any,
      identifier: row.identifier,
      url: row.url ?? undefined,
      note: row.note ?? undefined,
    })),
  };
}

export async function loadArtifactMaintenanceMeta(
  pool: Pool,
  artifactId: string,
): Promise<MaintenanceMetaRecord | null> {
  const result = await pool.query<ArtifactMaintenanceAssignmentRow>(
    'SELECT * FROM skill_artifact_maintenance_assignments WHERE artifact_id = $1',
    [artifactId],
  );
  if (result.rows.length === 0) {
    return null;
  }
  const row = result.rows[0]!;
  return {
    maintainerUserId: row.maintainer_user_id,
    maintainerHandle: row.maintainer_handle,
    maintainerLevel: row.maintainer_level,
    reviewBy: row.review_by ? row.review_by.toISOString() : null,
  };
}

export async function loadArtifactAgentReview(
  pool: Pool,
  artifactId: string,
): Promise<AgentReviewRecord | null> {
  const result = await pool.query<ArtifactAgentReviewRow>(
    'SELECT * FROM skill_artifact_agent_reviews WHERE artifact_id = $1',
    [artifactId],
  );
  if (result.rows.length === 0) {
    return null;
  }
  const row = result.rows[0]!;
  return {
    status: row.status,
    duplicateRisk: row.duplicate_risk,
    correctnessRisk: row.correctness_risk,
    completenessRisk: row.completeness_risk,
    checkedAt: row.checked_at.toISOString(),
    notes: row.notes,
  };
}

export async function loadArtifactMetadata(
  pool: Pool,
  artifactId: string,
): Promise<SkillArtifactMetadataRecord | null> {
  const result = await pool.query<ArtifactMetadataRow>(
    'SELECT * FROM skill_artifact_metadata WHERE artifact_id = $1',
    [artifactId],
  );
  if (result.rows.length === 0) {
    return null;
  }
  const row = result.rows[0]!;
  return {
    sourceKind: row.source_kind,
    submissionCount: row.submission_count,
    resubmissionCount: row.resubmission_count,
    revisionCount: row.revision_count,
    latestSubmissionId: row.latest_submission_id,
    latestSubmittedAt: row.latest_submitted_at ? row.latest_submitted_at.toISOString() : null,
    latestReviewedAt: row.latest_reviewed_at ? row.latest_reviewed_at.toISOString() : null,
    latestDecision: row.latest_decision,
  };
}
