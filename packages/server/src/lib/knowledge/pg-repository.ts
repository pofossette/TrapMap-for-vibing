/**
 * PostgreSQL-backed implementation of KnowledgeRepository.
 *
 * Uses row-level SELECT FOR UPDATE locking for safe concurrent operations.
 * Each knowledge entry is stored as a separate row with related revisions
 * and lifecycle events in child tables.
 *
 * Phase: 62 (WRITE-02)
 */

import { eq, and, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import type { Boundary, LifecycleState } from '@trapmap/contracts';

import type {
  KnowledgeLifecycleEventRecord,
  KnowledgeRecord,
  KnowledgeRevisionRecord,
} from '../store.js';
import type { KnowledgeRepository } from './repository.js';
import { transitionLifecycleState } from '../lifecycle/state-machine.js';
import {
  knowledgeEntries,
  knowledgeRevisions,
  lifecycleEvents,
} from '../persistence/schema.js';

/**
 * PostgreSQL-backed repository for knowledge entry CRUD operations.
 * Implements row-level locking for concurrent-safe updates.
 */
export class PgKnowledgeRepository implements KnowledgeRepository {
  private db: ReturnType<typeof drizzle>;
  private initialized = false;

  constructor(private readonly pool: Pool) {
    this.db = drizzle(pool, {
      schema: { knowledgeEntries, knowledgeRevisions, lifecycleEvents },
    });
  }

  /**
   * Ensure the knowledge tables and indexes exist.
   * Called idempotently before each operation.
   */
  private async ensureSchema(): Promise<void> {
    if (this.initialized) return;

    // Create SEQUENCE for ID generation
    await this.pool.query(`
      CREATE SEQUENCE IF NOT EXISTS knowledge_entry_id_seq START 1
    `);

    // Create knowledge_entries table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_entries (
        id TEXT PRIMARY KEY,
        team_id TEXT,
        scope TEXT NOT NULL,
        labels JSONB NOT NULL DEFAULT '[]',
        shortcut TEXT NOT NULL,
        detail TEXT NOT NULL,
        required_level INTEGER NOT NULL DEFAULT 0,
        lifecycle_state TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        boundary JSONB,
        maintenance_meta JSONB,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    // Create knowledge_revisions table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS knowledge_revisions (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        submitted_at TIMESTAMP WITH TIME ZONE NOT NULL,
        submitted_by_user_id TEXT NOT NULL,
        shortcut TEXT NOT NULL,
        detail TEXT NOT NULL,
        labels JSONB NOT NULL DEFAULT '[]',
        review_notes JSONB NOT NULL DEFAULT '[]',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);

    // Create lifecycle_events table
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS lifecycle_events (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL,
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
      CREATE INDEX IF NOT EXISTS idx_knowledge_entries_lifecycle_state
      ON knowledge_entries (lifecycle_state)
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_entries_team
      ON knowledge_entries (team_id) WHERE team_id IS NOT NULL
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_knowledge_revisions_entry
      ON knowledge_revisions (entry_id)
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS idx_lifecycle_events_entry
      ON lifecycle_events (entry_id)
    `);

    this.initialized = true;
  }

  /**
   * Generate a new unique knowledge entry ID using PostgreSQL SEQUENCE.
   */
  async nextId(): Promise<string> {
    await this.ensureSchema();

    const result = await this.pool.query<{ id: string }>(
      "SELECT nextval('knowledge_entry_id_seq')::text AS id",
    );
    return `knowledge_${result.rows[0]!.id}`;
  }

  /**
   * Insert a new knowledge entry with all related data.
   */
  async insert(entry: KnowledgeRecord): Promise<void> {
    await this.ensureSchema();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Insert into knowledge_entries
      await client.query(
        `INSERT INTO knowledge_entries (
          id, team_id, scope, labels, shortcut, detail, required_level,
          lifecycle_state, owner_user_id, boundary, maintenance_meta, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          entry.id,
          entry.teamId,
          entry.scope,
          JSON.stringify(entry.labels),
          entry.shortcut,
          entry.detail,
          entry.requiredLevel,
          entry.lifecycleState,
          entry.ownerUserId,
          entry.boundary ? JSON.stringify(entry.boundary) : null,
          entry.maintenanceMeta ? JSON.stringify(entry.maintenanceMeta) : null,
          entry.createdAt,
          entry.updatedAt,
        ],
      );

      // Insert all revisions
      for (const revision of entry.history) {
        await client.query(
          `INSERT INTO knowledge_revisions (
            id, entry_id, revision, submitted_at, submitted_by_user_id,
            shortcut, detail, labels, review_notes, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            `${entry.id}_rev${revision.revision}`,
            entry.id,
            revision.revision,
            revision.submittedAt,
            revision.submittedByUserId,
            revision.shortcut,
            revision.detail,
            JSON.stringify(revision.labels),
            JSON.stringify(revision.reviewNotes),
            revision.submittedAt,
          ],
        );
      }

      // Insert all lifecycle events
      for (const event of entry.lifecycleHistory) {
        await client.query(
          `INSERT INTO lifecycle_events (
            id, entry_id, type, created_at, actor_user_id,
            submission_id, revision, state, note
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            event.id,
            entry.id,
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
   * Get a knowledge entry by ID with all related data.
   */
  async getById(entryId: string): Promise<KnowledgeRecord | null> {
    await this.ensureSchema();

    // Query the entry
    const entryResult = await this.pool.query<DrizzleKnowledgeEntryRow>(
      'SELECT * FROM knowledge_entries WHERE id = $1',
      [entryId],
    );

    if (entryResult.rows.length === 0) {
      return null;
    }

    const entryRow = entryResult.rows[0]!;

    // Query revisions
    const revisionsResult = await this.pool.query<DrizzleKnowledgeRevisionRow>(
      'SELECT * FROM knowledge_revisions WHERE entry_id = $1 ORDER BY revision',
      [entryId],
    );

    // Query lifecycle events
    const eventsResult = await this.pool.query<DrizzleLifecycleEventRow>(
      'SELECT * FROM lifecycle_events WHERE entry_id = $1 ORDER BY created_at',
      [entryId],
    );

    return reconstructKnowledgeRecord(entryRow, revisionsResult.rows, eventsResult.rows);
  }

  /**
   * Update lifecycle state with row-level locking.
   */
  async updateLifecycle(
    entryId: string,
    newState: LifecycleState,
    context: { actorId: string; note?: string },
  ): Promise<void> {
    await this.ensureSchema();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the row for update
      const { rows } = await client.query<DrizzleKnowledgeEntryRow>(
        'SELECT * FROM knowledge_entries WHERE id = $1 FOR UPDATE',
        [entryId],
      );

      if (rows.length === 0) {
        throw new Error(`Knowledge entry ${entryId} not found`);
      }

      const entry = rowToKnowledgeEntry(rows[0]!);

      // Validate transition using state machine
      transitionLifecycleState(entry, newState, context.note ?? 'update');

      const now = new Date().toISOString();

      // Update the entry
      await client.query(
        'UPDATE knowledge_entries SET lifecycle_state = $1, updated_at = $2 WHERE id = $3',
        [newState, now, entryId],
      );

      // Insert lifecycle event
      await client.query(
        `INSERT INTO lifecycle_events (id, entry_id, type, created_at, actor_user_id, state, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          `le_${entryId}_${Date.now()}`,
          entryId,
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
  async appendRevision(entryId: string, revision: KnowledgeRevisionRecord): Promise<void> {
    await this.ensureSchema();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the row for update
      const { rows } = await client.query<DrizzleKnowledgeEntryRow>(
        'SELECT * FROM knowledge_entries WHERE id = $1 FOR UPDATE',
        [entryId],
      );

      if (rows.length === 0) {
        throw new Error(`Knowledge entry ${entryId} not found`);
      }

      const now = new Date().toISOString();

      // Insert the revision
      await client.query(
        `INSERT INTO knowledge_revisions (
          id, entry_id, revision, submitted_at, submitted_by_user_id,
          shortcut, detail, labels, review_notes, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          `${entryId}_rev${revision.revision}`,
          entryId,
          revision.revision,
          revision.submittedAt,
          revision.submittedByUserId,
          revision.shortcut,
          revision.detail,
          JSON.stringify(revision.labels),
          JSON.stringify(revision.reviewNotes),
          revision.submittedAt,
        ],
      );

      // Update the entry's latest revision columns
      await client.query(
        `UPDATE knowledge_entries
         SET shortcut = $1, detail = $2, labels = $3, updated_at = $4
         WHERE id = $5`,
        [revision.shortcut, revision.detail, JSON.stringify(revision.labels), now, entryId],
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
    entryId: string,
    event: KnowledgeLifecycleEventRecord,
  ): Promise<void> {
    await this.ensureSchema();

    await this.pool.query(
      `INSERT INTO lifecycle_events (
        id, entry_id, type, created_at, actor_user_id,
        submission_id, revision, state, note
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        event.id,
        entryId,
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
   * List entries by filter criteria.
   * Returns lightweight records without full revision history.
   */
  async listByFilter(filter: {
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
  }): Promise<KnowledgeRecord[]> {
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

    const result = await this.pool.query<DrizzleKnowledgeEntryRow>(
      `SELECT * FROM knowledge_entries ${whereClause}`,
      params,
    );

    // Return lightweight records (without full history)
    return result.rows.map((row) => {
      const entry = rowToKnowledgeEntry(row);
      // Clear heavy fields for list view
      entry.history = [];
      entry.lifecycleHistory = [];
      entry.submissionHistory = [];
      entry.reviewHistory = [];
      entry.reviewNotes = [];
      return entry;
    });
  }

  /**
   * Update governance fields with row-level locking.
   */
  async updateGovernance(
    entryId: string,
    governance: { labels?: string[]; requiredLevel?: number },
  ): Promise<void> {
    await this.ensureSchema();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the row for update
      const { rows } = await client.query<DrizzleKnowledgeEntryRow>(
        'SELECT * FROM knowledge_entries WHERE id = $1 FOR UPDATE',
        [entryId],
      );

      if (rows.length === 0) {
        throw new Error(`Knowledge entry ${entryId} not found`);
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

      updates.push(`updated_at = $${paramIndex++}`);
      params.push(now);

      params.push(entryId);

      await client.query(
        `UPDATE knowledge_entries SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
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
 * Database row shape for knowledge_entries table.
 * Drizzle returns snake_case column names from PostgreSQL.
 */
interface DrizzleKnowledgeEntryRow {
  id: string;
  team_id: string | null;
  scope: string;
  labels: string[];
  shortcut: string;
  detail: string;
  required_level: number;
  lifecycle_state: LifecycleState;
  owner_user_id: string;
  boundary: Boundary | null;
  maintenance_meta: {
    maintainerUserId: string | null;
    maintainerHandle: string | null;
    maintainerLevel: number | null;
    reviewBy: string | null;
  } | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Database row shape for knowledge_revisions table.
 */
interface DrizzleKnowledgeRevisionRow {
  id: string;
  entry_id: string;
  revision: number;
  submitted_at: Date;
  submitted_by_user_id: string;
  shortcut: string;
  detail: string;
  labels: string[];
  review_notes: Array<{
    id: string;
    createdAt: string;
    authorType: 'submitter' | 'agent' | 'reviewer' | 'system';
    authorUserId: string | null;
    message: string;
  }>;
  created_at: Date;
}

/**
 * Database row shape for lifecycle_events table.
 */
interface DrizzleLifecycleEventRow {
  id: string;
  entry_id: string;
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
 * Map a Drizzle row to partial KnowledgeRecord fields.
 */
function rowToKnowledgeEntry(row: DrizzleKnowledgeEntryRow): KnowledgeRecord {
  return {
    id: row.id,
    teamId: row.team_id,
    scope: row.scope as 'global' | 'project',
    labels: row.labels,
    shortcut: row.shortcut,
    detail: row.detail,
    requiredLevel: row.required_level,
    lifecycleState: row.lifecycle_state,
    ownerUserId: row.owner_user_id,
    boundary: row.boundary,
    maintenanceMeta: row.maintenance_meta,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    // These fields are populated separately
    latestRevision: {
      revision: 0,
      submittedAt: row.created_at.toISOString(),
      submittedByUserId: row.owner_user_id,
      shortcut: row.shortcut,
      detail: row.detail,
      labels: row.labels,
      reviewNotes: [],
    },
    history: [],
    metadata: {
      scopeLabel: row.scope === 'global' ? 'global-constraint' : 'project-knowledge',
      submissionCount: 0,
      resubmissionCount: 0,
      revisionCount: 0,
      latestSubmissionId: null,
      latestSubmittedAt: null,
      latestReviewedAt: null,
      latestDecision: null,
    },
    latestSubmissionId: null,
    submissionHistory: [],
    agentReview: null,
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    embeddingCache: null,
    indexState: null,
  };
}

/**
 * Map a Drizzle revision row to KnowledgeRevisionRecord.
 */
function rowToKnowledgeRevision(row: DrizzleKnowledgeRevisionRow): KnowledgeRevisionRecord {
  return {
    revision: row.revision,
    submittedAt: row.submitted_at.toISOString(),
    submittedByUserId: row.submitted_by_user_id,
    shortcut: row.shortcut,
    detail: row.detail,
    labels: row.labels,
    reviewNotes: row.review_notes,
  };
}

/**
 * Map a Drizzle lifecycle event row to KnowledgeLifecycleEventRecord.
 */
function rowToLifecycleEvent(row: DrizzleLifecycleEventRow): KnowledgeLifecycleEventRecord {
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
 * Reconstruct a full KnowledgeRecord from database rows.
 */
function reconstructKnowledgeRecord(
  entryRow: DrizzleKnowledgeEntryRow,
  revisionRows: DrizzleKnowledgeRevisionRow[],
  eventRows: DrizzleLifecycleEventRow[],
): KnowledgeRecord {
  const entry = rowToKnowledgeEntry(entryRow);

  // Populate revisions
  const revisions = revisionRows.map(rowToKnowledgeRevision);
  entry.history = revisions;
  if (revisions.length > 0) {
    entry.latestRevision = revisions[revisions.length - 1]!;
  }

  // Populate lifecycle events
  entry.lifecycleHistory = eventRows.map(rowToLifecycleEvent);

  return entry;
}
