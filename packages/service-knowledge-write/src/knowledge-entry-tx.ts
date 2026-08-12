/**
 * Owner-local knowledge entry transactions: SQL statements plus the
 * transaction orchestration that persists commands. State decisions follow
 * the backend-core domain rules; this module only renders them into SQL.
 */

import { prefixedId } from '@trapmap/lib';

import type { EvidenceMeta, KnowledgeOwnerCommandInput, LifecycleState } from '@trapmap/contracts';
import {
  DEACTIVATED_STATE,
  assertValidLifecycleTransition,
  initialLifecycleEventType,
  initialSubmissionState,
  isDeactivationAction,
  lifecycleEventType,
  lifecycleOutboxEventName,
} from '@trapmap/backend-core';
import type { Pool, PoolClient } from 'pg';

type Queryable = Pick<Pool, 'query'>;

function generateId(prefix: string): string {
  return prefixedId(prefix, 16);
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

async function enqueueLifecycleOutboxTx(
  client: KnowledgeTransactionClient,
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
  client: KnowledgeTransactionClient,
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
    lifecycleState: initialSubmissionState(options.entryType, input.lifecycleState),
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
      initialLifecycleEventType(entryType),
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
  if (!isDeactivationAction(action)) return;
  assertValidLifecycleTransition(lifecycleState, DEACTIVATED_STATE);
  await deactivateKnowledgeEntryTx(client, entryId);
  await insertKnowledgeLifecycleEventTx(client, {
    entryId,
    actorId: input.actorId,
    lifecycleState: DEACTIVATED_STATE,
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
      nextState: isDeactivationAction(action) ? DEACTIVATED_STATE : lifecycleState,
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
    assertValidLifecycleTransition(lifecycleState, DEACTIVATED_STATE);
    await deactivateKnowledgeEntryTx(client, entryId);
    await appendKnowledgeRevisionTx(client, entryId, actorId);
    await insertKnowledgeLifecycleEventTx(client, {
      entryId,
      actorId,
      lifecycleState: DEACTIVATED_STATE,
      type: 'deactivated',
      note: `Superseded by ${replacementId}`,
    });
    await enqueueLifecycleOutboxTx(client, {
      entryId,
      previousState: lifecycleState,
      nextState: DEACTIVATED_STATE,
      actorId,
      note: `Superseded by ${replacementId}`,
    });
  });
}

export {
  persistEvidenceReviewTx,
  persistOperationalDecisionTx,
  persistSubmissionTx,
  persistEntryUpdateTx,
  persistSupersedeTx,
};
