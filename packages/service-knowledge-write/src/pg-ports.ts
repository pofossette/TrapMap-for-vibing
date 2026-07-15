import { randomUUID } from 'node:crypto';

import type { KnowledgeRepositoryPort } from '@trapmap/backend-core';
import type {
  ArtifactReadProjection,
  KnowledgeOwnerRecord,
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
  knowledgeRepo: KnowledgeRepositoryPort;
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
  draft: ['submitted'],
  submitted: ['agent-pass', 'agent-rejected'],
  'agent-pass': ['approved', 'rejected', 'deactivated', 'agent-pass'],
  'agent-rejected': ['agent-pass', 'rejected', 'approved', 'deactivated', 'agent-rejected'],
  approved: ['deactivated', 'agent-pass', 'agent-rejected'],
  rejected: ['agent-pass', 'agent-rejected', 'deactivated'],
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
    lifecycleState: row.lifecycle_state as LifecycleState,
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

async function persistSubmissionTx(
  pool: Queryable & Pick<Pool, 'connect'>,
  input: KnowledgeOwnerCommandInput,
  options: { entryType: 'knowledge' | 'trap' },
): Promise<string> {
  const entryId = generateId(options.entryType === 'trap' ? 'trap' : 'k');
  const now = new Date().toISOString();
  const content = String(input.detail ?? input.content ?? '');
  const title = String(input.shortcut ?? input.title ?? '');
  const labels = Array.isArray(input.labels)
    ? input.labels.filter((label): label is string => typeof label === 'string')
    : [];
  const teamId = typeof input.teamId === 'string' ? input.teamId : null;
  const lifecycleState: LifecycleState = options.entryType === 'trap' ? 'approved' : 'submitted';
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
      nextState: lifecycleState,
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
    await client.query(
      `INSERT INTO knowledge_revisions (
         id, entry_id, revision_no, submitted_at, submitted_by_user_id, shortcut, detail, labels, review_notes
       ) SELECT $2, id,
         COALESCE((SELECT MAX(revision_no) + 1 FROM knowledge_revisions WHERE entry_id = $1), 1),
         NOW(), $3, shortcut, detail, labels, '[]'::jsonb
         FROM knowledge_entries WHERE id = $1`,
      [entryId, generateId('rev'), actorId],
    );
    await enqueueLifecycleOutboxTx(client, {
      entryId,
      previousState: lifecycleState,
      nextState: lifecycleState,
      actorId,
      note: 'knowledge entry updated',
    });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function createKnowledgeWritePgRepository(
  pool: Queryable & Pick<Pool, 'connect'>,
): KnowledgeRepositoryPort {
  return {
    async nextId() {
      return generateId('k');
    },
    async insert(entry) {
      await pool.query(
        `INSERT INTO knowledge_entries (
           id, team_id, scope, labels, shortcut, detail, required_level, lifecycle_state, owner_user_id, created_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          entry.id,
          entry.teamId,
          (entry as Record<string, unknown>).scope ?? 'global',
          JSON.stringify(entry.labels ?? []),
          (entry as Record<string, unknown>).title ?? '',
          entry.content,
          (entry as Record<string, unknown>).requiredLevel ?? 0,
          entry.lifecycleState,
          entry.ownerUserId,
          (entry as Record<string, unknown>).createdAt ?? new Date().toISOString(),
          (entry as Record<string, unknown>).updatedAt ?? new Date().toISOString(),
        ],
      );
    },
    async getById(entryId) {
      const { rows } = await pool.query('SELECT * FROM knowledge_entries WHERE id = $1', [entryId]);
      return rows[0] ? (mapKnowledgeRow(rows[0] as Record<string, unknown>) as never) : null;
    },
    async updateLifecycle(entryId, newState, context) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const current = await client.query(
          'SELECT lifecycle_state FROM knowledge_entries WHERE id = $1 FOR UPDATE',
          [entryId],
        );
        const previousState = (current.rows[0] as { lifecycle_state?: LifecycleState } | undefined)
          ?.lifecycle_state;
        if (!previousState) throw new Error(`Knowledge entry ${entryId} not found`);
        assertValidLifecycleTransition(previousState, newState);
        const { rows } = await client.query(
          `UPDATE knowledge_entries SET lifecycle_state = $2, updated_at = NOW()
           WHERE id = $1 RETURNING *`,
          [entryId, newState],
        );
        if (!rows[0]) throw new Error(`Knowledge entry ${entryId} not found`);
        await client.query(
          `INSERT INTO lifecycle_events (id, entry_id, type, actor_user_id, submission_id, state, note, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [
            generateId('le'),
            entryId,
            lifecycleEventType(newState),
            context.actorId,
            null,
            newState,
            context.note ?? null,
          ],
        );
        await enqueueLifecycleOutboxTx(client, {
          entryId,
          previousState,
          nextState: newState,
          actorId: context.actorId,
          ...(context.note ? { note: context.note } : {}),
        });
        await client.query('COMMIT');
        return mapKnowledgeRow(rows[0] as Record<string, unknown>) as never;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
    async appendRevision(entryId, revision) {
      await pool.query(
        `INSERT INTO knowledge_revisions (
           id, entry_id, revision_no, submitted_at, submitted_by_user_id, shortcut, detail, labels, review_notes
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          revision.id,
          entryId,
          (revision as Record<string, unknown>).revisionNo ?? 1,
          (revision as Record<string, unknown>).submittedAt ?? new Date().toISOString(),
          (revision as Record<string, unknown>).submittedByUserId ?? 'system',
          (revision as Record<string, unknown>).shortcut ?? '',
          (revision as Record<string, unknown>).detail ?? '',
          JSON.stringify((revision as Record<string, unknown>).labels ?? []),
          JSON.stringify((revision as Record<string, unknown>).reviewNotes ?? []),
        ],
      );
    },
    async appendLifecycleEvent(entryId, event) {
      await pool.query(
        `INSERT INTO lifecycle_events (
           id, entry_id, type, created_at, actor_user_id, submission_id, revision_no, state, note
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          event.id,
          entryId,
          event.type,
          event.createdAt,
          event.actorUserId ?? null,
          event.submissionId ?? null,
          ((event as unknown as Record<string, unknown>).revisionNo as number | null | undefined) ??
            null,
          event.state,
          event.note,
        ],
      );
    },
    async listByFilter(filter) {
      const conditions: string[] = [];
      const values: unknown[] = [];
      if (filter.lifecycleState) {
        conditions.push(`lifecycle_state = $${values.length + 1}`);
        values.push(filter.lifecycleState);
      }
      if (filter.teamId) {
        conditions.push(`team_id = $${values.length + 1}`);
        values.push(filter.teamId);
      }
      if (filter.ownerUserId) {
        conditions.push(`owner_user_id = $${values.length + 1}`);
        values.push(filter.ownerUserId);
      }
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const { rows } = await pool.query(
        `SELECT * FROM knowledge_entries ${where} ORDER BY created_at DESC LIMIT 100`,
        values,
      );
      return rows.map((row) => mapKnowledgeRow(row as Record<string, unknown>)) as never[];
    },
    async updateGovernance(entryId, governance) {
      if (governance.requiredLevel !== undefined) {
        await pool.query(
          'UPDATE knowledge_entries SET required_level = $2, updated_at = NOW() WHERE id = $1',
          [entryId, governance.requiredLevel],
        );
      }
      if (governance.labels !== undefined) {
        await pool.query(
          'UPDATE knowledge_entries SET labels = $2, updated_at = NOW() WHERE id = $1',
          [entryId, JSON.stringify(governance.labels)],
        );
        await pool.query('DELETE FROM knowledge_labels WHERE entry_id = $1', [entryId]);
        for (const label of governance.labels) {
          await pool.query(
            'INSERT INTO knowledge_labels (entry_id, label) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [entryId, label],
          );
        }
      }
    },
    async updateEmbeddingCache(entryId, cache) {
      await pool.query(
        'UPDATE knowledge_entries SET embedding_cache = $2, updated_at = NOW() WHERE id = $1',
        [entryId, JSON.stringify(cache)],
      );
    },
    async supersede(entryId, input) {
      const { rows } = await pool.query(
        `UPDATE knowledge_entries SET lifecycle_state = 'superseded', superseded_by = $2, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [entryId, input.replacementId],
      );
      return mapKnowledgeRow(rows[0] as Record<string, unknown>) as never;
    },
    async save(entry) {
      await pool.query(
        `UPDATE knowledge_entries SET detail = $2, shortcut = $3, labels = $4, team_id = $5, updated_at = NOW()
         WHERE id = $1`,
        [
          entry.id,
          entry.content,
          (entry as Record<string, unknown>).title ?? null,
          JSON.stringify(entry.labels ?? []),
          entry.teamId,
        ],
      );
    },
  };
}

export function createKnowledgeWriteOwnerBundle(
  pool: Queryable & Pick<Pool, 'connect'>,
): KnowledgeWriteOwnerBundle {
  const knowledgeRepo = createKnowledgeWritePgRepository(pool);
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
      await this.updateEntry(entryId, updates, actorId);
      await knowledgeRepo.updateLifecycle(entryId, 'submitted', {
        actorId,
        note: 'Resubmitted for review',
      });
    },
    async supersede(entryId, replacementId, actorId) {
      await knowledgeRepo.supersede(entryId, { replacementId, actorId });
    },
    async createTrap(input) {
      return {
        trapId: await persistSubmissionTx(pool, input, { entryType: 'trap' }),
      };
    },
    async approveReviewDecision(input) {
      const entryId = String(input.entryId);
      await knowledgeRepo.updateLifecycle(entryId, 'approved', {
        actorId: input.actorId,
        note: typeof input.note === 'string' ? input.note : 'Approved',
      });
      return { entryId, lifecycleState: 'approved' };
    },
    async rejectReviewDecision(input) {
      const entryId = String(input.entryId);
      await knowledgeRepo.updateLifecycle(entryId, 'rejected', {
        actorId: input.actorId,
        note: typeof input.note === 'string' ? input.note : 'Rejected',
      });
      return { entryId, lifecycleState: 'rejected' };
    },
    async applyMaintenanceDecision(input) {
      return persistOperationalDecisionTx(pool, input, 'maintenance');
    },
    async applyDecayDecision(input) {
      return persistOperationalDecisionTx(pool, input, 'decay');
    },
    async getById(entryId) {
      return (await knowledgeRepo.getById(entryId)) as KnowledgeOwnerRecord | null;
    },
    async getByIds(entryIds) {
      if (!knowledgeRepo.getByIds) {
        const entries = await Promise.all(
          entryIds.map((entryId) => knowledgeRepo.getById(entryId)),
        );
        return entries.filter(
          (entry): entry is NonNullable<typeof entry> => entry !== null,
        ) as never;
      }
      return (await knowledgeRepo.getByIds(entryIds)) as never;
    },
    async listByFilter(filter) {
      return (await knowledgeRepo.listByFilter(filter)) as never;
    },
  };
  return {
    knowledgeRepo,
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
