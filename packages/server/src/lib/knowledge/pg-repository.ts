/**
 * PostgreSQL-backed implementation of KnowledgeRepository.
 *
 * Uses row-level SELECT FOR UPDATE locking for safe concurrent operations.
 * Each knowledge entry is stored as a separate row with related revisions
 * and lifecycle events in child tables.
 *
 * Phase: 62 (WRITE-02)
 * Round 3: Adds structured sub-tables for labels, boundary, and maintenance.
 */

import type { Boundary, LifecycleState } from '@trapmap/contracts';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';

import type { DecayMeta } from '@trapmap/contracts';
import { transitionLifecycleState } from '@trapmap/server/lib/lifecycle/state-machine.js';
import {
  knowledgeBoundaryContexts,
  knowledgeBoundaryEvidence,
  knowledgeBoundaryExclusions,
  knowledgeBoundaryPrerequisites,
  knowledgeBoundarySignals,
  knowledgeBoundaryVersions,
  knowledgeEntries,
  knowledgeLabels,
  knowledgeMaintenanceAssignments,
  knowledgeRevisions,
  lifecycleEvents,
} from '@trapmap/server/lib/persistence/schema.js';
import type {
  EmbeddingCacheRecord,
  KnowledgeLifecycleEventRecord,
  KnowledgeRecord,
  KnowledgeRevisionRecord,
  MaintenanceMetaRecord,
  SkillShareerStore,
} from '@trapmap/server/lib/store.js';
import type { KnowledgeRepository } from './repository.js';

/**
 * PostgreSQL-backed repository for knowledge entry CRUD operations.
 * Implements row-level locking for concurrent-safe updates.
 */
export class PgKnowledgeRepository implements KnowledgeRepository {
  constructor(
    private readonly pool: Pool,
    private readonly compatStore?: SkillShareerStore,
  ) {
    drizzle(pool, {
      schema: {
        knowledgeEntries,
        knowledgeRevisions,
        lifecycleEvents,
        knowledgeLabels,
        knowledgeBoundaryContexts,
        knowledgeBoundaryVersions,
        knowledgeBoundaryPrerequisites,
        knowledgeBoundarySignals,
        knowledgeBoundaryExclusions,
        knowledgeBoundaryEvidence,
        knowledgeMaintenanceAssignments,
      },
    });
  }

