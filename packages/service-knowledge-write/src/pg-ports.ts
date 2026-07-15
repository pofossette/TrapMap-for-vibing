import { randomUUID } from 'node:crypto';

import type {
  ArtifactReadProjection,
  KnowledgeEntry,
  KnowledgeOwnerCommandInput,
  KnowledgeOwnerPort,
  LifecycleState,
} from '@trapmap/contracts';
import type { Pool, PoolClient } from 'pg';
import {
  createArtifactReadProjection,
  createArtifactWritePort,
  type ArtifactWritePort,
} from './artifact-ports.js';

type Queryable = Pick<Pool, 'query'>;

export interface KnowledgeWriteOwnerBundle {
  knowledgeOwner: KnowledgeOwnerPort;
  artifactWriter: ArtifactWritePort;
  artifactReadProjection: ArtifactReadProjection;
}

export interface KnowledgeWriteOutboxDiagnostics {
  getStatusSnapshot(): Promise<{
    provider: 'postgres';
    pending: number;
    processing: number;
    failed: number;
    staleProcessing: number;
    reclaimCount: number;
  }>;
}

const lifecycleTransitions: Readonly<Record<LifecycleState, readonly LifecycleState[]>> = {
  draft: ['submitted', 'approved'],
  submitted: ['agent-pass', 'agent-rejected'],
  'agent-pass': ['approved', 'rejected', 'deactivated', 'agent-pass'],
  'agent-rejected': ['agent-pass', 'rejected', 'approved', 'deactivated', 'agent-rejected'],
  approved: ['deactivated', 'agent-pass', 'agent-rejected'],
  rejected: ['submitted', 'agent-pass', 'agent-rejected', 'deactivated'],
  deactivated: [],
};

