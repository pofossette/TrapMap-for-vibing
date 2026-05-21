/**
 * PostgreSQL-backed implementation of ArtifactRepository.
 *
 * Uses row-level SELECT FOR UPDATE locking for safe concurrent operations.
 * Each skill artifact is stored as a separate row with related revisions
 * and lifecycle events in child tables.
 *
 * Phase: 63 (WRITE-03)
 */

import type { Boundary, DecayMeta, EvidenceMeta, LifecycleState, Scope } from '@trapmap/contracts';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import { transitionLifecycleState } from '../lifecycle/state-machine.js';
import { skillArtifacts } from '../persistence/schema.js';
import type {
  AgentReviewRecord,
  MaintenanceMetaRecord,
  SkillArtifactLifecycleEventRecord,
  SkillArtifactMetadataRecord,
  SkillArtifactRecord,
  SkillArtifactRevisionRecord,
  SkillScriptDescriptorRecord,
  StoredScriptActivationPolicy,
} from '../store.js';
import type { ArtifactRepository } from './repository.js';

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
   */
  async updateLifecycle(
    artifactId: string,
    newState: LifecycleState,
    context: { actorId: string; note?: string },
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

      const artifact = rowToSkillArtifact(rows[0]!);

      // Validate transition using state machine
      transitionLifecycleState(artifact, newState, context.note ?? 'update');

      const now = new Date().toISOString();

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
          `ale_${artifactId}_${Date.now()}`,
          artifactId,
          'updated',
          now,
          context.actorId,
          newState,
          context.note ?? null,
        ],
      );

      await client.query('COMMIT');
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

// =============================================================================
// Helper Types for Drizzle Rows
// =============================================================================

/**
 * Database row shape for skill_artifacts table.
 * Drizzle returns snake_case column names from PostgreSQL.
 */
