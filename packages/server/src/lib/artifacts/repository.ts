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

import { createRequire } from 'node:module';
import type { Boundary, LifecycleState, Scope } from '@trapmap/contracts';
import type { Pool } from 'pg';

import { transitionLifecycleState } from '../lifecycle/state-machine.js';
import type {
  SkillArtifactLifecycleEventRecord,
  SkillArtifactRecord,
  SkillArtifactRevisionRecord,
  SkillShareerStore,
} from '../store.js';

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
   * Throws error if artifact not found or invalid transition.
   */
  updateLifecycle(
    artifactId: string,
    newState: LifecycleState,
    context: { actorId: string; note?: string },
  ): Promise<void>;

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

/**
 * Dual-write repository that writes to both primary and JSONB shadow.
 * Used during transition from JSONB snapshot to row-level PostgreSQL tables.
 *
 * Writes go to primary first (PostgreSQL), then shadow to JSONB via store.transact().
 * If shadow fails, relational data is authoritative.
 */
export class DualWriteArtifactRepository implements ArtifactRepository {
  constructor(
    private readonly primary: ArtifactRepository,
    private readonly store: SkillShareerStore,
  ) {}

  async nextId(): Promise<string> {
    return this.primary.nextId();
  }

  async insert(artifact: SkillArtifactRecord): Promise<void> {
    await this.primary.insert(artifact);
    await this.store.transact((data) => {
      if (!data.skillArtifacts) {
        data.skillArtifacts = [];
      }
      data.skillArtifacts.push(artifact);
    });
  }

  async getById(artifactId: string): Promise<SkillArtifactRecord | null> {
    return this.primary.getById(artifactId);
  }

  async updateLifecycle(
    artifactId: string,
    newState: LifecycleState,
    context: { actorId: string; note?: string },
  ): Promise<void> {
    await this.primary.updateLifecycle(artifactId, newState, context);
    await this.store.transact((data) => {
      const artifact = data.skillArtifacts?.find((a) => a.id === artifactId);
      if (artifact) {
        transitionLifecycleState(artifact, newState, 'dual-write update');
        artifact.updatedAt = new Date().toISOString();
      }
    });
  }

  async appendRevision(artifactId: string, revision: SkillArtifactRevisionRecord): Promise<void> {
    await this.primary.appendRevision(artifactId, revision);
    await this.store.transact((data) => {
      const artifact = data.skillArtifacts?.find((a) => a.id === artifactId);
      if (artifact) {
        artifact.history.push(revision);
        artifact.latestRevision = revision;
        artifact.updatedAt = new Date().toISOString();
      }
    });
  }

  async updateRevisionDerived(
    artifactId: string,
    revision: number,
    derived: SkillArtifactRecord['latestRevision']['derived'],
  ): Promise<void> {
    await this.primary.updateRevisionDerived(artifactId, revision, derived);
    await this.store.transact((data) => {
      const artifact = data.skillArtifacts?.find((a) => a.id === artifactId);
      if (artifact) {
        const rev = artifact.history.find((r) => r.revision === revision);
        if (rev) {
          rev.derived = derived;
          if (artifact.latestRevision.revision === revision) {
            artifact.latestRevision.derived = derived;
          }
        }
        artifact.updatedAt = new Date().toISOString();
      }
    });
  }

  async appendLifecycleEvent(
    artifactId: string,
    event: SkillArtifactLifecycleEventRecord,
  ): Promise<void> {
    await this.primary.appendLifecycleEvent(artifactId, event);
    await this.store.transact((data) => {
      const artifact = data.skillArtifacts?.find((a) => a.id === artifactId);
      if (artifact) {
        artifact.lifecycleHistory.push(event);
      }
    });
  }

  async listByFilter(filter: {
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
  }): Promise<SkillArtifactRecord[]> {
    return this.primary.listByFilter(filter);
  }

  async updateGovernance(
    artifactId: string,
    governance: { labels?: string[]; requiredLevel?: number; title?: string },
  ): Promise<void> {
    await this.primary.updateGovernance(artifactId, governance);
    await this.store.transact((data) => {
      const artifact = data.skillArtifacts?.find((a) => a.id === artifactId);
      if (artifact) {
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
      }
    });
  }
}

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
  ): Promise<void> {
    await this.store.transact((data) => {
      const artifact = data.skillArtifacts?.find((a) => a.id === artifactId);
      if (!artifact) {
        throw new Error(`Artifact ${artifactId} not found`);
      }
      transitionLifecycleState(artifact, newState, context.note ?? 'update');
      artifact.updatedAt = new Date().toISOString();
    });
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

  async listByFilter(filter: {
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
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
    // Dynamic import to avoid loading pg module in test environments
    const require = createRequire(import.meta.url);
    const { PgArtifactRepository } = require('./pg-repository.js') as {
      PgArtifactRepository: new (pool: Pool) => ArtifactRepository;
    };
    // Phase 63: PostgreSQL-only, no JSONB shadow writes
    return new PgArtifactRepository(config.pool);
  }
  return new InMemoryArtifactRepository(config.store);
}