function generateId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 16)}`;
}

function mapKnowledgeRow(row: Record<string, unknown>) {
  return {
    ...row,
    content: String(row.detail ?? ''),
    title: String(row.shortcut ?? ''),
    labels: Array.isArray(row.labels) ? (row.labels as string[]) : [],
    ownerUserId: String(row.owner_user_id ?? row.ownerUserId ?? ''),
    teamId: (row.team_id as string | null) ?? (row.teamId as string | null) ?? null,
    requiredLevel: Number(row.required_level ?? row.requiredLevel ?? 0),
    lifecycleState: row.lifecycle_state as LifecycleState,
    boundary: row.boundary ?? null,
    maintenanceMeta: row.maintenance_meta ?? row.maintenanceMeta ?? null,
    embeddingCache: row.embedding_cache ?? row.embeddingCache ?? null,
    decayMeta: row.decay_meta ?? row.decayMeta ?? null,
  };
}

function toKnowledgeEntryProjection(row: Record<string, unknown>): KnowledgeEntry {
  return mapKnowledgeRow(row) as unknown as KnowledgeEntry;
}

function buildKnowledgeProjectionWhere(filter: {
  entryIds?: string[];
  lifecycleState?: LifecycleState;
  teamId?: string;
  ownerUserId?: string;
  labels?: string[];
  requiredLevelMax?: number;
  operation?: string;
}): { where: string; values: unknown[] } {
  const conditions: string[] = [];
  const values: unknown[] = [];
  const add = (condition: string, value: unknown) => {
    conditions.push(condition.replace('?', `$${values.length + 1}`));
    values.push(value);
  };

  if (filter.entryIds?.length) add('ke.id = ANY(?::text[])', filter.entryIds);
  if (filter.lifecycleState) add('ke.lifecycle_state = ?', filter.lifecycleState);
  if (filter.teamId) add('ke.team_id = ?', filter.teamId);
  if (filter.ownerUserId) add('ke.owner_user_id = ?', filter.ownerUserId);
  if (filter.requiredLevelMax !== undefined) add('ke.required_level <= ?', filter.requiredLevelMax);
  if (filter.labels?.length) {
    add(
      `ke.id IN (
        SELECT kl.entry_id FROM knowledge_labels kl
        WHERE kl.label = ANY(?::text[])
        GROUP BY kl.entry_id
        HAVING COUNT(DISTINCT kl.label) = ${filter.labels.length}
      )`,
      filter.labels,
    );
  }
  if (filter.operation === 'maintenance-due') {
    conditions.push("(ke.maintenance_meta->>'reviewBy')::timestamptz <= NOW()");
  } else if (filter.operation === 'decay-eligible') {
    conditions.push("ke.lifecycle_state = 'approved'");
  }

  return {
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  };
}

function createKnowledgeOwnerProjection(
  pool: Queryable,
): Pick<KnowledgeOwnerPort, 'getById' | 'getByIds' | 'listByFilter'> {
  return {
    async getById(entryId) {
      const result = await pool.query('SELECT * FROM knowledge_entries WHERE id = $1', [entryId]);
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row ? toKnowledgeEntryProjection(row) : null;
    },
    async getByIds(entryIds) {
      if (entryIds.length === 0) return [];
      const result = await pool.query(
        'SELECT * FROM knowledge_entries WHERE id = ANY($1::text[]) ORDER BY created_at DESC',
        [entryIds],
      );
      return result.rows.map((row) => toKnowledgeEntryProjection(row as Record<string, unknown>));
    },
    async listByFilter(filter) {
      const { where, values } = buildKnowledgeProjectionWhere(filter);
      const result = await pool.query(
        `SELECT ke.* FROM knowledge_entries ke ${where} ORDER BY ke.updated_at DESC LIMIT 100`,
        values,
      );
      return result.rows.map((row) => toKnowledgeEntryProjection(row as Record<string, unknown>));
    },
  };
}

function lifecycleOutboxEventName(state: LifecycleState): string {
  if (state === 'approved') return 'knowledge.approved';
  if (state === 'rejected') return 'knowledge.rejected';
  if (state === 'submitted') return 'knowledge.submitted';
  return 'knowledge.lifecycle-updated';
}

function lifecycleEventType(state: LifecycleState): string {
  if (state === 'approved') return 'reviewer-approved';
  if (state === 'rejected') return 'reviewer-rejected';
  if (state === 'submitted') return 'resubmitted';
  return 'updated';
}

function assertValidLifecycleTransition(
  previousState: LifecycleState,
  nextState: LifecycleState,
): void {
  if (!lifecycleTransitions[previousState].includes(nextState)) {
    throw new Error(`Invalid lifecycle transition: ${previousState} → ${nextState}`);
  }
}

async function enqueueLifecycleOutboxTx(
  client: Pick<PoolClient, 'query'>,
  input: {
    entryId: string;
    previousState: LifecycleState;
    nextState: LifecycleState;
    actorId: string;
    note?: string;
  },
): Promise<void> {
  const eventName = lifecycleOutboxEventName(input.nextState);
  await client.query(
    `INSERT INTO domain_event_outbox (
       id, aggregate_type, aggregate_id, event_name, payload, status, available_at, attempts, created_at
     ) VALUES ($1, 'knowledge', $2, $3, $4, 'pending', NOW(), 0, NOW())`,
    [
      generateId('evt'),
      input.entryId,
      eventName,
      JSON.stringify({
        name: eventName,
        entryId: input.entryId,
        previousState: input.previousState,
        nextState: input.nextState,
        actorId: input.actorId,
        reason: input.note ?? 'knowledge-write lifecycle update',
        timestamp: new Date().toISOString(),
      }),
    ],
  );
}

async function replaceKnowledgeLabelsTx(
  client: Pick<PoolClient, 'query'>,
  entryId: string,
  labels: string[],
): Promise<void> {
  await client.query('DELETE FROM knowledge_labels WHERE entry_id = $1', [entryId]);
  for (const label of labels) {
    await client.query(
      'INSERT INTO knowledge_labels (entry_id, label) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [entryId, label],
    );
  }
}

async function persistSubmissionTx(
  pool: Queryable & Pick<Pool, 'connect'>,
  input: KnowledgeOwnerCommandInput,
  options: { entryType: 'knowledge' | 'trap' },
): Promise<string> {
  const requestedEntryId = typeof input.entryId === 'string' ? input.entryId : null;
  const entryId = requestedEntryId ?? generateId(options.entryType === 'trap' ? 'trap' : 'k');
  const now = new Date().toISOString();
  const content = String(input.detail ?? input.content ?? '');
  const title = String(input.shortcut ?? input.title ?? '');
  const labels = Array.isArray(input.labels)
    ? input.labels.filter((label): label is string => typeof label === 'string')
    : [];
  const teamId = typeof input.teamId === 'string' ? input.teamId : null;
  const requestedLifecycleState = input.lifecycleState;
  const lifecycleState: LifecycleState =
    options.entryType === 'trap'
      ? 'approved'
      : requestedLifecycleState === 'approved'
        ? 'approved'
        : 'submitted';
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO knowledge_entries (
         id, team_id, scope, labels, shortcut, detail, required_level, lifecycle_state, owner_user_id, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
      [
        entryId,
        teamId,
        typeof input.scope === 'string' ? input.scope : 'global',
        JSON.stringify(labels),
        title,
        content,
        typeof input.requiredLevel === 'number' ? input.requiredLevel : 0,
        lifecycleState,
        input.actorId,
        now,
      ],
    );
    await replaceKnowledgeLabelsTx(client, entryId, labels);
    await client.query(
      `INSERT INTO knowledge_revisions (
         id, entry_id, revision_no, submitted_at, submitted_by_user_id, shortcut, detail, labels, review_notes
       ) VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8)`,
      [
        generateId('rev'),
        entryId,
        now,
        input.actorId,
        title,
        content,
        JSON.stringify(labels),
        JSON.stringify([]),
      ],
    );
    await client.query(
      `INSERT INTO lifecycle_events (id, entry_id, type, actor_user_id, submission_id, state, note, created_at)
       VALUES ($1, $2, $3, $4, NULL, $5, $6, $7)`,
      [
        generateId('le'),
        entryId,
        options.entryType === 'trap' ? 'reviewer-approved' : 'submitted',
        input.actorId,
        lifecycleState,
        `${options.entryType} submitted by owner`,
        now,
      ],
    );
    await enqueueLifecycleOutboxTx(client, {
      entryId,
      previousState: 'draft',
      nextState: lifecycleState,
      actorId: input.actorId,
      note: `${options.entryType} submitted by owner`,
    });
    await client.query('COMMIT');
    return entryId;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function persistOperationalDecisionTx(
  pool: Queryable & Pick<Pool, 'connect'>,
  input: KnowledgeOwnerCommandInput,
  kind: 'maintenance' | 'decay',
): Promise<{ entryId: string; action: string }> {
  const entryId = String(input.entryId);
  const action = String(input.action);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT lifecycle_state FROM knowledge_entries WHERE id = $1 FOR UPDATE',
      [entryId],
    );
    const lifecycleState = (current.rows[0] as { lifecycle_state?: LifecycleState } | undefined)
      ?.lifecycle_state;
    if (!lifecycleState) throw new Error(`Knowledge entry ${entryId} not found`);
    if (kind === 'maintenance') {
      await client.query(
        `UPDATE knowledge_entries SET maintenance_meta = $2, updated_at = NOW()
         WHERE id = $1`,
        [
          entryId,
          JSON.stringify({
            maintainerUserId: input.actorId,
            maintainerHandle:
              typeof input.maintainerHandle === 'string' ? input.maintainerHandle : null,
            maintainerLevel:
              typeof input.maintainerLevel === 'number' ? input.maintainerLevel : null,
            reviewBy: typeof input.reviewBy === 'string' ? input.reviewBy : null,
            action,
          }),
        ],
      );
      if (action === 'deactivate') {
        assertValidLifecycleTransition(lifecycleState, 'deactivated');
        await client.query(
          `UPDATE knowledge_entries SET lifecycle_state = 'deactivated', updated_at = NOW()
           WHERE id = $1`,
          [entryId],
        );
        await client.query(
          `INSERT INTO lifecycle_events (id, entry_id, type, actor_user_id, submission_id, state, note, created_at)
           VALUES ($1, $2, 'deactivated', $3, NULL, 'deactivated', $4, NOW())`,
          [generateId('le'), entryId, input.actorId, String(input.note ?? action)],
        );
      }
    } else {
      await client.query(
        `UPDATE knowledge_entries SET updated_at = NOW(), embedding_cache = embedding_cache
         WHERE id = $1`,
        [entryId],
      );
    }
    await enqueueLifecycleOutboxTx(client, {
      entryId,
      previousState: lifecycleState,
      nextState: action === 'deactivate' ? 'deactivated' : lifecycleState,
      actorId: input.actorId,
      note: `${kind}:${action}`,
    });
    await client.query('COMMIT');
    return { entryId, action };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function persistEntryUpdateTx(
  pool: Queryable & Pick<Pool, 'connect'>,
  entryId: string,
  updates: Record<string, unknown>,
  actorId: string,
  nextLifecycleState?: LifecycleState,
  lifecycleNote?: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT lifecycle_state FROM knowledge_entries WHERE id = $1 FOR UPDATE',
      [entryId],
    );
    const lifecycleState = (current.rows[0] as { lifecycle_state?: LifecycleState } | undefined)
      ?.lifecycle_state;
    if (!lifecycleState) throw new Error(`Knowledge entry ${entryId} not found`);
    const detail = typeof updates.detail === 'string' ? updates.detail : null;
    const shortcut = typeof updates.shortcut === 'string' ? updates.shortcut : null;
    const labels = Array.isArray(updates.labels)
      ? updates.labels.filter((label): label is string => typeof label === 'string')
      : null;
    const requiredLevel = typeof updates.requiredLevel === 'number' ? updates.requiredLevel : null;
    await client.query(
      `UPDATE knowledge_entries SET detail = COALESCE($2, detail), shortcut = COALESCE($3, shortcut),
         labels = COALESCE($4, labels), required_level = COALESCE($5, required_level), updated_at = NOW()
       WHERE id = $1`,
      [entryId, detail, shortcut, labels === null ? null : JSON.stringify(labels), requiredLevel],
    );
    if (labels) {
      await replaceKnowledgeLabelsTx(client, entryId, labels);
    }
    await client.query(
      `INSERT INTO knowledge_revisions (
         id, entry_id, revision_no, submitted_at, submitted_by_user_id, shortcut, detail, labels, review_notes
       ) SELECT $2, id,
         COALESCE((SELECT MAX(revision_no) + 1 FROM knowledge_revisions WHERE entry_id = $1), 1),
         NOW(), $3, shortcut, detail, labels, '[]'::jsonb
         FROM knowledge_entries WHERE id = $1`,
      [entryId, generateId('rev'), actorId],
    );
    if (nextLifecycleState) {
      assertValidLifecycleTransition(lifecycleState, nextLifecycleState);
      await client.query(
        `UPDATE knowledge_entries SET lifecycle_state = $2, updated_at = NOW()
         WHERE id = $1`,
        [entryId, nextLifecycleState],
      );
      await client.query(
        `INSERT INTO lifecycle_events (id, entry_id, type, actor_user_id, submission_id, state, note, created_at)
         VALUES ($1, $2, $3, $4, NULL, $5, $6, NOW())`,
        [
          generateId('le'),
          entryId,
          lifecycleEventType(nextLifecycleState),
          actorId,
          nextLifecycleState,
          lifecycleNote ?? 'Resubmitted for review',
        ],
      );
    }
    await enqueueLifecycleOutboxTx(client, {
      entryId,
      previousState: lifecycleState,
      nextState: nextLifecycleState ?? lifecycleState,
      actorId,
      note:
        lifecycleNote ??
        (nextLifecycleState ? 'Resubmitted for review' : 'knowledge entry updated'),
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function persistSupersedeTx(
  pool: Queryable & Pick<Pool, 'connect'>,
  entryId: string,
  replacementId: string,
  actorId: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT lifecycle_state FROM knowledge_entries WHERE id = $1 FOR UPDATE',
      [entryId],
    );
    const lifecycleState = (current.rows[0] as { lifecycle_state?: LifecycleState } | undefined)
      ?.lifecycle_state;
    if (!lifecycleState) throw new Error(`Knowledge entry ${entryId} not found`);
    assertValidLifecycleTransition(lifecycleState, 'deactivated');
    await client.query(
      `UPDATE knowledge_entries SET lifecycle_state = 'deactivated', updated_at = NOW()
       WHERE id = $1`,
      [entryId],
    );
    await client.query(
      `INSERT INTO knowledge_revisions (
         id, entry_id, revision_no, submitted_at, submitted_by_user_id, shortcut, detail, labels, review_notes
       ) SELECT $2, id,
         COALESCE((SELECT MAX(revision_no) + 1 FROM knowledge_revisions WHERE entry_id = $1), 1),
         NOW(), $3, shortcut, detail, labels, '[]'::jsonb
         FROM knowledge_entries WHERE id = $1`,
      [entryId, generateId('rev'), actorId],
    );
    await client.query(
      `INSERT INTO lifecycle_events (id, entry_id, type, actor_user_id, submission_id, state, note, created_at)
       VALUES ($1, $2, 'deactivated', $3, NULL, 'deactivated', $4, NOW())`,
      [generateId('le'), entryId, actorId, `Superseded by ${replacementId}`],
    );
    await enqueueLifecycleOutboxTx(client, {
      entryId,
      previousState: lifecycleState,
      nextState: 'deactivated',
      actorId,
      note: `Superseded by ${replacementId}`,
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function createKnowledgeWriteOwnerBundle(
  pool: Queryable & Pick<Pool, 'connect'>,
): KnowledgeWriteOwnerBundle {
  const projection = createKnowledgeOwnerProjection(pool);
  const knowledgeOwner: KnowledgeOwnerPort = {
    async submit(input) {
      return {
        entryId: await persistSubmissionTx(pool, input, {
          entryType: 'knowledge',
        }),
      };
    },
    async updateEntry(entryId, updates, actorId) {
      await persistEntryUpdateTx(pool, entryId, updates, actorId);
    },
    async resubmit(entryId, updates, actorId) {
      await persistEntryUpdateTx(pool, entryId, updates, actorId, 'submitted');
    },
    async supersede(entryId, replacementId, actorId) {
      await persistSupersedeTx(pool, entryId, replacementId, actorId);
    },
    async createTrap(input) {
      return {
        trapId: await persistSubmissionTx(pool, input, { entryType: 'trap' }),
      };
    },
    async approveReviewDecision(input) {
      const entryId = String(input.entryId);
      await persistEntryUpdateTx(
        pool,
        entryId,
        {},
        input.actorId,
        'approved',
        typeof input.note === 'string' ? input.note : 'Approved',
      );
      return { entryId, lifecycleState: 'approved' };
    },
    async rejectReviewDecision(input) {
      const entryId = String(input.entryId);
      await persistEntryUpdateTx(
        pool,
        entryId,
        {},
        input.actorId,
        'rejected',
        typeof input.note === 'string' ? input.note : 'Rejected',
      );
      return { entryId, lifecycleState: 'rejected' };
    },
    async applyMaintenanceDecision(input) {
      return persistOperationalDecisionTx(pool, input, 'maintenance');
    },
    async applyDecayDecision(input) {
      return persistOperationalDecisionTx(pool, input, 'decay');
    },
    getById: projection.getById,
    getByIds: projection.getByIds,
    listByFilter: projection.listByFilter,
  };
  return {
    knowledgeOwner,
    artifactWriter: createArtifactWritePort(pool),
    artifactReadProjection: createArtifactReadProjection(pool),
  };
}

export function createKnowledgeWriteOutboxDiagnostics(
  pool: Queryable,
): KnowledgeWriteOutboxDiagnostics {
  return {
    async getStatusSnapshot() {
      const [pending, processing, failed] = await Promise.all([
        pool.query("SELECT COUNT(*) as count FROM domain_event_outbox WHERE status = 'pending'"),
        pool.query("SELECT COUNT(*) as count FROM domain_event_outbox WHERE status = 'processing'"),
        pool.query("SELECT COUNT(*) as count FROM domain_event_outbox WHERE status = 'failed'"),
      ]);
      return {
        provider: 'postgres',
        pending: Number((pending.rows[0] as { count: string }).count),
        processing: Number((processing.rows[0] as { count: string }).count),
        failed: Number((failed.rows[0] as { count: string }).count),
        staleProcessing: 0,
        reclaimCount: 0,
      };
    },
  };
}
