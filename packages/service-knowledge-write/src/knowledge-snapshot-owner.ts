import type { Pool, PoolClient } from 'pg';

import type {
  KnowledgeSnapshotOwner,
  LegacyKnowledgeSnapshotRecord,
} from './knowledge-snapshot-backfill.js';

type Queryable = Pick<Pool, 'query'>;
type TransactionPool = Queryable & Pick<Pool, 'connect'>;
type TransactionClient = Pick<PoolClient, 'query' | 'release'>;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function allRevisions(record: LegacyKnowledgeSnapshotRecord) {
  const revisions = [...record.history];
  if (!revisions.some((revision) => revision.revision === record.latestRevision.revision)) {
    revisions.push(record.latestRevision);
  }
  return revisions.sort((left, right) => left.revision - right.revision);
}

async function insertEntry(client: TransactionClient, record: LegacyKnowledgeSnapshotRecord) {
  const metadata = {
    ...record.metadata,
    legacySnapshotRecord: record,
  };
  await client.query(
    `INSERT INTO knowledge_entries (
       id, team_id, scope, labels, shortcut, detail, required_level, lifecycle_state, owner_user_id,
       boundary, maintenance_meta, embedding_cache, metadata, agent_review, index_state, decay_meta,
       evidence_meta, remediation, created_at, updated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
     )`,
    [
      record.id,
      record.teamId,
      record.scope,
      JSON.stringify(record.labels),
      record.shortcut,
      record.detail,
      record.requiredLevel,
      record.lifecycleState,
      record.ownerUserId,
      JSON.stringify(record.boundary),
      JSON.stringify(record.maintenanceMeta),
      JSON.stringify(record.embeddingCache),
      JSON.stringify(metadata),
      JSON.stringify(record.agentReview),
      JSON.stringify(record.indexState),
      JSON.stringify(record.decayMeta),
      JSON.stringify(record.evidenceMeta),
      JSON.stringify(record.remediation),
      record.createdAt,
      record.updatedAt,
    ],
  );
}

async function insertLabels(client: TransactionClient, record: LegacyKnowledgeSnapshotRecord) {
  for (const label of record.labels) {
    await client.query(
      'INSERT INTO knowledge_labels (entry_id, label, created_at) VALUES ($1, $2, $3)',
      [record.id, label, record.createdAt],
    );
  }
}

async function insertRevisions(client: TransactionClient, record: LegacyKnowledgeSnapshotRecord) {
  for (const revision of allRevisions(record)) {
    await client.query(
      `INSERT INTO knowledge_revisions (
         id, entry_id, revision_no, submitted_at, submitted_by_user_id, shortcut, detail, labels, review_notes, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        `${record.id}_rev${revision.revision}`,
        record.id,
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
}

async function insertSubmissions(client: TransactionClient, record: LegacyKnowledgeSnapshotRecord) {
  for (const submission of record.submissionHistory) {
    await client.query(
      `INSERT INTO knowledge_submissions (
         id, entry_id, revision_no, submitted_at, submitted_by_user_id, lifecycle_state, resubmission_of,
         agent_review, reviewer_decision, review_notes, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
      [
        submission.id,
        record.id,
        submission.revision,
        submission.submittedAt,
        submission.submittedByUserId,
        submission.lifecycleState,
        submission.resubmissionOf,
        JSON.stringify(submission.agentReview),
        JSON.stringify(submission.reviewerDecision),
        JSON.stringify(submission.reviewNotes),
        submission.submittedAt,
      ],
    );
  }
}

async function insertReviewDecisions(
  client: TransactionClient,
  record: LegacyKnowledgeSnapshotRecord,
) {
  for (const decision of record.reviewHistory) {
    await client.query(
      `INSERT INTO knowledge_review_decisions (
         entry_id, decided_at, decided_by_user_id, decision, notes, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $2, $2)`,
      [record.id, decision.decidedAt, decision.decidedByUserId, decision.decision, decision.notes],
    );
  }
}

async function insertLifecycleEvents(
  client: TransactionClient,
  record: LegacyKnowledgeSnapshotRecord,
) {
  for (const event of record.lifecycleHistory) {
    await client.query(
      `INSERT INTO lifecycle_events (
         id, entry_id, type, created_at, actor_user_id, submission_id, revision_no, state, note
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

/** Creates the Task 9-only owner adapter for lossless legacy knowledge migration. */
export function createKnowledgeSnapshotOwner(pool: Queryable): KnowledgeSnapshotOwner {
  return {
    async put(record) {
      if (!('connect' in pool) || typeof pool.connect !== 'function') {
        throw new Error('Knowledge snapshot owner requires a PostgreSQL transaction pool');
      }
      await withTransaction(pool as TransactionPool, async (client) => {
        await insertEntry(client, record);
        await insertLabels(client, record);
        await insertRevisions(client, record);
        await insertSubmissions(client, record);
        await insertReviewDecisions(client, record);
        await insertLifecycleEvents(client, record);
      });
    },
    async get(recordId) {
      const { rows } = await pool.query('SELECT metadata FROM knowledge_entries WHERE id = $1', [
        recordId,
      ]);
      const metadata = asRecord((rows[0] as { metadata?: unknown } | undefined)?.metadata);
      const snapshot = metadata.legacySnapshotRecord;
      return snapshot === undefined ? null : (snapshot as LegacyKnowledgeSnapshotRecord);
    },
  };
}