  /**
   * Generate a new unique knowledge entry ID using PostgreSQL SEQUENCE.
   */
  async nextId(): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      "SELECT nextval('knowledge_entry_id_seq')::text AS id",
    );
    return `knowledge_${result.rows[0]!.id}`;
  }

  /**
   * Insert a new knowledge entry with all related data.
   * Round 3: Also writes to structured sub-tables (labels, boundary, maintenance).
   */
  async insert(entry: KnowledgeRecord): Promise<void> {
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
            id, entry_id, revision_no, submitted_at, submitted_by_user_id,
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
            submission_id, revision_no, state, note
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

      // Round 3: Insert into knowledge_labels
      for (const label of entry.labels) {
        await client.query(
          'INSERT INTO knowledge_labels (entry_id, label) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [entry.id, label],
        );
      }

      // Round 3: Insert boundary sub-tables
      if (entry.boundary) {
        await insertBoundarySubTables(client, entry.id, entry.boundary);
      }

      // Round 3: Insert maintenance assignment
      if (entry.maintenanceMeta) {
        await client.query(
          `INSERT INTO knowledge_maintenance_assignments (
            entry_id, maintainer_user_id, maintainer_handle, maintainer_level, review_by
          ) VALUES ($1, $2, $3, $4, $5)`,
          [
            entry.id,
            entry.maintenanceMeta.maintainerUserId,
            entry.maintenanceMeta.maintainerHandle,
            entry.maintenanceMeta.maintainerLevel,
            entry.maintenanceMeta.reviewBy,
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
   * Round 3: Also reads from structured sub-tables.
   */
  async getById(entryId: string): Promise<KnowledgeRecord | null> {
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
      'SELECT * FROM knowledge_revisions WHERE entry_id = $1 ORDER BY revision_no',
      [entryId],
    );

    // Query lifecycle events
    const eventsResult = await this.pool.query<DrizzleLifecycleEventRow>(
      'SELECT * FROM lifecycle_events WHERE entry_id = $1 ORDER BY created_at',
      [entryId],
    );

    // Round 3: Query structured labels
    const labelsResult = await this.pool.query<{ label: string }>(
      'SELECT label FROM knowledge_labels WHERE entry_id = $1 ORDER BY label',
      [entryId],
    );
    const structuredLabels = labelsResult.rows.map((r) => r.label);

    // Round 3: Query boundary sub-tables
    const boundary = await loadBoundaryFromSubTables(this.pool, entryId);

    // Round 3: Query maintenance assignment
    const maintenanceResult = await this.pool.query<MaintenanceAssignmentRow>(
      'SELECT * FROM knowledge_maintenance_assignments WHERE entry_id = $1',
      [entryId],
    );
    const maintenanceMeta =
      maintenanceResult.rows.length > 0 ? rowToMaintenanceMeta(maintenanceResult.rows[0]!) : null;

    const authoritative = reconstructKnowledgeRecord(
      entryRow,
      revisionsResult.rows,
      eventsResult.rows,
      structuredLabels,
      boundary,
      maintenanceMeta,
    );
    return this.applyCompatOverlay(authoritative);
  }

  async getByIds(entryIds: string[]): Promise<KnowledgeRecord[]> {
    const loaded = await Promise.all(entryIds.map((entryId) => this.getById(entryId)));
    return loaded.filter((entry): entry is KnowledgeRecord => entry !== null);
  }

  /**
   * Update lifecycle state with row-level locking.
   * Returns the updated entry record with appended lifecycle history.
   */
  async updateLifecycle(
    entryId: string,
    newState: LifecycleState,
    context: { actorId: string; note?: string },
  ): Promise<KnowledgeRecord> {
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
      const eventId = `le_${entryId}_${Date.now()}`;

      // Update the entry
      await client.query(
        'UPDATE knowledge_entries SET lifecycle_state = $1, updated_at = $2 WHERE id = $3',
        [newState, now, entryId],
      );

      // Insert lifecycle event
      await client.query(
        `INSERT INTO lifecycle_events (id, entry_id, type, created_at, actor_user_id, state, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [eventId, entryId, 'updated', now, context.actorId, newState, context.note ?? null],
      );

      await client.query('COMMIT');

      // Build and return the updated record with the lifecycle event appended
      const nextEvent: KnowledgeLifecycleEventRecord = {
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
        ...entry,
        lifecycleState: newState,
        updatedAt: now,
        lifecycleHistory: [...entry.lifecycleHistory, nextEvent],
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
   * Round 3: Also syncs knowledge_labels when labels change.
   */
  async appendRevision(entryId: string, revision: KnowledgeRevisionRecord): Promise<void> {
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
          id, entry_id, revision_no, submitted_at, submitted_by_user_id,
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

      // Round 3: Sync knowledge_labels with new revision's labels
      await client.query('DELETE FROM knowledge_labels WHERE entry_id = $1', [entryId]);
      for (const label of revision.labels) {
        await client.query(
          'INSERT INTO knowledge_labels (entry_id, label) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [entryId, label],
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
   * Append a lifecycle event.
   */
  async appendLifecycleEvent(entryId: string, event: KnowledgeLifecycleEventRecord): Promise<void> {
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
   * Round 3: Supports label filtering via knowledge_labels table.
   */
  async listByFilter(filter: {
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
    labels?: string[];
  }): Promise<KnowledgeRecord[]> {
    const conditions: string[] = [];
    const params: (string | number | string[])[] = [];
    let paramIndex = 1;

    if (filter.lifecycleState !== undefined) {
      conditions.push(`ke.lifecycle_state = $${paramIndex++}`);
      params.push(filter.lifecycleState);
    }
    if (filter.teamId !== undefined) {
      conditions.push(`ke.team_id = $${paramIndex++}`);
      params.push(filter.teamId);
    }
    if (filter.ownerUserId !== undefined) {
      conditions.push(`ke.owner_user_id = $${paramIndex++}`);
      params.push(filter.ownerUserId);
    }
    if (filter.labels !== undefined && filter.labels.length > 0) {
      // Round 3: Filter by labels using knowledge_labels table
      // Requires ALL labels to match (AND semantics)
      conditions.push(
        `(SELECT COUNT(DISTINCT kl.label) FROM knowledge_labels kl WHERE kl.entry_id = ke.id AND kl.label = ANY($${paramIndex++})) = $${paramIndex++}`,
      );
      params.push(filter.labels);
      params.push(filter.labels.length);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await this.pool.query<DrizzleKnowledgeEntryRow>(
      `SELECT ke.* FROM knowledge_entries ke ${whereClause}`,
      params,
    );

    // Return lightweight records (without full history)
    const authoritativeEntries = result.rows.map((row) => {
      const entry = rowToKnowledgeEntry(row);
      // Clear heavy fields for list view
      entry.history = [];
      entry.lifecycleHistory = [];
      entry.submissionHistory = [];
      entry.reviewHistory = [];
      entry.reviewNotes = [];
      return entry;
    });
    return this.applyCompatOverlayToMany(authoritativeEntries);
  }

  /**
   * Update governance fields with row-level locking.
   * Round 3: Also syncs knowledge_labels when labels change.
   */
  async updateGovernance(
    entryId: string,
    governance: { labels?: string[]; requiredLevel?: number },
  ): Promise<void> {
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

      // Round 3: Sync knowledge_labels when labels change
      if (governance.labels !== undefined) {
        await client.query('DELETE FROM knowledge_labels WHERE entry_id = $1', [entryId]);
        for (const label of governance.labels) {
          await client.query(
            'INSERT INTO knowledge_labels (entry_id, label) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [entryId, label],
          );
        }
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
   * Update the embedding cache for a knowledge entry with row-level locking.
   * Persists the pre-computed embedding vector as JSONB in the embedding_cache column.
   */
  async updateEmbeddingCache(entryId: string, cache: EmbeddingCacheRecord): Promise<void> {
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

      await client.query(
        'UPDATE knowledge_entries SET embedding_cache = $1, updated_at = $2 WHERE id = $3',
        [JSON.stringify(cache), now, entryId],
      );

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  async supersede(
    entryId: string,
    input: { replacementId: string; actorId: string },
  ): Promise<KnowledgeRecord> {
    if (entryId === input.replacementId) {
      throw new Error('Cannot supersede an entry with itself');
    }

    const sourceBefore = await this.getById(entryId);
    if (!sourceBefore) {
      throw new Error(`Knowledge entry ${entryId} not found`);
    }
    const replacement = await this.getById(input.replacementId);
    if (!replacement) {
      throw new Error(`Replacement entry ${input.replacementId} not found`);
    }
    if (sourceBefore.lifecycleState !== 'approved') {
      throw new Error('Only approved entries can be superseded');
    }
    if (replacement.lifecycleState !== 'approved') {
      throw new Error('Replacement must be an approved entry');
    }

    const client = await this.pool.connect();
    const updatedAt = new Date().toISOString();
    const eventId = `le_${entryId}_supersede_${Date.now()}`;

    try {
      await client.query('BEGIN');

      const sourceLock = await client.query<DrizzleKnowledgeEntryRow>(
        'SELECT id FROM knowledge_entries WHERE id = $1 FOR UPDATE',
        [entryId],
      );
      if (sourceLock.rows.length === 0) {
        throw new Error(`Knowledge entry ${entryId} not found`);
      }

      const replacementLock = await client.query<DrizzleKnowledgeEntryRow>(
        'SELECT id, lifecycle_state FROM knowledge_entries WHERE id = $1 FOR UPDATE',
        [input.replacementId],
      );
      if (replacementLock.rows.length === 0) {
        throw new Error(`Replacement entry ${input.replacementId} not found`);
      }
      if (replacementLock.rows[0]!.lifecycle_state !== 'approved') {
        throw new Error('Replacement must be an approved entry');
      }

      transitionLifecycleState(sourceBefore, 'deactivated', 'knowledge supersede');

      await client.query(
        'UPDATE knowledge_entries SET lifecycle_state = $1, updated_at = $2 WHERE id = $3',
        ['deactivated', updatedAt, entryId],
      );
      await client.query(
        `INSERT INTO lifecycle_events (id, entry_id, type, created_at, actor_user_id, state, note)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          eventId,
          entryId,
          'deactivated',
          updatedAt,
          input.actorId,
          'deactivated',
          `Superseded by ${input.replacementId}`,
        ],
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    if (this.compatStore) {
      await this.compatStore.transact((data) => {
        const shadow = data.knowledgeEntries.find((candidate) => candidate.id === entryId);
        if (!shadow) {
          return;
        }

        const decayMeta: DecayMeta = {
          lastVerifiedAt: shadow.decayMeta?.lastVerifiedAt ?? shadow.updatedAt,
          decayState: 'superseded',
          supersededById: input.replacementId,
          decayStateComputedAt: updatedAt,
          freshnessType: shadow.decayMeta?.freshnessType ?? 'evergreen',
        };
        const event: KnowledgeLifecycleEventRecord = {
          id: this.compatStore!.nextId(data, 'evt'),
          type: 'deactivated',
          createdAt: updatedAt,
          actorUserId: input.actorId,
          submissionId: null,
          revision: null,
          state: 'deactivated',
          note: `Superseded by ${input.replacementId}`,
        };

        shadow.decayMeta = decayMeta;
        shadow.lifecycleState = 'deactivated';
        shadow.updatedAt = updatedAt;
        shadow.lifecycleHistory.push(event);
      });
    }

    const updated = await this.getById(entryId);
    if (!updated) {
      throw new Error(`Knowledge entry ${entryId} not found`);
    }
    return updated;
  }

  async save(entry: KnowledgeRecord): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<DrizzleKnowledgeEntryRow>(
        'SELECT * FROM knowledge_entries WHERE id = $1 FOR UPDATE',
        [entry.id],
      );

      if (rows.length === 0) {
        throw new Error(`Knowledge entry ${entry.id} not found`);
      }

      await client.query(
        `UPDATE knowledge_entries
         SET team_id = $1,
             scope = $2,
             labels = $3,
             shortcut = $4,
             detail = $5,
             required_level = $6,
             lifecycle_state = $7,
             boundary = $8,
             maintenance_meta = $9,
             embedding_cache = $10,
             updated_at = $11
         WHERE id = $12`,
        [
          entry.teamId,
          entry.scope,
          JSON.stringify(entry.labels),
          entry.shortcut,
          entry.detail,
          entry.requiredLevel,
          entry.lifecycleState,
          entry.boundary ? JSON.stringify(entry.boundary) : null,
          entry.maintenanceMeta ? JSON.stringify(entry.maintenanceMeta) : null,
          entry.embeddingCache ? JSON.stringify(entry.embeddingCache) : null,
          entry.updatedAt,
          entry.id,
        ],
      );

      await client.query('DELETE FROM knowledge_labels WHERE entry_id = $1', [entry.id]);
      for (const label of entry.labels) {
        await client.query(
          'INSERT INTO knowledge_labels (entry_id, label) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [entry.id, label],
        );
      }

      await clearBoundarySubTables(client, entry.id);
      if (entry.boundary) {
        await insertBoundarySubTables(client, entry.id, entry.boundary);
      }

      await client.query('DELETE FROM knowledge_maintenance_assignments WHERE entry_id = $1', [
        entry.id,
      ]);
      if (entry.maintenanceMeta) {
        await client.query(
          `INSERT INTO knowledge_maintenance_assignments (
            entry_id, maintainer_user_id, maintainer_handle, maintainer_level, review_by
          ) VALUES ($1, $2, $3, $4, $5)`,
          [
            entry.id,
            entry.maintenanceMeta.maintainerUserId,
            entry.maintenanceMeta.maintainerHandle,
            entry.maintenanceMeta.maintainerLevel,
            entry.maintenanceMeta.reviewBy,
          ],
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    if (this.compatStore) {
      await this.compatStore.transact((data) => {
        const index = data.knowledgeEntries.findIndex((candidate) => candidate.id === entry.id);
        if (index >= 0) {
          data.knowledgeEntries[index] = entry;
          return;
        }
        data.knowledgeEntries.push(entry);
      });
    }
  }

  private async applyCompatOverlay(entry: KnowledgeRecord): Promise<KnowledgeRecord> {
    if (!this.compatStore) {
      return entry;
    }
    const data = await this.compatStore.snapshot();
    const shadow = data.knowledgeEntries.find((candidate) => candidate.id === entry.id) ?? null;
    return mergeCompatEntry(entry, shadow);
  }

  private async applyCompatOverlayToMany(entries: KnowledgeRecord[]): Promise<KnowledgeRecord[]> {
    if (!this.compatStore || entries.length === 0) {
      return entries;
    }
    const data = await this.compatStore.snapshot();
    const shadows = new Map(data.knowledgeEntries.map((entry) => [entry.id, entry]));
    return entries.map((entry) => mergeCompatEntry(entry, shadows.get(entry.id) ?? null));
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
  maintenance_meta: MaintenanceMetaRecord | null;
  embedding_cache: EmbeddingCacheRecord | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Database row shape for knowledge_revisions table.
 */
interface DrizzleKnowledgeRevisionRow {
  id: string;
  entry_id: string;
  revision_no: number;
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
  revision_no: number | null;
  state: LifecycleState;
  note: string | null;
}

/**
 * Database row shape for knowledge_maintenance_assignments table.
 */
interface MaintenanceAssignmentRow {
  entry_id: string;
  maintainer_user_id: string | null;
  maintainer_handle: string | null;
  maintainer_level: number | null;
  review_by: Date | null;
  created_at: Date;
  updated_at: Date;
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
    decayMeta: null,
    evidenceMeta: null,
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
    embeddingCache: row.embedding_cache ?? null,
    indexState: null,
  };
}

/**
 * Map a Drizzle revision row to KnowledgeRevisionRecord.
 */
function rowToKnowledgeRevision(row: DrizzleKnowledgeRevisionRow): KnowledgeRevisionRecord {
  return {
    revision: row.revision_no,
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
    revision: row.revision_no,
    state: row.state,
    note: row.note,
  };
}

/**
 * Map a maintenance assignment row to MaintenanceMetaRecord.
 */
function rowToMaintenanceMeta(row: MaintenanceAssignmentRow): MaintenanceMetaRecord {
  return {
    maintainerUserId: row.maintainer_user_id,
    maintainerHandle: row.maintainer_handle,
    maintainerLevel: row.maintainer_level,
    reviewBy: row.review_by ? row.review_by.toISOString() : null,
  };
}

/**
 * Insert boundary sub-tables for a knowledge entry.
 */
async function insertBoundarySubTables(
  client: import('pg').PoolClient,
  entryId: string,
  boundary: Boundary,
): Promise<void> {
  // Context labels
  for (const ctx of boundary.context) {
    await client.query(
      'INSERT INTO knowledge_boundary_contexts (entry_id, context_value) VALUES ($1, $2)',
      [entryId, ctx],
    );
  }

  // Version constraints
  for (const ver of boundary.versions) {
    await client.query(
      'INSERT INTO knowledge_boundary_versions (entry_id, package_name, range_value, note) VALUES ($1, $2, $3, $4)',
      [entryId, ver.package, ver.range, ver.note ?? null],
    );
  }

  // Prerequisites
  for (const prereq of boundary.prerequisites) {
    await client.query(
      'INSERT INTO knowledge_boundary_prerequisites (entry_id, description, kind, required) VALUES ($1, $2, $3, $4)',
      [entryId, prereq.description, prereq.kind ?? null, prereq.required ? 1 : 0],
    );
  }

  // Signals
  for (const sig of boundary.signals) {
    await client.query(
      'INSERT INTO knowledge_boundary_signals (entry_id, pattern, kind, description) VALUES ($1, $2, $3, $4)',
      [entryId, sig.pattern, sig.kind, sig.description ?? null],
    );
  }

  // Exclusions
  for (const exc of boundary.exclusions) {
    await client.query(
      'INSERT INTO knowledge_boundary_exclusions (entry_id, description, kind) VALUES ($1, $2, $3)',
      [entryId, exc.description, exc.kind ?? null],
    );
  }

  // Evidence
  for (const ev of boundary.evidence) {
    await client.query(
      'INSERT INTO knowledge_boundary_evidence (entry_id, kind, identifier, url, note) VALUES ($1, $2, $3, $4, $5)',
      [entryId, ev.kind, ev.identifier, ev.url ?? null, ev.note ?? null],
    );
  }
}

async function clearBoundarySubTables(
  client: import('pg').PoolClient,
  entryId: string,
): Promise<void> {
  await client.query('DELETE FROM knowledge_boundary_contexts WHERE entry_id = $1', [entryId]);
  await client.query('DELETE FROM knowledge_boundary_versions WHERE entry_id = $1', [entryId]);
  await client.query('DELETE FROM knowledge_boundary_prerequisites WHERE entry_id = $1', [entryId]);
  await client.query('DELETE FROM knowledge_boundary_signals WHERE entry_id = $1', [entryId]);
  await client.query('DELETE FROM knowledge_boundary_exclusions WHERE entry_id = $1', [entryId]);
  await client.query('DELETE FROM knowledge_boundary_evidence WHERE entry_id = $1', [entryId]);
}

function mergeCompatEntry(
  authoritative: KnowledgeRecord,
  shadow: KnowledgeRecord | null,
): KnowledgeRecord {
  if (!shadow) {
    return authoritative;
  }

  return {
    ...authoritative,
    latestRevision: shadow.latestRevision,
    history: shadow.history,
    metadata: shadow.metadata,
    latestSubmissionId: shadow.latestSubmissionId,
    submissionHistory: shadow.submissionHistory,
    agentReview: shadow.agentReview,
    reviewHistory: shadow.reviewHistory,
    reviewNotes: shadow.reviewNotes,
    lifecycleHistory: shadow.lifecycleHistory,
    embeddingCache: shadow.embeddingCache,
    indexState: shadow.indexState,
    boundary: shadow.boundary ?? authoritative.boundary,
    decayMeta: shadow.decayMeta,
    evidenceMeta: shadow.evidenceMeta,
    maintenanceMeta: shadow.maintenanceMeta ?? authoritative.maintenanceMeta,
    ...(shadow.remediation !== undefined
      ? { remediation: shadow.remediation }
      : authoritative.remediation !== undefined
        ? { remediation: authoritative.remediation }
        : {}),
    updatedAt: shadow.updatedAt,
  };
}

/**
 * Load boundary data from sub-tables for a knowledge entry.
 */
async function loadBoundaryFromSubTables(pool: Pool, entryId: string): Promise<Boundary | null> {
  const [contexts, versions, prerequisites, signals, exclusions, evidence] = await Promise.all([
    pool.query<{ context_value: string }>(
      'SELECT context_value FROM knowledge_boundary_contexts WHERE entry_id = $1 ORDER BY id',
      [entryId],
    ),
    pool.query<{ package_name: string; range_value: string; note: string | null }>(
      'SELECT package_name, range_value, note FROM knowledge_boundary_versions WHERE entry_id = $1 ORDER BY id',
      [entryId],
    ),
    pool.query<{ description: string; kind: string | null; required: number }>(
      'SELECT description, kind, required FROM knowledge_boundary_prerequisites WHERE entry_id = $1 ORDER BY id',
      [entryId],
    ),
    pool.query<{ pattern: string; kind: string; description: string | null }>(
      'SELECT pattern, kind, description FROM knowledge_boundary_signals WHERE entry_id = $1 ORDER BY id',
      [entryId],
    ),
    pool.query<{ description: string; kind: string | null }>(
      'SELECT description, kind FROM knowledge_boundary_exclusions WHERE entry_id = $1 ORDER BY id',
      [entryId],
    ),
    pool.query<{ kind: string; identifier: string; url: string | null; note: string | null }>(
      'SELECT kind, identifier, url, note FROM knowledge_boundary_evidence WHERE entry_id = $1 ORDER BY id',
      [entryId],
    ),
  ]);

  // If no boundary data exists in sub-tables, return null
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
    context: contexts.rows.map((r) => r.context_value),
    versions: versions.rows.map((r) => ({
      package: r.package_name,
      range: r.range_value,
      note: r.note ?? undefined,
    })),
    prerequisites: prerequisites.rows.map((r) => ({
      description: r.description,
      kind: (r.kind ?? undefined) as Boundary['prerequisites'][number]['kind'],
      required: r.required === 1,
    })),
    signals: signals.rows.map((r) => ({
      pattern: r.pattern,
      kind: r.kind as Boundary['signals'][number]['kind'],
      description: r.description ?? undefined,
    })),
    exclusions: exclusions.rows.map((r) => ({
      description: r.description,
      kind: (r.kind ?? undefined) as Boundary['exclusions'][number]['kind'],
    })),
    evidence: evidence.rows.map((r) => ({
      kind: r.kind as Boundary['evidence'][number]['kind'],
      identifier: r.identifier,
      url: r.url ?? undefined,
      note: r.note ?? undefined,
    })),
  };
}

/**
 * Reconstruct a full KnowledgeRecord from database rows.
 * Round 3: Accepts structured labels, boundary, and maintenance meta.
 */
function reconstructKnowledgeRecord(
  entryRow: DrizzleKnowledgeEntryRow,
  revisionRows: DrizzleKnowledgeRevisionRow[],
  eventRows: DrizzleLifecycleEventRow[],
  structuredLabels: string[],
  boundary: Boundary | null,
  maintenanceMeta: MaintenanceMetaRecord | null,
): KnowledgeRecord {
  const entry = rowToKnowledgeEntry(entryRow);

  // Round 3: Use structured labels from knowledge_labels table
  // Fall back to JSONB labels if structured labels are empty (migration period)
  if (structuredLabels.length > 0 || entryRow.labels.length === 0) {
    entry.labels = structuredLabels;
  }

  // Round 3: Use boundary from sub-tables, fall back to JSONB
  if (boundary !== null) {
    entry.boundary = boundary;
  }

  // Round 3: Use maintenance from structured table, fall back to JSONB
  if (maintenanceMeta !== null) {
    entry.maintenanceMeta = maintenanceMeta;
  }

  // Populate revisions
  const revisions = revisionRows.map(rowToKnowledgeRevision);
  entry.history = revisions;
  if (revisions.length > 0) {
    entry.latestRevision = revisions[revisions.length - 1]!;
  }

  // Populate lifecycle events
  const lifecycleHistory = eventRows.map(rowToLifecycleEvent);
  entry.lifecycleHistory = lifecycleHistory;

  entry.metadata.revisionCount = revisions.length > 0 ? revisions.length : 1;
  entry.metadata.latestSubmittedAt = revisions.at(-1)?.submittedAt ?? entry.createdAt;

  const reviewerEvents = lifecycleHistory.filter(
    (event) => event.type === 'reviewer-approved' || event.type === 'reviewer-rejected',
  );
  const latestReviewerEvent = reviewerEvents.at(-1) ?? null;
  if (latestReviewerEvent) {
    entry.metadata.latestReviewedAt = latestReviewerEvent.createdAt;
    entry.metadata.latestDecision =
      latestReviewerEvent.type === 'reviewer-approved' ? 'approve' : 'reject';
  } else {
    const latestAgentEvent = [...lifecycleHistory]
      .reverse()
      .find((event) => event.type === 'agent-reviewed');
    entry.metadata.latestReviewedAt = latestAgentEvent?.createdAt ?? null;
    entry.metadata.latestDecision = null;
  }

  const submissionIdByRevision = new Map<number, string>();
  for (const event of lifecycleHistory) {
    if (event.submissionId && event.revision !== null) {
      submissionIdByRevision.set(event.revision, event.submissionId);
    }
  }

  entry.submissionHistory = revisions.map((revision, index) => {
    const revisionNo = revision.revision;
    const submissionId =
      submissionIdByRevision.get(revisionNo) ?? `${entry.id}_submission_${revisionNo}`;
    const agentReviewedEvent = lifecycleHistory.find(
      (event) => event.type === 'agent-reviewed' && event.revision === revisionNo,
    );
    const reviewerEvent = lifecycleHistory.find(
      (event) =>
        (event.type === 'reviewer-approved' || event.type === 'reviewer-rejected') &&
        event.revision === revisionNo,
    );
    const submissionLifecycleState =
      reviewerEvent?.state ?? agentReviewedEvent?.state ?? entry.lifecycleState;
    const reviewNotes = revision.reviewNotes;
    const agentNotes = reviewNotes
      .filter((note) => note.authorType === 'agent')
      .map((note) => note.message);

    return {
      id: submissionId,
      revision: revisionNo,
      submittedAt: revision.submittedAt,
      submittedByUserId: revision.submittedByUserId,
      lifecycleState: submissionLifecycleState,
      resubmissionOf: index > 0 ? (entry.submissionHistory[index - 1]?.id ?? null) : null,
      agentReview: agentReviewedEvent
        ? {
            status: agentReviewedEvent.state as 'agent-pass' | 'agent-rejected',
            duplicateRisk: 'low',
            correctnessRisk: 'medium',
            completenessRisk: 'medium',
            checkedAt: agentReviewedEvent.createdAt,
            notes:
              agentNotes.length > 0
                ? agentNotes
                : agentReviewedEvent.note
                  ? [agentReviewedEvent.note]
                  : [],
          }
        : null,
      reviewerDecision: reviewerEvent?.actorUserId
        ? {
            decidedAt: reviewerEvent.createdAt,
            decidedByUserId: reviewerEvent.actorUserId,
            decision: reviewerEvent.type === 'reviewer-approved' ? 'approve' : 'reject',
            notes: reviewerEvent.note ?? '',
          }
        : null,
      reviewNotes,
    };
  });

  entry.latestSubmissionId = entry.submissionHistory.at(-1)?.id ?? null;
  entry.metadata.latestSubmissionId = entry.latestSubmissionId;
  entry.metadata.submissionCount = entry.submissionHistory.length;
  entry.metadata.resubmissionCount = Math.max(0, entry.submissionHistory.length - 1);

  entry.reviewHistory = entry.submissionHistory
    .map((submission) => submission.reviewerDecision)
    .filter((decision): decision is NonNullable<typeof decision> => decision !== null);
  entry.reviewNotes = revisions.flatMap((revision) => revision.reviewNotes);
  entry.agentReview = entry.submissionHistory.at(-1)?.agentReview ?? null;

  return entry;
}
