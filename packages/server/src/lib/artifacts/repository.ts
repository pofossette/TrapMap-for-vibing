/**
 * Repository interface and implementations for skill artifact persistence.
 *
 * This module provides:
 * - ArtifactRepository interface abstracting CRUD operations
 * - DualWriteArtifactRepository for transition from JSONB to PostgreSQL
 * - InMemoryArtifactRepository for tests without PostgreSQL
 * - Factory function for repository selection
 *
 * Phase: 63 (WRITE-03)
 */

import type { LifecycleState } from '@trapmap/contracts';
import type { Pool } from 'pg';

import { transitionLifecycleState } from '@trapmap/server/lib/lifecycle/state-machine.js';
import type {
  SkillArtifactLifecycleEventRecord,
  SkillArtifactRecord,
  SkillArtifactRevisionRecord,
  SkillShareerStore,
} from '@trapmap/server/lib/store.js';
import { PgArtifactRepository } from './pg-repository.js';

/**
 * Repository interface for skill artifact CRUD operations.
 * Abstracts whether data lives in JSONB or dedicated PostgreSQL tables.
 *
 * This interface enables the dual-write pattern during transition
 * from JSONB snapshot storage to row-level PostgreSQL tables.
 */
export interface ArtifactRepository {
  /**
   * Generate a new unique artifact ID using PostgreSQL SEQUENCE.
   */
  nextId(): Promise<string>;

  /**
   * Insert a new artifact with all related data.
   * The artifact ID should be pre-generated via nextId().
   */
  insert(artifact: SkillArtifactRecord): Promise<void>;

  /**
   * Get an artifact by ID with all related data.
   * Returns null if the artifact does not exist.
   */
  getById(artifactId: string): Promise<SkillArtifactRecord | null>;

  /**
   * Update lifecycle state with row-level locking.
   * Uses SELECT FOR UPDATE for row-level locking.
   * Validates transition using state machine.
   * Returns the updated artifact record with appended lifecycle history.
   * Throws error if artifact not found or invalid transition.
   */
  updateLifecycle(
    artifactId: string,
    newState: LifecycleState,
    context: { actorId: string; note?: string },
  ): Promise<SkillArtifactRecord>;

  /**
   * Append a new revision with row-level locking.
   * Updates the latest_revision columns on the artifact.
   * Uses SELECT FOR UPDATE for row-level locking.
   */
  appendRevision(artifactId: string, revision: SkillArtifactRevisionRecord): Promise<void>;

  /**
   * Update derived outputs on a specific revision.
   * Used for caching derived profile, capsules, and client manifest.
   */
  updateRevisionDerived(
    artifactId: string,
    revision: number,
    derived: SkillArtifactRecord['latestRevision']['derived'],
  ): Promise<void>;

  /**
   * Append a lifecycle event to an artifact's history.
   */
  appendLifecycleEvent(artifactId: string, event: SkillArtifactLifecycleEventRecord): Promise<void>;

  /**
   * List artifacts by filter criteria.
   * Returns lightweight records without full revision history.
   */
  listByFilter(filter: {
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
    maintainerUserId?: string;
  }): Promise<SkillArtifactRecord[]>;

  /**
   * List artifacts for retrieval with derived capsule data hydrated.
   * Unlike listByFilter, this ensures latestRevision.derived is populated
   * so capsule recall channels can read capsule content.
   */
  listForRetrieval(filter: {
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
    maintainerUserId?: string;
  }): Promise<SkillArtifactRecord[]>;

  /**
   * Update governance fields with row-level locking.
   * Uses SELECT FOR UPDATE for row-level locking.
   */
  updateGovernance(
    artifactId: string,
    governance: { labels?: string[]; requiredLevel?: number; title?: string },
  ): Promise<void>;
}

// Round 2: DualWriteArtifactRepository removed.
// Writes go exclusively to PostgreSQL via PgArtifactRepository.
// store_snapshot JSONB is no longer a write target for artifact operations.

/**
 * In-memory repository that uses JsonStore for all operations.
 * Used when no PostgreSQL pool is available (tests, local dev).
 */
export class InMemoryArtifactRepository implements ArtifactRepository {
  constructor(private readonly store: SkillShareerStore) {}

  async nextId(): Promise<string> {
    const data = await this.store.snapshot();
    return this.store.nextId(data, 'artifact');
  }

  async insert(artifact: SkillArtifactRecord): Promise<void> {
    await this.store.transact((data) => {
      if (!data.skillArtifacts) {
        data.skillArtifacts = [];
      }
      data.skillArtifacts.push(artifact);
    });
  }

  async getById(artifactId: string): Promise<SkillArtifactRecord | null> {
    const data = await this.store.snapshot();
    return data.skillArtifacts?.find((a) => a.id === artifactId) ?? null;
  }