interface DrizzleSkillArtifactRow {
  id: string;
  team_id: string | null;
  scope: string;
  labels: string[];
  title: string;
  slug: string;
  required_level: number;
  lifecycle_state: LifecycleState;
  owner_user_id: string;
  metadata: SkillArtifactMetadataRecord;
  agent_review: AgentReviewRecord | null;
  maintenance_meta: {
    maintainerUserId: string | null;
    maintainerHandle: string | null;
    maintainerLevel: number | null;
    reviewBy: string | null;
  } | null;
  decay_meta: {
    lastVerifiedAt: string;
    decayState: string;
    supersededById: string | null;
    decayStateComputedAt: string;
    freshnessType: string;
  } | null;
  evidence_meta: {
    sourceType: string;
    sourceRef?: string;
    evidenceLevel: string;
    verifiedAt: string;
    verifiedBy: { userId: string };
  } | null;
  boundary: Boundary | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * File record shape for JSONB column in artifact_revisions.
 */
interface ArtifactRevisionFileRow {
  path: string;
  kind: 'skill-markdown' | 'reference' | 'asset' | 'script';
  sha256: string;
  sizeBytes: number;
  mediaType: string;
  source: 'references/' | 'assets/' | 'scripts/' | 'SKILL.md';
  includeInDerivation: boolean;
  activationOnly: boolean;
}

/**
 * Script descriptor shape for JSONB column in artifact_revisions.
 */
interface ArtifactScriptDescriptorRow {
  path: string;
  sha256: string;
  capability: string;
  argsSchemaSummary: string;
  sideEffectSummary: string;
  defaultPolicy: StoredScriptActivationPolicy;
}

/**
 * Derived outputs shape for JSONB column in artifact_revisions.
 */
interface ArtifactDerivedRow {
  profile: {
    artifactId: string;
    revision: number;
    sourceHash: string;
    title: string;
    summary: string;
    keywords: string[];
    referencePaths: string[];
    contentHash: string;
  } | null;
  capsules: Array<{
    capsuleId: string;
    artifactId: string;
    revision: number;
    sourcePaths: string[];
    content: string;
    situation: string;
    problem: string;
    goal: string;
    errorText: string | null;
    labels: string[];
    scope: Scope;
    requiredLevel: number;
  }>;
  clientManifest: {
    artifactId: string;
    revision: number;
    references: Array<{
      path: string;
      sha256: string;
      sizeBytes: number;
      mediaType: string;
    }>;
    assets: Array<{
      path: string;
      sha256: string;
      sizeBytes: number;
      mediaType: string;
    }>;
    scripts: Array<{
      path: string;
      sha256: string;
      capability: string;
      argsSchemaSummary: string;
      sideEffectSummary: string;
      defaultPolicy: StoredScriptActivationPolicy;
    }>;
    sourceHash: string;
  } | null;
  sourceHash: string;
  derivedAt: string;
}

/**
 * Database row shape for artifact_revisions table.
 */
interface DrizzleArtifactRevisionRow {
  id: string;
  artifact_id: string;
  revision_no: number;
  source_hash: string;
  files: ArtifactRevisionFileRow[];
  submitted_at: Date;
  submitted_by_user_id: string;
  script_descriptors: ArtifactScriptDescriptorRow[];
  derived: ArtifactDerivedRow | null;
  created_at: Date;
}

interface StructuredRevisionData {
  files: ArtifactRevisionFileRow[];
  scriptDescriptors: ArtifactScriptDescriptorRow[];
  derived: ArtifactDerivedRow | null;
}

interface ArtifactMaintenanceAssignmentRow {
  artifact_id: string;
  maintainer_user_id: string | null;
  maintainer_handle: string | null;
  maintainer_level: number | null;
  review_by: Date | null;
}

interface ArtifactAgentReviewRow {
  artifact_id: string;
  status: 'agent-pass' | 'agent-rejected';
  duplicate_risk: 'low' | 'medium' | 'high';
  correctness_risk: 'low' | 'medium' | 'high';
  completeness_risk: 'low' | 'medium' | 'high';
  checked_at: Date;
  notes: string[];
}

interface ArtifactMetadataRow {
  artifact_id: string;
  source_kind: 'skill-directory' | 'single-skill-md' | 'legacy-knowledge';
  submission_count: number;
  resubmission_count: number;
  revision_count: number;
  latest_submission_id: string | null;
  latest_submitted_at: Date | null;
  latest_reviewed_at: Date | null;
  latest_decision: 'approve' | 'reject' | null;
}

/**
 * Database row shape for artifact_lifecycle_events table.
 */
interface DrizzleArtifactLifecycleEventRow {
  id: string;
  artifact_id: string;
  type:
    | 'submitted'
    | 'resubmitted'
    | 'agent-reviewed'
    | 'reviewer-approved'
    | 'reviewer-rejected'
    | 'updated'
    | 'deactivated';
  created_at: Date;
  actor_user_id: string | null;
  submission_id: string | null;
  revision_no: number | null;
  state: LifecycleState;
  note: string | null;
}

// =============================================================================
// Helper Functions for Row-to-Record Mapping
// =============================================================================

/**
 * Map a Drizzle row to partial SkillArtifactRecord fields.
 */
function rowToSkillArtifact(row: DrizzleSkillArtifactRow): SkillArtifactRecord {
  return {
    id: row.id,
    teamId: row.team_id,
    scope: row.scope as 'global' | 'project',
    labels: row.labels,
    title: row.title,
    slug: row.slug,
    requiredLevel: row.required_level,
    lifecycleState: row.lifecycle_state,
    ownerUserId: row.owner_user_id,
    metadata: row.metadata,
    agentReview: row.agent_review,
    maintenanceMeta: row.maintenance_meta,
    decayMeta: row.decay_meta as DecayMeta | null,
    evidenceMeta: row.evidence_meta as EvidenceMeta | null,
    boundary: row.boundary,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    // These fields are populated separately
    latestRevision: {
      revision: 0,
      sourceHash: '',
      files: [],
      submittedAt: row.created_at.toISOString(),
      submittedByUserId: row.owner_user_id,
      scriptDescriptors: [],
      derived: null,
    },
    history: [],
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
  };
}

/**
 * Map a Drizzle revision row to SkillArtifactRevisionRecord.
 */
function rowToArtifactRevision(row: DrizzleArtifactRevisionRow): SkillArtifactRevisionRecord {
  return {
    revision: row.revision_no,
    sourceHash: row.source_hash,
    files: row.files,
    submittedAt: row.submitted_at.toISOString(),
    submittedByUserId: row.submitted_by_user_id,
    scriptDescriptors: row.script_descriptors,
    derived: row.derived,
  };
}

function buildDerivedFromStructured(
  data: StructuredRevisionData,
  fallback: ArtifactDerivedRow | null,
): ArtifactDerivedRow | null {
  if (data.derived !== null) {
    return data.derived;
  }
  return fallback;
}

/**
 * Map a Drizzle lifecycle event row to SkillArtifactLifecycleEventRecord.
 */
function rowToArtifactLifecycleEvent(
  row: DrizzleArtifactLifecycleEventRow,
): SkillArtifactLifecycleEventRecord {
  return {
    id: row.id,
    type: row.type,
    createdAt: row.created_at.toISOString(),
    actorUserId: row.actor_user_id,
    submissionId: row.submission_id,
    revision: row.revision_no,
    state: row.state,
    note: row.note,
  };
}

/**
 * Reconstruct a full SkillArtifactRecord from database rows.
 */
function reconstructSkillArtifactRecord(
  artifactRow: DrizzleSkillArtifactRow,
  revisionRows: DrizzleArtifactRevisionRow[],
  eventRows: DrizzleArtifactLifecycleEventRow[],
  structuredRows: Map<string, StructuredRevisionData>,
  boundary: Boundary | null,
  maintenanceMeta: MaintenanceMetaRecord | null,
  agentReview: AgentReviewRecord | null,
  metadata: SkillArtifactMetadataRecord | null,
): SkillArtifactRecord {
  const artifact = rowToSkillArtifact(artifactRow);
  artifact.metadata = metadata ?? artifact.metadata;
  artifact.boundary = boundary ?? artifact.boundary;
  artifact.maintenanceMeta = maintenanceMeta ?? artifact.maintenanceMeta;
  artifact.agentReview = agentReview ?? artifact.agentReview;

  // Populate revisions
  const revisions = revisionRows.map((row) => {
    const structured = structuredRows.get(row.id);
    if (!structured) {
      return rowToArtifactRevision(row);
    }
    return {
      revision: row.revision_no,
      sourceHash: row.source_hash,
      files: structured.files,
      submittedAt: row.submitted_at.toISOString(),
      submittedByUserId: row.submitted_by_user_id,
      scriptDescriptors: structured.scriptDescriptors,
      derived: buildDerivedFromStructured(structured, row.derived),
    };
  });
  artifact.history = revisions;
  if (revisions.length > 0) {
    artifact.latestRevision = revisions[revisions.length - 1]!;
  }

  // Populate lifecycle events
  artifact.lifecycleHistory = eventRows.map(rowToArtifactLifecycleEvent);

  return artifact;
}

async function upsertStructuredRevisionRows(
  client: Pick<Pool, 'query'>,
  artifactId: string,
  revisionId: string,
  revision: SkillArtifactRevisionRecord,
): Promise<void> {
  await client.query('DELETE FROM skill_artifact_files WHERE artifact_revision_id = $1', [
    revisionId,
  ]);
  for (const file of revision.files) {
    await client.query(
      `INSERT INTO skill_artifact_files (
        artifact_revision_id, artifact_id, revision_no, path, kind, sha256, size_bytes, media_type,
        source_group, include_in_derivation, activation_only
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        revisionId,
        artifactId,
        revision.revision,
        file.path,
        file.kind,
        file.sha256,
        file.sizeBytes,
        file.mediaType,
        file.source,
        file.includeInDerivation ? 1 : 0,
        file.activationOnly ? 1 : 0,
      ],
    );
  }

  await client.query(
    'DELETE FROM skill_artifact_script_descriptors WHERE artifact_revision_id = $1',
    [revisionId],
  );
  for (const descriptor of revision.scriptDescriptors) {
    await client.query(
      `INSERT INTO skill_artifact_script_descriptors (
        artifact_revision_id, artifact_id, revision_no, path, sha256, capability, args_schema_summary,
        side_effect_summary, default_policy
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        revisionId,
        artifactId,
        revision.revision,
        descriptor.path,
        descriptor.sha256,
        descriptor.capability,
        descriptor.argsSchemaSummary,
        descriptor.sideEffectSummary,
        descriptor.defaultPolicy,
      ],
    );
  }

  await replaceStructuredDerivedRows(client, artifactId, revisionId, revision);
}

async function replaceStructuredDerivedRows(
  client: Pick<Pool, 'query'>,
  artifactId: string,
  revisionId: string,
  revision: SkillArtifactRevisionRecord,
): Promise<void> {
  await client.query('DELETE FROM skill_artifact_profiles WHERE artifact_revision_id = $1', [
    revisionId,
  ]);
  await client.query('DELETE FROM skill_artifact_capsules WHERE artifact_revision_id = $1', [
    revisionId,
  ]);
  await client.query(
    'DELETE FROM skill_artifact_manifest_references WHERE artifact_revision_id = $1',
    [revisionId],
  );
  await client.query('DELETE FROM skill_artifact_manifest_assets WHERE artifact_revision_id = $1', [
    revisionId,
  ]);
  await client.query(
    'DELETE FROM skill_artifact_manifest_scripts WHERE artifact_revision_id = $1',
    [revisionId],
  );
  await client.query(
    'DELETE FROM skill_artifact_client_manifests WHERE artifact_revision_id = $1',
    [revisionId],
  );

  if (!revision.derived) {
    return;
  }

  if (revision.derived.profile) {
    await client.query(
      `INSERT INTO skill_artifact_profiles (
        artifact_revision_id, artifact_id, revision_no, source_hash, title, summary, keywords, reference_paths, content_hash
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        revisionId,
        artifactId,
        revision.revision,
        revision.derived.profile.sourceHash,
        revision.derived.profile.title,
        revision.derived.profile.summary,
        JSON.stringify(revision.derived.profile.keywords),
        JSON.stringify(revision.derived.profile.referencePaths),
        revision.derived.profile.contentHash,
      ],
    );
  }

  for (const capsule of revision.derived.capsules) {
    await client.query(
      `INSERT INTO skill_artifact_capsules (
        capsule_id, artifact_revision_id, artifact_id, revision_no, source_hash, source_paths, content, situation,
        problem, goal, error_text, contextual_prefix, labels, scope, required_level
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        capsule.capsuleId,
        revisionId,
        artifactId,
        revision.revision,
        revision.derived.sourceHash,
        JSON.stringify(capsule.sourcePaths),
        capsule.content,
        capsule.situation,
        capsule.problem,
        capsule.goal,
        capsule.errorText,
        capsule.contextualPrefix ?? null,
        JSON.stringify(capsule.labels),
        capsule.scope,
        capsule.requiredLevel,
      ],
    );
  }

  if (revision.derived.clientManifest) {
    await client.query(
      `INSERT INTO skill_artifact_client_manifests (
        artifact_revision_id, artifact_id, revision_no, source_hash
      ) VALUES ($1,$2,$3,$4)`,
      [revisionId, artifactId, revision.revision, revision.derived.clientManifest.sourceHash],
    );

    for (const item of revision.derived.clientManifest.references) {
      await client.query(
        `INSERT INTO skill_artifact_manifest_references (
          artifact_revision_id, path, sha256, size_bytes, media_type
        ) VALUES ($1,$2,$3,$4,$5)`,
        [revisionId, item.path, item.sha256, item.sizeBytes, item.mediaType],
      );
    }
    for (const item of revision.derived.clientManifest.assets) {
      await client.query(
        `INSERT INTO skill_artifact_manifest_assets (
          artifact_revision_id, path, sha256, size_bytes, media_type
        ) VALUES ($1,$2,$3,$4,$5)`,
        [revisionId, item.path, item.sha256, item.sizeBytes, item.mediaType],
      );
    }
    for (const item of revision.derived.clientManifest.scripts) {
      await client.query(
        `INSERT INTO skill_artifact_manifest_scripts (
          artifact_revision_id, path, sha256, capability, args_schema_summary, side_effect_summary, default_policy
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          revisionId,
          item.path,
          item.sha256,
          item.capability,
          item.argsSchemaSummary,
          item.sideEffectSummary,
          item.defaultPolicy,
        ],
      );
    }
  }
}

async function loadStructuredRevisionData(
  pool: Pool,
  revisionIds: string[],
): Promise<Map<string, StructuredRevisionData>> {
  const result = new Map<string, StructuredRevisionData>();
  if (revisionIds.length === 0) {
    return result;
  }

  const [
    filesRows,
    descriptorRows,
    profileRows,
    capsuleRows,
    manifestRows,
    manifestRefRows,
    manifestAssetRows,
    manifestScriptRows,
  ] = await Promise.all([
    pool.query(
      'SELECT * FROM skill_artifact_files WHERE artifact_revision_id = ANY($1::text[]) ORDER BY id',
      [revisionIds],
    ),
    pool.query(
      'SELECT * FROM skill_artifact_script_descriptors WHERE artifact_revision_id = ANY($1::text[]) ORDER BY id',
      [revisionIds],
    ),
    pool.query(
      'SELECT * FROM skill_artifact_profiles WHERE artifact_revision_id = ANY($1::text[])',
      [revisionIds],
    ),
    pool.query(
      'SELECT * FROM skill_artifact_capsules WHERE artifact_revision_id = ANY($1::text[]) ORDER BY capsule_id',
      [revisionIds],
    ),
    pool.query(
      'SELECT * FROM skill_artifact_client_manifests WHERE artifact_revision_id = ANY($1::text[])',
      [revisionIds],
    ),
    pool.query(
      'SELECT * FROM skill_artifact_manifest_references WHERE artifact_revision_id = ANY($1::text[]) ORDER BY id',
      [revisionIds],
    ),
    pool.query(
      'SELECT * FROM skill_artifact_manifest_assets WHERE artifact_revision_id = ANY($1::text[]) ORDER BY id',
      [revisionIds],
    ),
    pool.query(
      'SELECT * FROM skill_artifact_manifest_scripts WHERE artifact_revision_id = ANY($1::text[]) ORDER BY id',
      [revisionIds],
    ),
  ]);

  for (const revisionId of revisionIds) {
    const files = filesRows.rows
      .filter((row: any) => row.artifact_revision_id === revisionId)
      .map((row: any) => ({
        path: row.path,
        kind: row.kind,
        sha256: row.sha256,
        sizeBytes: row.size_bytes,
        mediaType: row.media_type,
        source: row.source_group,
        includeInDerivation: row.include_in_derivation === 1,
        activationOnly: row.activation_only === 1,
      }));

    const scriptDescriptors = descriptorRows.rows
      .filter((row: any) => row.artifact_revision_id === revisionId)
      .map(
        (row: any): SkillScriptDescriptorRecord => ({
          path: row.path,
          sha256: row.sha256,
          capability: row.capability,
          argsSchemaSummary: row.args_schema_summary,
          sideEffectSummary: row.side_effect_summary,
          defaultPolicy: row.default_policy,
        }),
      );

    const profileRow = profileRows.rows.find(
      (row: any) => row.artifact_revision_id === revisionId,
    ) as any;
    const capsuleList = capsuleRows.rows
      .filter((row: any) => row.artifact_revision_id === revisionId)
      .map((row: any) => ({
        capsuleId: row.capsule_id,
        artifactId: row.artifact_id,
        revision: row.revision_no,
        sourcePaths: row.source_paths,
        content: row.content,
        situation: row.situation,
        problem: row.problem,
        goal: row.goal,
        errorText: row.error_text,
        contextualPrefix: row.contextual_prefix ?? undefined,
        labels: row.labels,
        scope: row.scope,
        requiredLevel: row.required_level,
      }));

    const manifestRow = manifestRows.rows.find(
      (row: any) => row.artifact_revision_id === revisionId,
    ) as any;
    const manifest = manifestRow
      ? {
          artifactId: manifestRow.artifact_id,
          revision: manifestRow.revision_no,
          references: manifestRefRows.rows
            .filter((row: any) => row.artifact_revision_id === revisionId)
            .map((row: any) => ({
              path: row.path,
              sha256: row.sha256,
              sizeBytes: row.size_bytes,
              mediaType: row.media_type,
            })),
          assets: manifestAssetRows.rows
            .filter((row: any) => row.artifact_revision_id === revisionId)
            .map((row: any) => ({
              path: row.path,
              sha256: row.sha256,
              sizeBytes: row.size_bytes,
              mediaType: row.media_type,
            })),
          scripts: manifestScriptRows.rows
            .filter((row: any) => row.artifact_revision_id === revisionId)
            .map((row: any) => ({
              path: row.path,
              sha256: row.sha256,
              capability: row.capability,
              argsSchemaSummary: row.args_schema_summary,
              sideEffectSummary: row.side_effect_summary,
              defaultPolicy: row.default_policy,
            })),
          sourceHash: manifestRow.source_hash,
        }
      : null;

    const derived =
      profileRow || capsuleList.length > 0 || manifest
        ? {
            profile: profileRow
              ? {
                  artifactId: profileRow.artifact_id,
                  revision: profileRow.revision_no,
                  sourceHash: profileRow.source_hash,
                  title: profileRow.title,
                  summary: profileRow.summary,
                  keywords: profileRow.keywords,
                  referencePaths: profileRow.reference_paths,
                  contentHash: profileRow.content_hash,
                }
              : null,
            capsules: capsuleList,
            clientManifest: manifest,
            sourceHash:
              profileRow?.source_hash ?? manifest?.sourceHash ?? capsuleList[0]?.artifactId ?? '',
            derivedAt: new Date().toISOString(),
          }
        : null;

    result.set(revisionId, { files, scriptDescriptors, derived });
  }

  return result;
}

async function insertArtifactBoundarySubTables(
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

async function upsertArtifactMaintenanceAssignment(
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

async function upsertArtifactAgentReview(
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

async function upsertArtifactMetadata(
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

async function loadArtifactBoundaryFromSubTables(
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

async function loadArtifactMaintenanceMeta(
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

async function loadArtifactAgentReview(
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

async function loadArtifactMetadata(
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
