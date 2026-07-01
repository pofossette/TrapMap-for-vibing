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
 * - reader.ts: read/query operations (getById, listByFilter, listForRetrieval)
 * - writer.ts: write/mutation operations (insert, appendRevision, etc.)
 * - lifecycle.ts: lifecycle state transitions with state-machine validation
 *
 * Phase: 63 (WRITE-03)
 */

import type { LifecycleState } from '@trapmap/contracts';
import type { Pool } from 'pg';

import type { ArtifactRepository } from '@trapmap/server/lib/artifacts/repository.js';
import type {
  SkillArtifactLifecycleEventRecord,
  SkillArtifactRecord,
  SkillArtifactRevisionRecord,
} from '@trapmap/server/lib/store.js';

import { updateArtifactLifecycle } from './lifecycle.js';
import { getArtifactById, listArtifactsByFilter, listArtifactsForRetrieval } from './reader.js';
import {
  appendArtifactLifecycleEvent,
  appendArtifactRevision,
  insertArtifact,
  updateArtifactGovernance,
  updateRevisionDerivedData,
} from './writer.js';

/**
 * PostgreSQL-backed repository for skill artifact CRUD operations.
 * Implements row-level locking for concurrent-safe updates.
 */
export class PgArtifactRepository implements ArtifactRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * Generate a new unique artifact ID using PostgreSQL SEQUENCE.
   */
  async nextId(): Promise<string> {
    const result = await this.pool.query<{ id: string }>(
      "SELECT nextval('skill_artifact_id_seq')::text AS id",
    );
    return `artifact_${result.rows[0]!.id}`;
  }

  async insert(artifact: SkillArtifactRecord): Promise<void> {
    return insertArtifact(this.pool, artifact);
  }

  async getById(artifactId: string): Promise<SkillArtifactRecord | null> {
    return getArtifactById(this.pool, artifactId);
  }

  async updateLifecycle(
    artifactId: string,
    newState: LifecycleState,
    context: { actorId: string; note?: string },
  ): Promise<SkillArtifactRecord> {
    return updateArtifactLifecycle(this.pool, artifactId, newState, context);
  }

  async appendRevision(artifactId: string, revision: SkillArtifactRevisionRecord): Promise<void> {
    return appendArtifactRevision(this.pool, artifactId, revision);
  }

  async updateRevisionDerived(
    artifactId: string,
    revision: number,
    derived: SkillArtifactRecord['latestRevision']['derived'],
  ): Promise<void> {
    return updateRevisionDerivedData(this.pool, artifactId, revision, derived);
  }

  async appendLifecycleEvent(
    artifactId: string,
    event: SkillArtifactLifecycleEventRecord,
  ): Promise<void> {
    return appendArtifactLifecycleEvent(this.pool, artifactId, event);
  }

  async listByFilter(filter: {
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
    maintainerUserId?: string;
  }): Promise<SkillArtifactRecord[]> {
    return listArtifactsByFilter(this.pool, filter);
  }

  async listForRetrieval(filter: {
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
    maintainerUserId?: string;
  }): Promise<SkillArtifactRecord[]> {
    return listArtifactsForRetrieval(this.pool, filter);
  }

  async updateGovernance(
    artifactId: string,
    governance: { labels?: string[]; requiredLevel?: number; title?: string },
  ): Promise<void> {
    return updateArtifactGovernance(this.pool, artifactId, governance);
  }
}
