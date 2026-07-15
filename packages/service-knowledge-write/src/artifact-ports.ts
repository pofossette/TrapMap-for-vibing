// fallow-ignore-file complexity -- artifact row mapping mirrors the frozen contract shape.
import { randomUUID } from 'node:crypto';
import type {
  ArtifactReadProjection,
  LifecycleState,
  SkillArtifact,
  SkillArtifactDerived,
  SkillArtifactLifecycleEvent,
  SkillArtifactRevision,
} from '@trapmap/contracts';
import type { Pool } from 'pg';

export interface ArtifactWritePort {
  nextId(): Promise<string>;
  insert(artifact: SkillArtifact): Promise<void>;
  updateLifecycle(
    artifactId: string,
    newState: LifecycleState,
    context: { actorId: string; note?: string },
  ): Promise<SkillArtifact>;
  appendRevision(artifactId: string, revision: SkillArtifactRevision): Promise<void>;
  updateRevisionDerived(
    artifactId: string,
    revision: number,
    derived: SkillArtifactDerived | null,
  ): Promise<void>;
  appendLifecycleEvent(artifactId: string, event: SkillArtifactLifecycleEvent): Promise<void>;
  importArtifact(input: Record<string, unknown>): Promise<SkillArtifact>;
  editArtifact(artifactId: string, input: Record<string, unknown>): Promise<SkillArtifact>;
  review(
    artifactId: string,
    decision: 'approve' | 'reject',
    actorId: string,
    note?: string,
  ): Promise<SkillArtifact>;
  activate(input: Record<string, unknown>): Promise<SkillArtifact>;
}

type Queryable = Pick<Pool, 'query' | 'connect'>;

