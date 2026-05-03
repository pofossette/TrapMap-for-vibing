/**
 * PostgreSQL-backed implementation of ArtifactRepository.
 *
 * Uses row-level SELECT FOR UPDATE locking for safe concurrent operations.
 * Each skill artifact is stored as a separate row with related revisions
 * and lifecycle events in child tables.
 *
 * Phase: 63 (WRITE-03)
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import type { Boundary, LifecycleState, Scope } from '@trapmap/contracts';

import type {
  AgentReviewRecord,
  SkillArtifactLifecycleEventRecord,
  SkillArtifactMetadataRecord,
  SkillArtifactRecord,
  SkillArtifactRevisionRecord,
  StoredScriptActivationPolicy,
} from '../store.js';
import type { ArtifactRepository } from './repository.js';
import { transitionLifecycleState } from '../lifecycle/state-machine.js';
import { skillArtifacts } from '../persistence/schema.js';

/**
 * PostgreSQL-backed repository for skill artifact CRUD operations.
 * Implements row-level locking for concurrent-safe updates.
 */
export class PgArtifactRepository implements ArtifactRepository {
  private db: ReturnType<typeof drizzle>;
  private initialized = false;

  constructor(private readonly pool: Pool) {
    this.db = drizzle(pool, {
      schema: { skillArtifacts },
    });
  }

  /**
   * Ensure the artifact tables and indexes exist.
   * Called idempotently before each operation.
   */
  private async ensureSchema(): Promise<void> {
    if (this.initialized) return;

    // Create SEQUENCE for ID generation
    await this.pool.query(`
      CREATE SEQUENCE IF NOT EXISTS skill_artifact_id_seq START 1
    `);

    // Create skill_artifacts table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS skill_artifacts (
        id TEXT PRIMARY KEY,
        team_id TEXT,
        scope TEXT NOT NULL,
        labels JSONB NOT NULL DEFAULT '[]',
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        required_level INTEGER NOT NULL DEFAULT 0,
        lifecycle_state TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        metadata JSONB NOT NULL,
        agent_review JSONB,
        maintenance_meta JSONB,
        boundary JSONB,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    // Create artifact_revisions table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS artifact_revisions (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        source_hash TEXT NOT NULL,
        files JSONB NOT NULL,
        submitted_at TIMESTAMP WITH TIME ZONE NOT NULL,
        submitted_by_user_id TEXT NOT NULL,
        script_descriptors JSONB NOT NULL DEFAULT '[]',
        derived JSONB,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    // Create artifact_lifecycle_events table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS artifact_lifecycle_events (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        actor_user_id TEXT,
        submission_id TEXT,
        revision INTEGER,
        state TEXT NOT NULL,
        note TEXT
      )
    `);

    // Create indexes
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_artifacts_lifecycle_state
      ON skill_artifacts (lifecycle_state)
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_artifacts_team
      ON skill_artifacts (team_id) WHERE team_id IS NOT NULL
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_skill_artifacts_slug
      ON skill_artifacts (slug)
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_artifact_revisions_artifact
      ON artifact_revisions (artifact_id)
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_artifact_lifecycle_events_artifact
      ON artifact_lifecycle_events (artifact_id)
    `);

    this.initialized = true;
  }

  /**
   * Generate a new unique artifact ID using PostgreSQL SEQUENCE.
   */
  async nextId(): Promise<string> {
    await this.ensureSchema();

    const result = await this.pool.query<{ id: string }>(
      "SELECT nextval('skill_artifact_id_seq')::text AS id",
    );
    return `artifact_${result.rows[0]!.id}`;
  }

  /**
   * Insert a new artifact with all related data.
   */
  async insert(artifact: SkillArtifactRecord): Promise<void> {
    await this.ensureSchema();

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
        await client.query(
          `INSERT INTO artifact_revisions (
            id, artifact_id, revision, source_hash, files, submitted_at,
            submitted_by_user_id, script_descriptors, derived, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            `${artifact.id}_rev${revision.revision}`,
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
      }

      // Insert all lifecycle events
      for (const event of artifact.lifecycleHistory) {
        await client.query(
          `INSERT INTO artifact_lifecycle_events (
            id, artifact_id, type, created_at, actor_user_id,
            submission_id, revision, state, note
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
    await this.ensureSchema();

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
      'SELECT * FROM artifact_revisions WHERE artifact_id = $1 ORDER BY revision',
      [artifactId],
    );

    // Query lifecycle events
    const eventsResult = await this.pool.query<DrizzleArtifactLifecycleEventRow>(
      'SELECT * FROM artifact_lifecycle_events WHERE artifact_id = $1 ORDER BY created_at',
      [artifactId],
    );

    return reconstructSkillArtifactRecord(artifactRow, revisionsResult.rows, eventsResult.rows);
  }

  /**
   * Update lifecycle state with row-level locking.
   */
  async updateLifecycle(
    artifactId: string,
    newState: LifecycleState,
    context: { actorId: string; note?: string },
  ): Promise<void> {
    await this.ensureSchema();

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
    await this.ensureSchema();

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

      // Insert the revision
      await client.query(
        `INSERT INTO artifact_revisions (
          id, artifact_id, revision, source_hash, files, submitted_at,
          submitted_by_user_id, script_descriptors, derived, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          `${artifactId}_rev${revision.revision}`,
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
    await this.ensureSchema();

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
        `UPDATE artifact_revisions SET derived = $1 WHERE artifact_id = $2 AND revision = $3`,
        [derived ? JSON.stringify(derived) : null, artifactId, revision],
      );

      // Update the artifact's updated_at
      await client.query(
        'UPDATE skill_artifacts SET updated_at = $1 WHERE id = $2',
        [now, artifactId],
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
   * Append a lifecycle event.
   */
  async appendLifecycleEvent(
    artifactId: string,
    event: SkillArtifactLifecycleEventRecord,
  ): Promise<void> {
    await this.ensureSchema();

    await this.pool.query(
      `INSERT INTO artifact_lifecycle_events (
        id, artifact_id, type, created_at, actor_user_id,
        submission_id, revision, state, note
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
  }): Promise<SkillArtifactRecord[]> {
    await this.ensureSchema();

    const conditions: string[] = [];
    const params: (string | number)[] = [];
    let paramIndex = 1;

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

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.pool.query<DrizzleSkillArtifactRow>(
      `SELECT * FROM skill_artifacts ${whereClause}`,
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
    await this.ensureSchema();

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
  revision: number;
  source_hash: string;
  files: ArtifactRevisionFileRow[];
  submitted_at: Date;
  submitted_by_user_id: string;
  script_descriptors: ArtifactScriptDescriptorRow[];
  derived: ArtifactDerivedRow | null;
  created_at: Date;
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
  revision: number | null;
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
    revision: row.revision,
    sourceHash: row.source_hash,
    files: row.files,
    submittedAt: row.submitted_at.toISOString(),
    submittedByUserId: row.submitted_by_user_id,
    scriptDescriptors: row.script_descriptors,
    derived: row.derived,
  };
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
    revision: row.revision,
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
): SkillArtifactRecord {
  const artifact = rowToSkillArtifact(artifactRow);

  // Populate revisions
  const revisions = revisionRows.map(rowToArtifactRevision);
  artifact.history = revisions;
  if (revisions.length > 0) {
    artifact.latestRevision = revisions[revisions.length - 1]!;
  }

  // Populate lifecycle events
  artifact.lifecycleHistory = eventRows.map(rowToArtifactLifecycleEvent);

  return artifact;
}
