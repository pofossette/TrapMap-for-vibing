/**
 * PostgreSQL-backed concrete port implementations.
 *
 * Each function creates a port implementation backed by the given
 * PostgreSQL connection pool. These are used by the distributed services
 * to wire backend-core modules to real persistence.
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

import type {
  FeedbackRepositoryPort,
  KnowledgeEntryRecord,
  KnowledgeReadProjectionPort,
  OutboxPort,
  QueuePorts,
  RepositoryPorts,
  RetrievalQueryPort,
  TaskQueuePort,
  AuditLogPort,
} from '@trapmap/backend-core';
import type { LifecycleState } from '@trapmap/contracts';
import type { DatabaseWriteService } from './database-ownership.js';
import { withDatabaseWriteGuard } from './database-ownership.js';

function mapKnowledgeRow(row: Record<string, unknown>) {
  const {
    detail,
    shortcut,
    labels,
    owner_user_id: ownerUserId,
    ownerUserId: legacyOwnerUserId,
    team_id: teamId,
    teamId: legacyTeamId,
    lifecycle_state: lifecycleState,
    ...entry
  } = row;
  return {
    ...entry,
    content: String(detail ?? ''),
    title: String(shortcut ?? ''),
    labels: Array.isArray(labels) ? labels : [],
    ownerUserId: String(ownerUserId ?? legacyOwnerUserId ?? ''),
    teamId: (teamId as string | null) ?? (legacyTeamId as string | null) ?? null,
    lifecycleState: lifecycleState as LifecycleState,
  };
}

// ---------------------------------------------------------------------------
// Column-allowlist helper for dynamic UPDATE builders
// ---------------------------------------------------------------------------

function buildSetClauses(
  updates: Record<string, unknown>,
  allowlist: ReadonlySet<string>,
): { clauses: string[]; values: unknown[]; nextParamIndex: number } {
  const clauses: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  for (const [key, value] of Object.entries(updates)) {
    if (!allowlist.has(key)) continue;
    clauses.push(`${key} = $${paramIndex++}`);
    values.push(value);
  }

  return { clauses, values, nextParamIndex: paramIndex };
}

// ---------------------------------------------------------------------------
// Knowledge repository
// ---------------------------------------------------------------------------

function rejectKnowledgeMutation(): never {
  throw new Error('Knowledge mutation is only available through the knowledge-write owner');
}

function createPgKnowledgeReadProjection(
  pool: Pool,
): KnowledgeReadProjectionPort<KnowledgeEntryRecord> {
  return {
    async getById(entryId) {
      const result = await pool.query('SELECT * FROM knowledge_entries WHERE id = $1', [entryId]);
      const row = result.rows.at(0) as Record<string, unknown> | undefined;
      return row ? (mapKnowledgeRow(row) as never) : null;
    },
    async listMine({ userId, teamId }) {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;
      conditions.push(`owner_user_id = $${paramIndex++}`);
      params.push(userId);
      if (teamId) {
        conditions.push(`team_id = $${paramIndex++}`);
        params.push(teamId);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const { rows } = await pool.query(
        `SELECT * FROM knowledge_entries ${whereClause} ORDER BY created_at DESC LIMIT 100`,
        params,
      );
      return rows.map((row) => mapKnowledgeRow(row as Record<string, unknown>)) as never[];
    },
    async getStatus() {
      return {
        phase: 'phase-2-boundary-closed',
        source: 'knowledge-write-owner',
        consistency: 'strong',
        freshness: 'current',
        fallback: 'none',
        surfaces: [],
      };
    },
  };
}

// Identity, access-key, team, membership, user, and audit persistence are
// owned by service-identity-access.  Hosts inject its append-only audit
// capability below; distributed shared ports must not construct those owners.

// ---------------------------------------------------------------------------
// Feedback repository
// ---------------------------------------------------------------------------

function createPgFeedbackRepo(pool: Pool): FeedbackRepositoryPort {
  return {
    async nextId() {
      return generateId('f');
    },
    async insert(feedback) {
      await pool.query(
        `INSERT INTO feedback_queue (id, entry_id, problem_type, description, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
        [
          feedback.id,
          feedback.entryId,
          feedback.problemType,
          (feedback as Record<string, unknown>).description,
          feedback.status ?? 'open',
        ],
      );
    },
    async getById(feedbackId) {
      const { rows } = await pool.query('SELECT * FROM feedback_queue WHERE id = $1', [feedbackId]);
      return (
        (rows[0] as FeedbackRepositoryPort extends { getById(id: string): Promise<infer R> }
          ? R
          : never) ?? null
      );
    },
    async listByEntry(entryId) {
      const { rows } = await pool.query('SELECT * FROM feedback_queue WHERE entry_id = $1', [
        entryId,
      ]);
      return rows as never[];
    },
    async listByStatus(status) {
      const { rows } = await pool.query('SELECT * FROM feedback_queue WHERE status = $1', [status]);
      return rows as never[];
    },
    async listByFilter(filter) {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (filter.status?.length) {
        conditions.push(`status = ANY($${paramIndex++})`);
        params.push(filter.status);
      }
      if (filter.problemType?.length) {
        conditions.push(`problem_type = ANY($${paramIndex++})`);
        params.push(filter.problemType);
      }
      if (filter.entryId) {
        conditions.push(`entry_id = $${paramIndex++}`);
        params.push(filter.entryId);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const { rows } = await pool.query(
        `SELECT * FROM feedback_queue ${whereClause} ORDER BY created_at DESC LIMIT 100`,
        params,
      );
      return rows as never[];
    },
    async update(feedbackId, updates) {
      const FEEDBACK_ALLOWED_COLUMNS: ReadonlySet<string> = new Set([
        'status',
        'description',
        'context',
        'entry_type',
        'problem_type',
        'admin_notes',
        'resolved_at',
        'resolved_by_user_id',
        'triggered_transition',
        'remediation_status',
        'remediation_opened_at',
        'remediation_opened_by_user_id',
        'remediation_resolved_at',
        'remediation_resolved_by_user_id',
      ]);
      const { clauses, values } = buildSetClauses(
        updates as Record<string, unknown>,
        FEEDBACK_ALLOWED_COLUMNS,
      );
      if (clauses.length > 0) {
        clauses.push('updated_at = NOW()');
        await pool.query(
          `UPDATE feedback_queue SET ${clauses.join(', ')} WHERE id = $${clauses.length + 1}`,
          [...values, feedbackId],
        );
      }
    },
  };
}

function createPgRetrievalQuery(pool: Pool): RetrievalQueryPort {
  return {
    async search(params) {
      // Basic text search implementation
      const limit = params.limit ?? 10;
      const conditions: string[] = ["lifecycle_state = 'approved'"];
      const queryParams: unknown[] = [];
      let paramIndex = 1;

      if (params.teamId) {
        conditions.push(`team_id = $${paramIndex++}`);
        queryParams.push(params.teamId);
      }

      // Simple text search using ILIKE
      conditions.push(`(content ILIKE $${paramIndex} OR title ILIKE $${paramIndex})`);
      queryParams.push(`%${params.query}%`);
      paramIndex++;

      const whereClause = conditions.join(' AND ');
      const { rows } = await pool.query(
        `SELECT id, content, title FROM knowledge_entries
         WHERE ${whereClause}
         LIMIT $${paramIndex}`,
        [...queryParams, limit],
      );

      return {
        results: (rows as Array<{ id: string; content: string; title: string }>).map((r) => ({
          entryId: r.id,
          score: 1.0,
          snippet: r.content.slice(0, 200),
          metadata: { title: r.title },
        })),
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Queue ports (simplified for distributed host)
// ---------------------------------------------------------------------------

function createPgTaskQueue(pool: Pool): TaskQueuePort {
  return {
    kind: 'postgres-task-queue',
    async enqueue(type, payload, options) {
      const id = generateId('task');
      await pool.query(
        `INSERT INTO task_queue (id, type, payload, priority, max_attempts, process_after, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())`,
        [
          id,
          type,
          JSON.stringify(payload),
          options?.priority ?? 0,
          options?.maxAttempts ?? 3,
          options?.delayMs
            ? new Date(Date.now() + options.delayMs).toISOString()
            : new Date().toISOString(),
        ],
      );
      return id;
    },
    async requeue(taskId) {
      await pool.query(
        `UPDATE task_queue SET status = 'pending', process_after = NOW(), attempts = 0 WHERE id = $1`,
        [taskId],
      );
    },
    async getStatusSnapshot() {
      const pendingResult = await pool.query(
        "SELECT COUNT(*) as count FROM task_queue WHERE status = 'pending'",
      );
      const runningResult = await pool.query(
        "SELECT COUNT(*) as count FROM task_queue WHERE status = 'running'",
      );
      const deadResult = await pool.query(
        "SELECT COUNT(*) as count FROM task_queue WHERE status = 'dead'",
      );
      return {
        provider: 'postgres' as const,
        pending: Number((pendingResult.rows[0] as { count: string }).count),
        running: Number((runningResult.rows[0] as { count: string }).count),
        dead: Number((deadResult.rows[0] as { count: string }).count),
        staleRunning: 0,
        reclaimCount: 0,
      };
    },
  };
}

function createPgOutbox(pool: Pool): OutboxPort {
  return {
    kind: 'postgres-domain-outbox',
    async enqueue(params) {
      const id = generateId('evt');
      await pool.query(
        `INSERT INTO domain_event_outbox (
           id, aggregate_type, aggregate_id, event_name, payload, status, available_at, attempts, created_at
         ) VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), 0, NOW())`,
        [
          id,
          params.aggregateType,
          params.aggregateId,
          params.eventName,
          JSON.stringify(params.payload),
        ],
      );
      return id;
    },
    async claimBatch(limit = 10, workerId = 'default') {
      const { rows } = await pool.query(
        `UPDATE domain_event_outbox
         SET status = 'processing', worker_id = $2, started_at = NOW(), heartbeat_at = NOW(), lease_until = NOW() + INTERVAL '30 seconds'
         WHERE id IN (
           SELECT id FROM domain_event_outbox
           WHERE status = 'pending'
           ORDER BY created_at
           LIMIT $1
           FOR UPDATE SKIP LOCKED
         )
         RETURNING id, event_name as "eventName", payload, aggregate_id as "aggregateId"`,
        [limit, workerId],
      );
      return rows as OutboxPort extends { claimBatch(...args: unknown[]): Promise<infer R> }
        ? R
        : never;
    },
    async complete(eventId) {
      await pool.query(
        "UPDATE domain_event_outbox SET status = 'completed', published_at = NOW(), worker_id = NULL, heartbeat_at = NULL, lease_until = NULL WHERE id = $1",
        [eventId],
      );
    },
    async fail(eventId, error) {
      await pool.query(
        "UPDATE domain_event_outbox SET status = 'failed', last_error = $2, worker_id = NULL, heartbeat_at = NULL, lease_until = NULL WHERE id = $1",
        [eventId, error],
      );
    },
    async getStatusSnapshot() {
      const pendingResult = await pool.query(
        "SELECT COUNT(*) as count FROM domain_event_outbox WHERE status = 'pending'",
      );
      const processingResult = await pool.query(
        "SELECT COUNT(*) as count FROM domain_event_outbox WHERE status = 'processing'",
      );
      const failedResult = await pool.query(
        "SELECT COUNT(*) as count FROM domain_event_outbox WHERE status = 'failed'",
      );
      return {
        provider: 'postgres' as const,
        pending: Number((pendingResult.rows[0] as { count: string }).count),
        processing: Number((processingResult.rows[0] as { count: string }).count),
        failed: Number((failedResult.rows[0] as { count: string }).count),
        staleProcessing: 0,
        reclaimCount: 0,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Aggregate factories
// ---------------------------------------------------------------------------

export interface ServicePortImplementations {
  repos: Omit<RepositoryPorts, 'audit' | 'session' | 'accessKey' | 'team' | 'membership' | 'user'>;
  auditLog: AuditLogPort;
  retrievalQuery: RetrievalQueryPort;
  asyncDiagnostics: {
    task: Pick<TaskQueuePort, 'kind' | 'getStatusSnapshot'>;
    outbox: Pick<OutboxPort, 'kind' | 'getStatusSnapshot'>;
  };
  jobRuntime?: QueuePorts;
}

/**
 * Create all port implementations backed by a PostgreSQL pool.
 */
export function createServicePorts(
  pool: Pool,
  serviceName: DatabaseWriteService = 'server-compatibility-seam',
  identity: Pick<ServicePortImplementations, 'auditLog'>,
): ServicePortImplementations {
  const knowledgeProjection = createPgKnowledgeReadProjection(pool);
  const feedbackRepo = withDatabaseWriteGuard(createPgFeedbackRepo(pool), serviceName, 'knowledge');
  const taskQueue = createPgTaskQueue(pool);
  const outbox = createPgOutbox(pool);

  return {
    repos: {
      knowledge: knowledgeProjection,
      feedback: feedbackRepo,
    },
    auditLog: identity.auditLog,
    retrievalQuery: createPgRetrievalQuery(pool),
    asyncDiagnostics: {
      task: {
        kind: taskQueue.kind,
        getStatusSnapshot: () => taskQueue.getStatusSnapshot(),
      },
      outbox: {
        kind: outbox.kind,
        getStatusSnapshot: () => outbox.getStatusSnapshot(),
      },
    },
    ...(serviceName === 'job-runtime' ? { jobRuntime: { task: taskQueue, outbox } } : {}),
  };
}