const id = (prefix: string) => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 16)}`;

function artifactLifecycleEventName(state: LifecycleState): string {
  if (state === 'approved') return 'artifact.approved';
  if (state === 'rejected') return 'artifact.rejected';
  if (state === 'deactivated') return 'artifact.deactivated';
  return 'artifact.lifecycle-updated';
}

function rowToArtifact(
  row: Record<string, unknown>,
  revisions: SkillArtifactRevision[],
  events: SkillArtifactLifecycleEvent[],
): SkillArtifact {
  return {
    ...(row as unknown as SkillArtifact),
    id: String(row.id),
    teamId: (row.team_id as string | null) ?? null,
    requiredLevel: Number(row.required_level ?? 0),
    lifecycleState: row.lifecycle_state as LifecycleState,
    owner: {
      id: String(row.owner_user_id),
      handle: String(row.owner_handle ?? row.owner_user_id),
      securityLevel: Number(row.owner_security_level ?? 0),
    },
    latestRevision: revisions.at(-1)?.revision ?? 1,
    history: revisions,
    lifecycleHistory: events,
    labels: (row.labels as string[]) ?? [],
    metadata: row.metadata as SkillArtifact['metadata'],
    agentReview: (row.agent_review as SkillArtifact['agentReview']) ?? null,
    maintenanceMeta: (row.maintenance_meta as SkillArtifact['maintenanceMeta']) ?? null,
    boundaryMeta: (row.boundary as SkillArtifact['boundaryMeta']) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapRevision(row: Record<string, unknown>): SkillArtifactRevision {
  return {
    revision: Number(row.revision_no),
    sourceHash: String(row.source_hash),
    files: (row.files as SkillArtifactRevision['files']) ?? [],
    scriptDescriptors: (row.script_descriptors as SkillArtifactRevision['scriptDescriptors']) ?? [],
    derived: (row.derived as SkillArtifactRevision['derived']) ?? null,
    submittedAt: String(row.submitted_at),
    submittedBy: {
      id: String(row.submitted_by_user_id),
      handle: String(row.submitted_by_handle ?? row.submitted_by_user_id),
      securityLevel: Number(row.submitted_by_security_level ?? 0),
    },
  };
}

function mapEvent(row: Record<string, unknown>): SkillArtifactLifecycleEvent {
  return {
    id: String(row.id),
    type: row.type as SkillArtifactLifecycleEvent['type'],
    createdAt: String(row.created_at),
    actor: row.actor_user_id
      ? { id: String(row.actor_user_id), handle: String(row.actor_user_id), securityLevel: 0 }
      : null,
    submissionId: (row.submission_id as string | null) ?? null,
    revision: (row.revision_no as number | null) ?? null,
    state: row.state as LifecycleState,
    note: (row.note as string | null) ?? null,
  };
}

async function resolveArtifacts(
  rows: unknown[],
  getById: (artifactId: string) => Promise<SkillArtifact | null>,
): Promise<SkillArtifact[]> {
  const artifacts = await Promise.all(
    rows.map((row) => getById(String((row as Record<string, unknown>).id))),
  );
  return artifacts.filter((artifact): artifact is SkillArtifact => Boolean(artifact));
}

export function createArtifactReadProjection(pool: Pick<Pool, 'query'>): ArtifactReadProjection {
  const getById = async (artifactId: string): Promise<SkillArtifact | null> => {
    const result = await pool.query('SELECT * FROM skill_artifacts WHERE id = $1', [artifactId]);
    if (!result.rows[0]) return null;
    const revisions = await pool.query(
      'SELECT * FROM artifact_revisions WHERE artifact_id = $1 ORDER BY revision_no',
      [artifactId],
    );
    const events = await pool.query(
      'SELECT * FROM artifact_lifecycle_events WHERE artifact_id = $1 ORDER BY created_at',
      [artifactId],
    );
    return rowToArtifact(
      result.rows[0] as Record<string, unknown>,
      revisions.rows.map((row) => mapRevision(row as Record<string, unknown>)),
      events.rows.map((row) => mapEvent(row as Record<string, unknown>)),
    );
  };
  const listByFilter = async (filter: Parameters<ArtifactReadProjection['listByFilter']>[0]) => {
    const result = await pool.query(
      `SELECT id FROM skill_artifacts
       WHERE ($1::text IS NULL OR lifecycle_state = $1)
         AND ($2::text IS NULL OR team_id = $2)
         AND ($3::text IS NULL OR owner_user_id = $3)
         AND ($4::text IS NULL OR maintenance_meta->>'maintainerUserId' = $4)
       ORDER BY created_at`,
      [
        filter.lifecycleState ?? null,
        filter.teamId ?? null,
        filter.ownerUserId ?? null,
        filter.maintainerUserId ?? null,
      ],
    );
    return resolveArtifacts(result.rows, getById);
  };
  return {
    getById,
    listByFilter,
    listForRetrieval: listByFilter,
    async history(artifactId) {
      const result = await pool.query(
        'SELECT * FROM artifact_revisions WHERE artifact_id = $1 ORDER BY revision_no',
        [artifactId],
      );
      return result.rows.map((row) => mapRevision(row as Record<string, unknown>));
    },
    async exportArtifacts(input) {
      const result = await pool.query(
        'SELECT id FROM skill_artifacts WHERE ($1::text IS NULL OR id = $1) ORDER BY created_at',
        [typeof input.artifactId === 'string' ? input.artifactId : null],
      );
      return resolveArtifacts(result.rows, getById);
    },
    async reviewQueue() {
      return listByFilter({ lifecycleState: 'submitted' });
    },
  };
}

export function createArtifactWritePort(pool: Queryable): ArtifactWritePort {
  const read = createArtifactReadProjection(pool);
  return {
    async nextId() {
      return id('artifact');
    },
    async insert(artifact) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO skill_artifacts (id, team_id, scope, labels, title, slug, required_level, lifecycle_state, owner_user_id, metadata, agent_review, maintenance_meta, boundary, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            artifact.id,
            artifact.teamId,
            artifact.scope,
            JSON.stringify(artifact.labels),
            artifact.title,
            artifact.slug,
            artifact.requiredLevel,
            artifact.lifecycleState,
            artifact.owner.id,
            JSON.stringify(artifact.metadata),
            JSON.stringify(artifact.agentReview),
            JSON.stringify(artifact.maintenanceMeta),
            JSON.stringify(artifact.boundaryMeta ?? null),
            artifact.createdAt,
            artifact.updatedAt,
          ],
        );
        for (const revision of artifact.history) {
          await client.query(
            'INSERT INTO artifact_revisions (id, artifact_id, revision_no, source_hash, files, script_descriptors, derived, submitted_at, submitted_by_user_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
            [
              `${artifact.id}_rev${revision.revision}`,
              artifact.id,
              revision.revision,
              revision.sourceHash,
              JSON.stringify(revision.files),
              JSON.stringify(revision.scriptDescriptors),
              JSON.stringify(revision.derived ?? null),
              revision.submittedAt,
              revision.submittedBy.id,
              revision.submittedAt,
            ],
          );
        }
        for (const event of artifact.lifecycleHistory) {
          await client.query(
            'INSERT INTO artifact_lifecycle_events (id, artifact_id, type, created_at, actor_user_id, submission_id, revision_no, state, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
            [
              event.id,
              artifact.id,
              event.type,
              event.createdAt,
              event.actor?.id ?? null,
              event.submissionId ?? null,
              event.revision ?? null,
              event.state,
              event.note ?? null,
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
    },
    async updateLifecycle(artifactId, newState, context) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const current = await client.query(
          'SELECT lifecycle_state FROM skill_artifacts WHERE id = $1 FOR UPDATE',
          [artifactId],
        );
        if (!current.rows[0]) throw new Error(`Artifact ${artifactId} not found`);
        await client.query(
          'UPDATE skill_artifacts SET lifecycle_state = $2, updated_at = NOW() WHERE id = $1',
          [artifactId, newState],
        );
        await client.query(
          'INSERT INTO artifact_lifecycle_events (id, artifact_id, type, created_at, actor_user_id, state, note) VALUES ($1,$2,$3,NOW(),$4,$5,$6)',
          [
            id('artifact_event'),
            artifactId,
            'updated',
            context.actorId,
            newState,
            context.note ?? null,
          ],
        );
        const eventName = artifactLifecycleEventName(newState);
        await client.query(
          `INSERT INTO domain_event_outbox (
             id, aggregate_type, aggregate_id, event_name, payload, status, available_at, attempts, created_at
           ) VALUES ($1, 'artifact', $2, $3, $4, 'pending', NOW(), 0, NOW())`,
          [
            id('evt'),
            artifactId,
            eventName,
            JSON.stringify({
              name: eventName,
              artifactId,
              previousState: current.rows[0].lifecycle_state,
              nextState: newState,
              actorId: context.actorId,
              reason: context.note ?? 'knowledge-write artifact lifecycle update',
              timestamp: new Date().toISOString(),
            }),
          ],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
      const updated = await read.getById(artifactId);
      if (!updated) throw new Error(`Artifact ${artifactId} not found`);
      return updated;
    },
    async appendRevision(artifactId, revision) {
      await pool.query(
        'INSERT INTO artifact_revisions (id, artifact_id, revision_no, source_hash, files, script_descriptors, derived, submitted_at, submitted_by_user_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())',
        [
          `${artifactId}_rev${revision.revision}`,
          artifactId,
          revision.revision,
          revision.sourceHash,
          JSON.stringify(revision.files),
          JSON.stringify(revision.scriptDescriptors),
          JSON.stringify(revision.derived ?? null),
          revision.submittedAt,
          revision.submittedBy.id,
        ],
      );
      await pool.query('UPDATE skill_artifacts SET updated_at = NOW() WHERE id = $1', [artifactId]);
    },
    async updateRevisionDerived(artifactId, revision, derived) {
      await pool.query(
        'UPDATE artifact_revisions SET derived = $3 WHERE artifact_id = $1 AND revision_no = $2',
        [artifactId, revision, JSON.stringify(derived)],
      );
    },
    async appendLifecycleEvent(artifactId, event) {
      await pool.query(
        'INSERT INTO artifact_lifecycle_events (id, artifact_id, type, created_at, actor_user_id, submission_id, revision_no, state, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          event.id,
          artifactId,
          event.type,
          event.createdAt,
          event.actor?.id ?? null,
          event.submissionId ?? null,
          event.revision ?? null,
          event.state,
          event.note ?? null,
        ],
      );
    },
    async importArtifact(input) {
      const artifact = input as unknown as SkillArtifact;
      if (!artifact.id) artifact.id = await this.nextId();
      await this.insert(artifact);
      return (await read.getById(artifact.id)) ?? artifact;
    },
    async editArtifact(artifactId, input) {
      const current = await read.getById(artifactId);
      if (!current) throw new Error(`Artifact ${artifactId} not found`);
      const updates =
        input.updates && typeof input.updates === 'object'
          ? (input.updates as Partial<SkillArtifact>)
          : (input as Partial<SkillArtifact>);
      await pool.query(
        'UPDATE skill_artifacts SET title = COALESCE($2,title), labels = COALESCE($3,labels), metadata = COALESCE($4,metadata), updated_at = NOW() WHERE id = $1',
        [
          artifactId,
          updates.title ?? null,
          updates.labels ? JSON.stringify(updates.labels) : null,
          updates.metadata ? JSON.stringify(updates.metadata) : null,
        ],
      );
      return (await read.getById(artifactId)) ?? current;
    },
    async review(artifactId, decision, actorId, note) {
      return this.updateLifecycle(artifactId, decision === 'approve' ? 'approved' : 'rejected', {
        actorId,
        ...(note ? { note } : {}),
      });
    },
    async activate(input) {
      const artifactId = String(input.artifactId ?? input.id);
      return this.updateLifecycle(artifactId, 'approved', {
        actorId: String(input.actorId ?? 'system'),
      });
    },
  };
}
