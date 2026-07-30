import type { Pool, PoolClient } from 'pg';

import type {
  LegacyArtifactSnapshotOwner,
  LegacyArtifactSnapshotRecord,
} from './wave9-artifact-backfill.js';

type Queryable = Pick<Pool, 'query'>;
type TransactionPool = Queryable & Pick<Pool, 'connect'>;
type TransactionClient = Pick<PoolClient, 'query' | 'release'>;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function allRevisions(record: LegacyArtifactSnapshotRecord) {
  const revisions = [...record.history];
  if (!revisions.some((revision) => revision.revision === record.latestRevision.revision)) {
    revisions.push(record.latestRevision);
  }
  return revisions.sort((left, right) => left.revision - right.revision);
}

async function insertArtifact(client: TransactionClient, record: LegacyArtifactSnapshotRecord) {
  const metadata = {
    ...record.metadata,
    legacySnapshotRecord: record,
  };
  await client.query(
    `INSERT INTO skill_artifacts (
       id, team_id, scope, labels, title, slug, required_level, lifecycle_state, owner_user_id,
       metadata, agent_review, maintenance_meta, boundary, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
     )`,
    [
      record.id,
      record.teamId,
      record.scope,
      JSON.stringify(record.labels),
      record.title,
      record.slug,
      record.requiredLevel,
      record.lifecycleState,
      record.ownerUserId,
      JSON.stringify(metadata),
      JSON.stringify(record.agentReview),
      JSON.stringify(record.maintenanceMeta),
      JSON.stringify(record.boundary),
      record.createdAt,
      record.updatedAt,
    ],
  );
}

async function insertRevisions(client: TransactionClient, record: LegacyArtifactSnapshotRecord) {
  for (const revision of allRevisions(record)) {
    await client.query(
      `INSERT INTO artifact_revisions (
         id, artifact_id, revision_no, source_hash, files, script_descriptors, derived,
         submitted_at, submitted_by_user_id, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        `${record.id}_rev${revision.revision}`,
        record.id,
        revision.revision,
        revision.sourceHash,
        JSON.stringify(revision.files),
        JSON.stringify(revision.scriptDescriptors),
        JSON.stringify(revision.derived),
        revision.submittedAt,
        revision.submittedByUserId,
        revision.submittedAt,
      ],
    );
  }
}

async function insertLifecycleEvents(
  client: TransactionClient,
  record: LegacyArtifactSnapshotRecord,
) {
  for (const event of record.lifecycleHistory) {
    await client.query(
      `INSERT INTO artifact_lifecycle_events (
         id, artifact_id, type, created_at, actor_user_id, submission_id, revision_no, state, note
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        event.id,
        record.id,
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
}

async function withTransaction(
  pool: TransactionPool,
  operation: (client: TransactionClient) => Promise<void>,
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await operation(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Creates the Task 9-only owner adapter for lossless legacy skill artifact migration. */
export function createArtifactSnapshotOwner(pool: Queryable): LegacyArtifactSnapshotOwner {
  return {
    async put(record) {
      if (!('connect' in pool) || typeof pool.connect !== 'function') {
        throw new Error('Artifact snapshot owner requires a PostgreSQL transaction pool');
      }
      await withTransaction(pool as TransactionPool, async (client) => {
        await insertArtifact(client, record);
        await insertRevisions(client, record);
        await insertLifecycleEvents(client, record);
      });
    },
    async get(recordId) {
      const { rows } = await pool.query('SELECT metadata FROM skill_artifacts WHERE id = $1', [
        recordId,
      ]);
      const metadata = asRecord((rows[0] as { metadata?: unknown } | undefined)?.metadata);
      const snapshot = metadata.legacySnapshotRecord;
      return snapshot === undefined ? null : (snapshot as LegacyArtifactSnapshotRecord);
    },
  };
}