  async updateLifecycle(
    artifactId: string,
    newState: LifecycleState,
    context: { actorId: string; note?: string },
  ): Promise<SkillArtifactRecord> {
    let updated: SkillArtifactRecord;
    await this.store.transact((data) => {
      const artifact = data.skillArtifacts?.find((a) => a.id === artifactId);
      if (!artifact) {
        throw new Error(`Artifact ${artifactId} not found`);
      }
      transitionLifecycleState(artifact, newState, context.note ?? 'update');
      artifact.updatedAt = new Date().toISOString();
      const now = artifact.updatedAt;
      const event: SkillArtifactLifecycleEventRecord = {
        id: this.store.nextId(data, 'artifact_event'),
        type: 'updated',
        createdAt: now,
        actorUserId: context.actorId,
        submissionId: null,
        revision: null,
        state: newState,
        note: context.note ?? null,
      };
      artifact.lifecycleHistory.push(event);
      updated = artifact;
    });
    return updated!;
  }

  async appendRevision(artifactId: string, revision: SkillArtifactRevisionRecord): Promise<void> {
    await this.store.transact((data) => {
      const artifact = data.skillArtifacts?.find((a) => a.id === artifactId);
      if (!artifact) {
        throw new Error(`Artifact ${artifactId} not found`);
      }
      artifact.history.push(revision);
      artifact.latestRevision = revision;
      artifact.updatedAt = new Date().toISOString();
    });
  }

  async updateRevisionDerived(
    artifactId: string,
    revision: number,
    derived: SkillArtifactRecord['latestRevision']['derived'],
  ): Promise<void> {
    await this.store.transact((data) => {
      const artifact = data.skillArtifacts?.find((a) => a.id === artifactId);
      if (!artifact) {
        throw new Error(`Artifact ${artifactId} not found`);
      }
      const rev = artifact.history.find((r) => r.revision === revision);
      if (rev) {
        rev.derived = derived;
        if (artifact.latestRevision.revision === revision) {
          artifact.latestRevision.derived = derived;
        }
      }
      artifact.updatedAt = new Date().toISOString();
    });
  }

  async appendLifecycleEvent(
    artifactId: string,
    event: SkillArtifactLifecycleEventRecord,
  ): Promise<void> {
    await this.store.transact((data) => {
      const artifact = data.skillArtifacts?.find((a) => a.id === artifactId);
      if (!artifact) {
        throw new Error(`Artifact ${artifactId} not found`);
      }
      artifact.lifecycleHistory.push(event);
    });
  }

  async listForRetrieval(filter: {
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
    maintainerUserId?: string;
  }): Promise<SkillArtifactRecord[]> {
    // InMemory store returns full records with derived data already populated
    return this.listByFilter(filter);
  }

  async listByFilter(filter: {
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
    maintainerUserId?: string;
  }): Promise<SkillArtifactRecord[]> {
    const data = await this.store.snapshot();
    return (data.skillArtifacts ?? []).filter((artifact) => {
      if (
        filter.lifecycleState !== undefined &&
        artifact.lifecycleState !== filter.lifecycleState
      ) {
        return false;
      }
      if (filter.teamId !== undefined && artifact.teamId !== filter.teamId) {
        return false;
      }
      if (filter.ownerUserId !== undefined && artifact.ownerUserId !== filter.ownerUserId) {
        return false;
      }
      if (
        filter.maintainerUserId !== undefined &&
        artifact.maintenanceMeta?.maintainerUserId !== filter.maintainerUserId
      ) {
        return false;
      }
      return true;
    });
  }

  async updateGovernance(
    artifactId: string,
    governance: { labels?: string[]; requiredLevel?: number; title?: string },
  ): Promise<void> {
    await this.store.transact((data) => {
      const artifact = data.skillArtifacts?.find((a) => a.id === artifactId);
      if (!artifact) {
        throw new Error(`Artifact ${artifactId} not found`);
      }
      if (governance.labels !== undefined) {
        artifact.labels = governance.labels;
      }
      if (governance.requiredLevel !== undefined) {
        artifact.requiredLevel = governance.requiredLevel;
      }
      if (governance.title !== undefined) {
        artifact.title = governance.title;
      }
      artifact.updatedAt = new Date().toISOString();
    });
  }
}

/**
 * Factory function to create the appropriate ArtifactRepository.
 * Returns PgArtifactRepository when pool is available,
 * InMemoryArtifactRepository otherwise.
 *
 * Phase 63: PostgreSQL-only, no JSONB shadow writes.
 */
export function createArtifactRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): ArtifactRepository {
  if (config.pool) {
    // Phase 63: PostgreSQL-only, no JSONB shadow writes
    return new PgArtifactRepository(config.pool);
  }
  return new InMemoryArtifactRepository(config.store);
}
