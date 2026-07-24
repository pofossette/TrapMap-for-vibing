import { randomUUID } from 'node:crypto';

import type {
  ArtifactReadProjection,
  EvidenceMeta,
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

function readKnowledgeRowValue(
  row: Record<string, unknown>,
  primaryKey: string,
  fallbackKey: string,
  fallback: unknown,
): unknown {
  return row[primaryKey] ?? row[fallbackKey] ?? fallback;
}

function readKnowledgeRowFields(row: Record<string, unknown>) {
  return {
    content: String(readKnowledgeRowValue(row, 'detail', 'content', '')),
    title: String(readKnowledgeRowValue(row, 'shortcut', 'title', '')),
    ownerUserId: String(readKnowledgeRowValue(row, 'owner_user_id', 'ownerUserId', '')),
    teamId: readKnowledgeRowValue(row, 'team_id', 'teamId', null) as string | null,
    requiredLevel: Number(readKnowledgeRowValue(row, 'required_level', 'requiredLevel', 0)),
    boundary: readKnowledgeRowValue(row, 'boundary', 'boundary', null),
    maintenanceMeta: readKnowledgeRowValue(row, 'maintenance_meta', 'maintenanceMeta', null),
    embeddingCache: readKnowledgeRowValue(row, 'embedding_cache', 'embeddingCache', null),
    decayMeta: readKnowledgeRowValue(row, 'decay_meta', 'decayMeta', null),
    evidenceMeta: readKnowledgeRowValue(row, 'evidence_meta', 'evidenceMeta', null),
  };
}

function readKnowledgeRowLabels(row: Record<string, unknown>): string[] {
  return Array.isArray(row.labels) ? (row.labels as string[]) : [];
}

function readKnowledgeRowLifecycle(row: Record<string, unknown>): LifecycleState {
  return row.lifecycle_state as LifecycleState;
}

function normalizeKnowledgeProjection(row: Record<string, unknown>) {
  return {
    ...row,
    ...readKnowledgeRowFields(row),
    labels: readKnowledgeRowLabels(row),
    lifecycleState: readKnowledgeRowLifecycle(row),
  };
}

function toKnowledgeEntryProjection(row: Record<string, unknown>): KnowledgeEntry {
  return normalizeKnowledgeProjection(row) as unknown as KnowledgeEntry;
}

type KnowledgeProjectionFilter = {
  entryIds?: string[];
  lifecycleState?: LifecycleState;
  teamId?: string;
  ownerUserId?: string;
  labels?: string[];
  requiredLevelMax?: number;
  operation?: string;
};

type ProjectionConditionAppender = (condition: string, value?: unknown) => void;

function appendCommonProjectionConditions(
  filter: KnowledgeProjectionFilter,
  add: ProjectionConditionAppender,
): void {
  if (filter.entryIds?.length) add('ke.id = ANY(?::text[])', filter.entryIds);
  if (filter.lifecycleState) add('ke.lifecycle_state = ?', filter.lifecycleState);
  if (filter.teamId) add('ke.team_id = ?', filter.teamId);
  if (filter.ownerUserId) add('ke.owner_user_id = ?', filter.ownerUserId);
  if (filter.requiredLevelMax !== undefined) add('ke.required_level <= ?', filter.requiredLevelMax);
}

function appendLabelProjectionCondition(
  filter: KnowledgeProjectionFilter,
  add: ProjectionConditionAppender,
): void {
  if (!filter.labels?.length) return;
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

function appendOperationProjectionCondition(
  filter: KnowledgeProjectionFilter,
  conditions: string[],
): void {
  if (filter.operation === 'maintenance-due') {
    conditions.push("(ke.maintenance_meta->>'reviewBy')::timestamptz <= NOW()");
  } else if (filter.operation === 'decay-eligible') {
    conditions.push("ke.lifecycle_state = 'approved'");
  }
}

function buildKnowledgeProjectionWhere(filter: KnowledgeProjectionFilter): {
  where: string;
  values: unknown[];
} {
  const conditions: string[] = [];
  const values: unknown[] = [];
  const add: ProjectionConditionAppender = (condition, value) => {
    conditions.push(condition.replace('?', `$${values.length + 1}`));
    if (value !== undefined) values.push(value);
  };

  appendCommonProjectionConditions(filter, add);
  appendLabelProjectionCondition(filter, add);
  appendOperationProjectionCondition(filter, conditions);

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

type KnowledgeTransactionPool = Queryable & Pick<Pool, 'connect'>;
type KnowledgeTransactionClient = Pick<PoolClient, 'query'>;

async function withKnowledgeTransaction<T>(
  pool: KnowledgeTransactionPool,
  operation: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function lockKnowledgeEntryTx(
  client: KnowledgeTransactionClient,
  entryId: string,
): Promise<LifecycleState> {
  const current = await client.query(
    'SELECT lifecycle_state FROM knowledge_entries WHERE id = $1 FOR UPDATE',
    [entryId],
  );
  const lifecycleState = (current.rows[0] as { lifecycle_state?: LifecycleState } | undefined)
    ?.lifecycle_state;
  if (!lifecycleState) throw new Error(`Knowledge entry ${entryId} not found`);
  return lifecycleState;
}

type SubmissionData = {
  entryId: string;
  now: string;
  content: string;
  title: string;
  labels: string[];
  teamId: string | null;
  scope: string;
  requiredLevel: number;
  lifecycleState: LifecycleState;
};

function readSubmissionId(
  input: KnowledgeOwnerCommandInput,
  entryType: 'knowledge' | 'trap',
): string {
  return typeof input.entryId === 'string'
    ? input.entryId
    : generateId(entryType === 'trap' ? 'trap' : 'k');
}

function readSubmissionLabels(input: KnowledgeOwnerCommandInput): string[] {
  return Array.isArray(input.labels)
    ? input.labels.filter((label): label is string => typeof label === 'string')
    : [];
}

function readSubmissionString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function readSubmissionNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' ? value : fallback;
}

function readSubmissionLifecycle(
  input: KnowledgeOwnerCommandInput,
  entryType: 'knowledge' | 'trap',
): LifecycleState {
  return entryType === 'trap' || input.lifecycleState === 'approved' ? 'approved' : 'submitted';
}

function prepareSubmissionData(
  input: KnowledgeOwnerCommandInput,
  options: { entryType: 'knowledge' | 'trap' },
): SubmissionData {
  return {
    entryId: readSubmissionId(input, options.entryType),
    now: new Date().toISOString(),
    content: readSubmissionString(input.detail ?? input.content, ''),
    title: readSubmissionString(input.shortcut ?? input.title, ''),
    labels: readSubmissionLabels(input),
    teamId: typeof input.teamId === 'string' ? input.teamId : null,
    scope: readSubmissionString(input.scope, 'global'),
    requiredLevel: readSubmissionNumber(input.requiredLevel, 0),
    lifecycleState: readSubmissionLifecycle(input, options.entryType),
  };
}

async function insertKnowledgeEntryTx(
  client: KnowledgeTransactionClient,
  input: KnowledgeOwnerCommandInput,
  data: SubmissionData,
): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_entries (
       id, team_id, scope, labels, shortcut, detail, required_level, lifecycle_state, owner_user_id, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)`,
    [
      data.entryId,
      data.teamId,
      data.scope,
      JSON.stringify(data.labels),
      data.title,
      data.content,
      data.requiredLevel,
      data.lifecycleState,
      input.actorId,
      data.now,
    ],
  );
}

async function insertSubmissionRevisionTx(
  client: KnowledgeTransactionClient,
  input: KnowledgeOwnerCommandInput,
  data: SubmissionData,
): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_revisions (
       id, entry_id, revision_no, submitted_at, submitted_by_user_id, shortcut, detail, labels, review_notes
     ) VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8)`,
    [
      generateId('rev'),
      data.entryId,
      data.now,
      input.actorId,
      data.title,
      data.content,
      JSON.stringify(data.labels),
      JSON.stringify([]),
    ],
  );
}

async function insertSubmissionLifecycleEventTx(
  client: KnowledgeTransactionClient,
  input: KnowledgeOwnerCommandInput,
  data: SubmissionData,
  entryType: 'knowledge' | 'trap',
): Promise<void> {
  await client.query(
    `INSERT INTO lifecycle_events (id, entry_id, type, actor_user_id, submission_id, state, note, created_at)
     VALUES ($1, $2, $3, $4, NULL, $5, $6, $7)`,
    [
      generateId('le'),
      data.entryId,
      entryType === 'trap' ? 'reviewer-approved' : 'submitted',
      input.actorId,
      data.lifecycleState,
      `${entryType} submitted by owner`,
      data.now,
    ],
  );
}

async function updateKnowledgeLifecycleStateTx(
  client: KnowledgeTransactionClient,
  entryId: string,
  lifecycleState: LifecycleState,
): Promise<void> {
  await client.query(
    `UPDATE knowledge_entries SET lifecycle_state = $2, updated_at = NOW()
     WHERE id = $1`,
    [entryId, lifecycleState],
  );
}

async function deactivateKnowledgeEntryTx(
  client: KnowledgeTransactionClient,
  entryId: string,
): Promise<void> {
  await client.query(
    `UPDATE knowledge_entries SET lifecycle_state = 'deactivated', updated_at = NOW()
     WHERE id = $1`,
    [entryId],
  );
}

async function insertKnowledgeLifecycleEventTx(
  client: KnowledgeTransactionClient,
  input: {
    entryId: string;
    actorId: string;
    lifecycleState: LifecycleState;
    type: string;
    note: string;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO lifecycle_events (id, entry_id, type, actor_user_id, submission_id, state, note, created_at)
     VALUES ($1, $2, $3, $4, NULL, $5, $6, NOW())`,
    [generateId('le'), input.entryId, input.type, input.actorId, input.lifecycleState, input.note],
  );
}

async function appendKnowledgeRevisionTx(
  client: KnowledgeTransactionClient,
  entryId: string,
  actorId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO knowledge_revisions (
       id, entry_id, revision_no, submitted_at, submitted_by_user_id, shortcut, detail, labels, review_notes
     ) SELECT $2, id,
       COALESCE((SELECT MAX(revision_no) + 1 FROM knowledge_revisions WHERE entry_id = $1), 1),
       NOW(), $3, shortcut, detail, labels, '[]'::jsonb
       FROM knowledge_entries WHERE id = $1`,
    [entryId, generateId('rev'), actorId],
  );
}

type KnowledgeEntryUpdate = {
  detail: string | null;
  shortcut: string | null;
  labels: string[] | null;
  requiredLevel: number | null;
};

function readKnowledgeEntryUpdate(updates: Record<string, unknown>): KnowledgeEntryUpdate {
  return {
    detail: typeof updates.detail === 'string' ? updates.detail : null,
    shortcut: typeof updates.shortcut === 'string' ? updates.shortcut : null,
    labels: Array.isArray(updates.labels)
      ? updates.labels.filter((label): label is string => typeof label === 'string')
      : null,
    requiredLevel: typeof updates.requiredLevel === 'number' ? updates.requiredLevel : null,
  };
}

async function updateKnowledgeEntryTx(
  client: KnowledgeTransactionClient,
  entryId: string,
  updates: KnowledgeEntryUpdate,
): Promise<void> {
  await client.query(
    `UPDATE knowledge_entries SET detail = COALESCE($2, detail), shortcut = COALESCE($3, shortcut),
       labels = COALESCE($4, labels), required_level = COALESCE($5, required_level), updated_at = NOW()
     WHERE id = $1`,
    [
      entryId,
      updates.detail,
      updates.shortcut,
      updates.labels === null ? null : JSON.stringify(updates.labels),
      updates.requiredLevel,
    ],
  );
  if (updates.labels) await replaceKnowledgeLabelsTx(client, entryId, updates.labels);
}

async function persistSubmissionTx(
  pool: KnowledgeTransactionPool,
  input: KnowledgeOwnerCommandInput,
  options: { entryType: 'knowledge' | 'trap' },
): Promise<string> {
  const data = prepareSubmissionData(input, options);
  await withKnowledgeTransaction(pool, async (client) => {
    await insertKnowledgeEntryTx(client, input, data);
    await replaceKnowledgeLabelsTx(client, data.entryId, data.labels);
    await insertSubmissionRevisionTx(client, input, data);
    await insertSubmissionLifecycleEventTx(client, input, data, options.entryType);
    await enqueueLifecycleOutboxTx(client, {
      entryId: data.entryId,
      previousState: 'draft',
      nextState: data.lifecycleState,
      actorId: input.actorId,
      note: `${options.entryType} submitted by owner`,
    });
  });
  return data.entryId;
}

async function applyMaintenanceDecisionTx(
  client: KnowledgeTransactionClient,
  input: KnowledgeOwnerCommandInput,
  entryId: string,
  action: string,
  lifecycleState: LifecycleState,
): Promise<void> {
  await client.query(
    `UPDATE knowledge_entries SET maintenance_meta = $2, updated_at = NOW()
     WHERE id = $1`,
    [
      entryId,
      JSON.stringify({
        maintainerUserId: input.actorId,
        maintainerHandle:
          typeof input.maintainerHandle === 'string' ? input.maintainerHandle : null,
        maintainerLevel: typeof input.maintainerLevel === 'number' ? input.maintainerLevel : null,
        reviewBy: typeof input.reviewBy === 'string' ? input.reviewBy : null,
        action,
      }),
    ],
  );
  if (action !== 'deactivate') return;
  assertValidLifecycleTransition(lifecycleState, 'deactivated');
  await deactivateKnowledgeEntryTx(client, entryId);
  await insertKnowledgeLifecycleEventTx(client, {
    entryId,
    actorId: input.actorId,
    lifecycleState: 'deactivated',
    type: 'deactivated',
    note: String(input.note ?? action),
  });
}

async function applyDecayDecisionTx(
  client: KnowledgeTransactionClient,
  entryId: string,
): Promise<void> {
  await client.query(
    `UPDATE knowledge_entries SET updated_at = NOW(), embedding_cache = embedding_cache
     WHERE id = $1`,
    [entryId],
  );
}

async function persistOperationalDecisionTx(
  pool: KnowledgeTransactionPool,
  input: KnowledgeOwnerCommandInput,
  kind: 'maintenance' | 'decay',
): Promise<{ entryId: string; action: string }> {
  const entryId = String(input.entryId);
  const action = String(input.action);
  await withKnowledgeTransaction(pool, async (client) => {
    const lifecycleState = await lockKnowledgeEntryTx(client, entryId);
    if (kind === 'maintenance') {
      await applyMaintenanceDecisionTx(client, input, entryId, action, lifecycleState);
    } else {
      await applyDecayDecisionTx(client, entryId);
    }
    await enqueueLifecycleOutboxTx(client, {
      entryId,
      previousState: lifecycleState,
      nextState: action === 'deactivate' ? 'deactivated' : lifecycleState,
      actorId: input.actorId,
      note: `${kind}:${action}`,
    });
  });
  return { entryId, action };
}

async function persistEntryUpdateTx(
  pool: KnowledgeTransactionPool,
  entryId: string,
  updates: Record<string, unknown>,
  actorId: string,
  nextLifecycleState?: LifecycleState,
  lifecycleNote?: string,
): Promise<void> {
  await withKnowledgeTransaction(pool, async (client) => {
    const lifecycleState = await lockKnowledgeEntryTx(client, entryId);
    const entryUpdate = readKnowledgeEntryUpdate(updates);
    await updateKnowledgeEntryTx(client, entryId, entryUpdate);
    await appendKnowledgeRevisionTx(client, entryId, actorId);
    if (nextLifecycleState) {
      assertValidLifecycleTransition(lifecycleState, nextLifecycleState);
      await updateKnowledgeLifecycleStateTx(client, entryId, nextLifecycleState);
      await insertKnowledgeLifecycleEventTx(client, {
        entryId,
        actorId,
        lifecycleState: nextLifecycleState,
        type: lifecycleEventType(nextLifecycleState),
        note: lifecycleNote ?? 'Resubmitted for review',
      });
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
  });
}

async function persistEvidenceReviewTx(
  pool: KnowledgeTransactionPool,
  entryId: string,
  evidence: EvidenceMeta,
  actorId: string,
): Promise<void> {
  await withKnowledgeTransaction(pool, async (client) => {
    const lifecycleState = await lockKnowledgeEntryTx(client, entryId);
    await client.query(
      'UPDATE knowledge_entries SET evidence_meta = $2, updated_at = NOW() WHERE id = $1',
      [entryId, JSON.stringify(evidence)],
    );
    await enqueueLifecycleOutboxTx(client, {
      entryId,
      previousState: lifecycleState,
      nextState: lifecycleState,
      actorId,
      note: 'knowledge evidence reviewed',
    });
  });
}

async function persistSupersedeTx(
  pool: KnowledgeTransactionPool,
  entryId: string,
  replacementId: string,
  actorId: string,
): Promise<void> {
  await withKnowledgeTransaction(pool, async (client) => {
    const lifecycleState = await lockKnowledgeEntryTx(client, entryId);
    assertValidLifecycleTransition(lifecycleState, 'deactivated');
    await deactivateKnowledgeEntryTx(client, entryId);
    await appendKnowledgeRevisionTx(client, entryId, actorId);
    await insertKnowledgeLifecycleEventTx(client, {
      entryId,
      actorId,
      lifecycleState: 'deactivated',
      type: 'deactivated',
      note: `Superseded by ${replacementId}`,
    });
    await enqueueLifecycleOutboxTx(client, {
      entryId,
      previousState: lifecycleState,
      nextState: 'deactivated',
      actorId,
      note: `Superseded by ${replacementId}`,
    });
  });
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
    async reviewEvidence(entryId, evidence, actorId) {
      await persistEvidenceReviewTx(pool, entryId, evidence, actorId);
      return { entryId, evidence };
    },
    getById: projection.getById,
    getByIds: projection.getByIds,
    listByFilter: projection.listByFilter,
    async updateEmbeddingCache(entryId, cache) {
      await pool.query(
        'UPDATE knowledge_entries SET embedding_cache = $2, updated_at = NOW() WHERE id = $1',
        [entryId, JSON.stringify(cache)],
      );
    },
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
