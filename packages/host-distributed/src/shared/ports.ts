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
  AccessKeyRepositoryPort,
  AuditLogPort,
  AuditRepositoryPort,
  CandidateRepositoryPort,
  FeedbackRepositoryPort,
  KnowledgeRepositoryPort,
  MembershipRepositoryPort,
  OutboxPort,
  PermissionCheckPort,
  QueuePorts,
  RepositoryPorts,
  RetrievalQueryPort,
  SessionLookupPort,
  SessionRepositoryPort,
  TaskQueuePort,
  TeamLookupPort,
  TeamRepositoryPort,
  UserRepositoryPort,
} from '@trapmap/backend-core';
import type {
  AnalysisSnapshot,
  DuplicateCase,
  LifecycleState,
  ManualResultSubmission,
} from '@trapmap/contracts';
import type { DatabaseWriteService } from './database-ownership.js';
import { withDatabaseWriteGuard } from './database-ownership.js';

// ---------------------------------------------------------------------------
// ID generation helper
// ---------------------------------------------------------------------------

function generateId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
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

function createPgKnowledgeRepo(pool: Pool): KnowledgeRepositoryPort {
  return {
    async nextId() {
      return generateId('k');
    },
    async insert(entry) {
      await pool.query(
        `INSERT INTO knowledge_entries (
           id, team_id, scope, labels, shortcut, detail, required_level, lifecycle_state, owner_user_id, created_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          entry.id,
          entry.teamId,
          (entry as Record<string, unknown>).scope ?? 'global',
          JSON.stringify(entry.labels ?? []),
          (entry as Record<string, unknown>).title ?? '',
          entry.content,
          (entry as Record<string, unknown>).requiredLevel ?? 0,
          entry.ownerUserId,
          entry.lifecycleState,
          (entry as Record<string, unknown>).createdAt ?? new Date().toISOString(),
          (entry as Record<string, unknown>).updatedAt ?? new Date().toISOString(),
        ],
      );
    },
    async getById(entryId) {
      const { rows } = await pool.query('SELECT * FROM knowledge_entries WHERE id = $1', [entryId]);
      return rows[0] ? (mapKnowledgeRow(rows[0] as Record<string, unknown>) as never) : null;
    },
    async updateLifecycle(entryId, newState: LifecycleState, context) {
      const { rows } = await pool.query(
        `UPDATE knowledge_entries SET lifecycle_state = $2, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [entryId, newState],
      );
      await pool.query(
        `INSERT INTO lifecycle_events (id, entry_id, type, actor_user_id, submission_id, state, note, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          generateId('le'),
          entryId,
          newState === 'approved'
            ? 'reviewer-approved'
            : newState === 'rejected'
              ? 'reviewer-rejected'
              : newState === 'submitted'
                ? 'resubmitted'
                : 'updated',
          context.actorId,
          null,
          newState,
          context.note ?? null,
        ],
      );
      return mapKnowledgeRow(rows[0] as Record<string, unknown>) as never;
    },
    async appendRevision(entryId, revision) {
      await pool.query(
        `INSERT INTO knowledge_revisions (
           id, entry_id, revision_no, submitted_at, submitted_by_user_id, shortcut, detail, labels, review_notes
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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
      const params: unknown[] = [];
      let paramIndex = 1;

      if (filter.lifecycleState) {
        conditions.push(`lifecycle_state = $${paramIndex++}`);
        params.push(filter.lifecycleState);
      }
      if (filter.teamId) {
        conditions.push(`team_id = $${paramIndex++}`);
        params.push(filter.teamId);
      }
      if (filter.ownerUserId) {
        conditions.push(`owner_user_id = $${paramIndex++}`);
        params.push(filter.ownerUserId);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const { rows } = await pool.query(
        `SELECT * FROM knowledge_entries ${whereClause} ORDER BY created_at DESC LIMIT 100`,
        params,
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

// ---------------------------------------------------------------------------
// Candidate repository
// ---------------------------------------------------------------------------

function createPgCandidateRepo(pool: Pool): CandidateRepositoryPort {
  return {
    async insert(candidate) {
      await pool.query(
        `INSERT INTO candidates (id, source_type, submitted_by, team_id, status, original_payload, received_at, retry_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          candidate.id,
          candidate.sourceType,
          candidate.submittedBy,
          candidate.teamId ?? null,
          candidate.status ?? 'received',
          JSON.stringify(candidate.originalPayload),
          candidate.receivedAt ?? new Date().toISOString(),
          candidate.retryCount ?? 0,
        ],
      );
    },
    async getById(candidateId) {
      const { rows } = await pool.query('SELECT * FROM candidates WHERE id = $1', [candidateId]);
      return (
        (rows[0] as CandidateRepositoryPort extends { getById(id: string): Promise<infer R> }
          ? R
          : never) ?? null
      );
    },
    async updateStatus(candidateId, status, error) {
      await pool.query(
        'UPDATE candidates SET status = $2, error = $3, updated_at = NOW() WHERE id = $1',
        [candidateId, status, error ?? null],
      );
    },
    async attachAnalysis(candidateId, snapshot: AnalysisSnapshot) {
      await pool.query(
        'UPDATE candidates SET analysis_snapshot = $2, updated_at = NOW() WHERE id = $1',
        [candidateId, JSON.stringify(snapshot)],
      );
      await pool.query(
        `INSERT INTO candidate_analyses (
           candidate_id, normalized_at, fingerprint, keywords, tokens, duplicate_trace
         )
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (candidate_id) DO UPDATE SET
           normalized_at = EXCLUDED.normalized_at,
           fingerprint = EXCLUDED.fingerprint,
           keywords = EXCLUDED.keywords,
           tokens = EXCLUDED.tokens,
           duplicate_trace = EXCLUDED.duplicate_trace`,
        [
          candidateId,
          snapshot.normalizedAt,
          snapshot.fingerprint,
          JSON.stringify(snapshot.keywords),
          JSON.stringify(snapshot.tokens),
          snapshot.duplicateTrace ? JSON.stringify(snapshot.duplicateTrace) : null,
        ],
      );
    },
    async attachDuplicateCase(candidateId, duplicateCase: DuplicateCase) {
      await pool.query(
        'UPDATE candidates SET duplicate_case = $2, updated_at = NOW() WHERE id = $1',
        [candidateId, JSON.stringify(duplicateCase)],
      );
      await pool.query(
        `INSERT INTO candidate_duplicate_cases (
           id, candidate_id, detected_at, detection_version, highest_similarity, has_exact_duplicate, duplicate_type
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           candidate_id = EXCLUDED.candidate_id,
           detected_at = EXCLUDED.detected_at,
           detection_version = EXCLUDED.detection_version,
           highest_similarity = EXCLUDED.highest_similarity,
           has_exact_duplicate = EXCLUDED.has_exact_duplicate,
           duplicate_type = EXCLUDED.duplicate_type`,
        [
          duplicateCase.id,
          candidateId,
          duplicateCase.detectedAt,
          duplicateCase.detectionVersion,
          duplicateCase.highestSimilarity,
          duplicateCase.hasExactDuplicate ? 1 : 0,
          duplicateCase.duplicateType,
        ],
      );
      await pool.query('DELETE FROM candidate_duplicate_matches WHERE duplicate_case_id = $1', [
        duplicateCase.id,
      ]);
      for (const match of duplicateCase.matches) {
        await pool.query(
          `INSERT INTO candidate_duplicate_matches (
             duplicate_case_id, entity_type, entity_id, entity_title, similarity_score, match_type, shared_keywords, shared_tokens, text_overlap_percent
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            duplicateCase.id,
            match.entityType,
            match.entityId,
            match.entityTitle,
            match.similarityScore,
            match.matchType,
            JSON.stringify(match.overlapDetails.sharedKeywords),
            JSON.stringify(match.overlapDetails.sharedTokens),
            match.overlapDetails.textOverlapPercent,
          ],
        );
      }
    },
    async attachManualResult(candidateId, result: ManualResultSubmission, reviewedBy) {
      const manualResult = {
        ...result,
        submittedBy: reviewedBy,
        submittedAt: new Date().toISOString(),
      };
      await pool.query(
        'UPDATE candidates SET manual_result = $2, updated_at = NOW() WHERE id = $1',
        [candidateId, JSON.stringify(manualResult)],
      );
      await pool.query(
        `INSERT INTO candidate_manual_results (
           candidate_id, decision, notes, merged_with_entity_type, merged_with_entity_id, merged_with_entity_title, submitted_at, submitted_by_user_id
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (candidate_id) DO UPDATE SET
           decision = EXCLUDED.decision,
           notes = EXCLUDED.notes,
           merged_with_entity_type = EXCLUDED.merged_with_entity_type,
           merged_with_entity_id = EXCLUDED.merged_with_entity_id,
           merged_with_entity_title = EXCLUDED.merged_with_entity_title,
           submitted_at = EXCLUDED.submitted_at,
           submitted_by_user_id = EXCLUDED.submitted_by_user_id`,
        [
          candidateId,
          result.decision,
          result.notes,
          result.mergedWith?.entityType ?? null,
          result.mergedWith?.entityId ?? null,
          result.mergedWith?.entityTitle ?? null,
          manualResult.submittedAt,
          reviewedBy,
        ],
      );
    },
    async listByStatus(status) {
      const { rows } = await pool.query(
        'SELECT * FROM candidates WHERE status = $1 ORDER BY created_at DESC LIMIT 100',
        [status],
      );
      return rows as never[];
    },
    async markResolved(candidateId, resolvedBy) {
      await pool.query(
        'UPDATE candidates SET status = $2, resolved_by = $3, resolved_at = NOW() WHERE id = $1',
        [candidateId, 'resolved', resolvedBy],
      );
    },
    async findByFingerprint(fingerprint) {
      const { rows } = await pool.query(
        'SELECT id FROM candidates WHERE fingerprint = $1 LIMIT 1',
        [fingerprint],
      );
      return (rows[0] as { id: string } | undefined)?.id ?? null;
    },
  };
}

// ---------------------------------------------------------------------------
// Session repository
// ---------------------------------------------------------------------------

function createPgSessionRepo(pool: Pool): SessionRepositoryPort {
  return {
    async nextId() {
      return generateId('s');
    },
    async create(session) {
      const id = generateId('s');
      const now = new Date().toISOString();
      await pool.query(
        `INSERT INTO sessions (id, user_id, token_hash, active_team_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          id,
          (session as Record<string, unknown>).userId,
          session.tokenHash,
          session.activeTeamId,
          now,
          now,
        ],
      );
      return { id, ...session, createdAt: now, updatedAt: now } as never;
    },
    async getByTokenHash(tokenHash) {
      const { rows } = await pool.query('SELECT * FROM sessions WHERE token_hash = $1', [
        tokenHash,
      ]);
      return (
        (rows[0] as SessionRepositoryPort extends { getByTokenHash(t: string): Promise<infer R> }
          ? R
          : never) ?? null
      );
    },
    async deleteByTokenHash(tokenHash) {
      await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
    },
    async updateActiveTeam(sessionId, teamId) {
      const { rows } = await pool.query(
        'UPDATE sessions SET active_team_id = $2, updated_at = NOW() WHERE id = $1 RETURNING *',
        [sessionId, teamId],
      );
      return rows[0] as never;
    },
  };
}

// ---------------------------------------------------------------------------
// Access key repository
// ---------------------------------------------------------------------------

function createPgAccessKeyRepo(pool: Pool): AccessKeyRepositoryPort {
  return {
    async nextId() {
      return generateId('ak');
    },
    async insert(key) {
      await pool.query(
        `INSERT INTO access_keys (id, token_hash, member_id, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [key.id, key.tokenHash, key.memberId],
      );
    },
    async getByTokenHash(tokenHash) {
      const { rows } = await pool.query('SELECT * FROM access_keys WHERE token_hash = $1', [
        tokenHash,
      ]);
      return (
        (rows[0] as AccessKeyRepositoryPort extends { getByTokenHash(t: string): Promise<infer R> }
          ? R
          : never) ?? null
      );
    },
    async getById(keyId) {
      const { rows } = await pool.query('SELECT * FROM access_keys WHERE id = $1', [keyId]);
      return (
        (rows[0] as AccessKeyRepositoryPort extends { getById(id: string): Promise<infer R> }
          ? R
          : never) ?? null
      );
    },
    async revoke(keyId) {
      await pool.query('UPDATE access_keys SET revoked_at = NOW() WHERE id = $1', [keyId]);
    },
    async listByMember(memberId) {
      const { rows } = await pool.query(
        'SELECT * FROM access_keys WHERE member_id = $1 AND revoked_at IS NULL',
        [memberId],
      );
      return rows as never[];
    },
  };
}

// ---------------------------------------------------------------------------
// Team repository
// ---------------------------------------------------------------------------

function createPgTeamRepo(pool: Pool): TeamRepositoryPort {
  return {
    async nextId() {
      return generateId('t');
    },
    async insert(team) {
      await pool.query(
        `INSERT INTO teams (id, slug, name, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())`,
        [team.id, team.slug, (team as Record<string, unknown>).name ?? team.slug],
      );
    },
    async getById(teamId) {
      const { rows } = await pool.query('SELECT * FROM teams WHERE id = $1', [teamId]);
      return (
        (rows[0] as TeamRepositoryPort extends { getById(id: string): Promise<infer R> }
          ? R
          : never) ?? null
      );
    },
    async getBySlug(slug) {
      const { rows } = await pool.query('SELECT * FROM teams WHERE slug = $1', [slug]);
      return (
        (rows[0] as TeamRepositoryPort extends { getBySlug(s: string): Promise<infer R> }
          ? R
          : never) ?? null
      );
    },
    async listAll() {
      const { rows } = await pool.query('SELECT * FROM teams ORDER BY slug');
      return rows as never[];
    },
    async update(teamId, updates) {
      const TEAM_ALLOWED_COLUMNS: ReadonlySet<string> = new Set(['name', 'slug', 'description']);
      const { clauses, values } = buildSetClauses(
        updates as Record<string, unknown>,
        TEAM_ALLOWED_COLUMNS,
      );
      if (clauses.length > 0) {
        clauses.push('updated_at = NOW()');
        await pool.query(
          `UPDATE teams SET ${clauses.join(', ')} WHERE id = $${clauses.length + 1}`,
          [...values, teamId],
        );
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Membership repository
// ---------------------------------------------------------------------------

function createPgMembershipRepo(pool: Pool): MembershipRepositoryPort {
  return {
    async nextId() {
      return generateId('m');
    },
    async insert(membership) {
      await pool.query(
        `INSERT INTO memberships (id, user_id, team_id, role, created_at, updated_at)
         VALUES ($1, $2, $3, $4, NOW(), NOW())`,
        [
          membership.id,
          membership.userId,
          membership.teamId,
          (membership as Record<string, unknown>).role,
        ],
      );
    },
    async getById(membershipId) {
      const { rows } = await pool.query('SELECT * FROM memberships WHERE id = $1', [membershipId]);
      return (
        (rows[0] as MembershipRepositoryPort extends { getById(id: string): Promise<infer R> }
          ? R
          : never) ?? null
      );
    },
    async findByUserAndTeam(userId, teamId) {
      const { rows } = await pool.query(
        'SELECT * FROM memberships WHERE user_id = $1 AND team_id = $2',
        [userId, teamId],
      );
      return (
        (rows[0] as MembershipRepositoryPort extends {
          findByUserAndTeam(u: string, t: string): Promise<infer R>;
        }
          ? R
          : never) ?? null
      );
    },
    async listByUser(userId) {
      const { rows } = await pool.query('SELECT * FROM memberships WHERE user_id = $1', [userId]);
      return rows as never[];
    },
    async listByTeam(teamId) {
      const { rows } = await pool.query('SELECT * FROM memberships WHERE team_id = $1', [teamId]);
      return rows as never[];
    },
    async update(membershipId, updates) {
      const MEMBERSHIP_ALLOWED_COLUMNS: ReadonlySet<string> = new Set([
        'role',
        'security_level',
        'permissions',
        'notes',
      ]);
      const { clauses, values } = buildSetClauses(
        updates as Record<string, unknown>,
        MEMBERSHIP_ALLOWED_COLUMNS,
      );
      if (clauses.length > 0) {
        clauses.push('updated_at = NOW()');
        await pool.query(
          `UPDATE memberships SET ${clauses.join(', ')} WHERE id = $${clauses.length + 1}`,
          [...values, membershipId],
        );
      }
    },
  };
}

// ---------------------------------------------------------------------------
// User repository
// ---------------------------------------------------------------------------

function createPgUserRepo(pool: Pool): UserRepositoryPort {
  return {
    async nextId() {
      return generateId('u');
    },
    async insert(user) {
      await pool.query(
        `INSERT INTO users (id, handle, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())`,
        [user.id, user.handle],
      );
    },
    async getById(userId) {
      const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
      return (
        (rows[0] as UserRepositoryPort extends { getById(id: string): Promise<infer R> }
          ? R
          : never) ?? null
      );
    },
    async getByHandle(handle) {
      const { rows } = await pool.query('SELECT * FROM users WHERE handle = $1', [handle]);
      return (
        (rows[0] as UserRepositoryPort extends { getByHandle(h: string): Promise<infer R> }
          ? R
          : never) ?? null
      );
    },
    async update(userId, updates) {
      const USER_ALLOWED_COLUMNS: ReadonlySet<string> = new Set(['handle', 'notes']);
      const { clauses, values } = buildSetClauses(
        updates as Record<string, unknown>,
        USER_ALLOWED_COLUMNS,
      );
      if (clauses.length > 0) {
        clauses.push('updated_at = NOW()');
        await pool.query(
          `UPDATE users SET ${clauses.join(', ')} WHERE id = $${clauses.length + 1}`,
          [...values, userId],
        );
      }
    },
  };
}

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

// ---------------------------------------------------------------------------
// Audit repository
// ---------------------------------------------------------------------------

function createPgAuditRepo(pool: Pool): AuditRepositoryPort {
  return {
    async nextId() {
      return generateId('ae');
    },
    async insert(event) {
      await pool.query(
        `INSERT INTO audit_events (
           id, action, actor_id, entity_id, team_id, payload, event_version,
           source_service, request_id, trace_id, operation_id, causation_id, outcome, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          event.id,
          event.action,
          event.actorId,
          event.entityId ?? null,
          event.teamId ?? null,
          JSON.stringify((event as Record<string, unknown>).payload ?? event.metadata ?? {}),
          event.eventVersion ?? 1,
          event.sourceService ?? 'distributed',
          event.requestId ?? null,
          event.traceId ?? null,
          event.operationId ?? null,
          event.causationId ?? null,
          event.outcome ?? 'success',
          event.createdAt,
        ],
      );
    },
    async getById(eventId) {
      const { rows } = await pool.query('SELECT * FROM audit_events WHERE id = $1', [eventId]);
      return (
        (rows[0] as AuditRepositoryPort extends { getById(id: string): Promise<infer R> }
          ? R
          : never) ?? null
      );
    },
    async listByFilter(filter) {
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (filter.action?.length) {
        conditions.push(`action = ANY($${paramIndex++})`);
        params.push(filter.action);
      }
      if (filter.actorId) {
        conditions.push(`actor_id = $${paramIndex++}`);
        params.push(filter.actorId);
      }
      if (filter.entityId) {
        conditions.push(`entity_id = $${paramIndex++}`);
        params.push(filter.entityId);
      }
      if (filter.teamId) {
        conditions.push(`team_id = $${paramIndex++}`);
        params.push(filter.teamId);
      }
      if (filter.requestId) {
        conditions.push(`request_id = $${paramIndex++}`);
        params.push(filter.requestId);
      }
      if (filter.traceId) {
        conditions.push(`trace_id = $${paramIndex++}`);
        params.push(filter.traceId);
      }
      if (filter.operationId) {
        conditions.push(`operation_id = $${paramIndex++}`);
        params.push(filter.operationId);
      }
      if (filter.causationId) {
        conditions.push(`causation_id = $${paramIndex++}`);
        params.push(filter.causationId);
      }
      if (filter.from) {
        conditions.push(`created_at >= $${paramIndex++}`);
        params.push(filter.from);
      }
      if (filter.to) {
        conditions.push(`created_at <= $${paramIndex++}`);
        params.push(filter.to);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const limit = filter.limit ?? 100;
      const offset = 0;

      const countResult = await pool.query(
        `SELECT COUNT(*) as total FROM audit_events ${whereClause}`,
        params,
      );
      const total = Number((countResult.rows[0] as { total: string }).total);

      const { rows } = await pool.query(
        `SELECT * FROM audit_events ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...params, limit, offset],
      );

      return { items: rows as never[], total };
    },
  };
}

// ---------------------------------------------------------------------------
// Actor / auth ports
// ---------------------------------------------------------------------------

function createPgSessionLookup(pool: Pool): SessionLookupPort {
  return {
    async resolveSession(sessionToken) {
      const { rows } = await pool.query(
        `SELECT s.id as session_id, u.id as user_id, u.handle, s.active_team_id
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         WHERE s.token_hash = $1`,
        [sessionToken],
      );
      const row = rows[0] as
        | { session_id: string; user_id: string; handle: string; active_team_id: string | null }
        | undefined;
      if (!row) return null;
      return {
        sessionId: row.session_id,
        userId: row.user_id,
        handle: row.handle,
        activeTeamId: row.active_team_id,
        securityLevel: 1,
      };
    },
  };
}

function createPgTeamLookup(pool: Pool): TeamLookupPort {
  return {
    async getTeam(teamId) {
      const { rows } = await pool.query('SELECT * FROM teams WHERE id = $1', [teamId]);
      const row = rows[0] as { id: string; slug: string } | undefined;
      if (!row) return null;
      return { teamId: row.id, slug: row.slug };
    },
    async listTeamsForUser(userId) {
      const { rows } = await pool.query(
        `SELECT t.* FROM teams t
         JOIN memberships m ON t.id = m.team_id
         WHERE m.user_id = $1`,
        [userId],
      );
      return (rows as Array<{ id: string; slug: string }>).map((r) => ({
        teamId: r.id,
        slug: r.slug,
      }));
    },
  };
}

function createPgPermissionCheck(pool: Pool): PermissionCheckPort {
  return {
    async resolvePermissions(userId, teamId) {
      if (!teamId) return [];
      const { rows } = await pool.query(
        'SELECT role FROM memberships WHERE user_id = $1 AND team_id = $2',
        [userId, teamId],
      );
      const role = (rows[0] as { role: string } | undefined)?.role;
      if (!role) return [];
      // Map roles to permissions (simplified)
      if (role === 'admin') return ['admin', 'write', 'read'] as never[];
      if (role === 'editor') return ['write', 'read'] as never[];
      return ['read'] as never[];
    },
    async hasPermission(userId, teamId, permission) {
      const perms = await this.resolvePermissions(userId, teamId);
      return perms.includes(permission as never);
    },
  };
}

function createPgAuditLog(pool: Pool): AuditLogPort {
  const repo = createPgAuditRepo(pool);
  return {
    async record(entry) {
      await repo.insert({
        id: generateId('ae'),
        action: entry.action,
        actorId: entry.actorId,
        entityId: entry.entityId,
        teamId: entry.teamId,
        createdAt: entry.timestamp ?? new Date().toISOString(),
        payload: entry.metadata,
        eventVersion: entry.eventVersion,
        sourceService: entry.sourceService ?? 'distributed',
        requestId: entry.requestId,
        traceId: entry.traceId,
        operationId: entry.operationId,
        causationId: entry.causationId,
        outcome: entry.outcome,
      } as never);
    },
    async query(filter) {
      return repo.listByFilter(filter);
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
  repos: RepositoryPorts;
  sessionLookup: SessionLookupPort;
  teamLookup: TeamLookupPort;
  permissionCheck: PermissionCheckPort;
  auditLog: AuditLogPort;
  retrievalQuery: RetrievalQueryPort;
  queuePorts: QueuePorts;
}

/**
 * Create all port implementations backed by a PostgreSQL pool.
 */
export function createServicePorts(
  pool: Pool,
  serviceName: DatabaseWriteService = 'server-compatibility-seam',
): ServicePortImplementations {
  const knowledgeRepo = withDatabaseWriteGuard(
    createPgKnowledgeRepo(pool),
    serviceName,
    'knowledge',
  );
  const candidateRepo = withDatabaseWriteGuard(
    createPgCandidateRepo(pool),
    serviceName,
    'candidate',
  );
  const sessionRepo = withDatabaseWriteGuard(createPgSessionRepo(pool), serviceName, 'identity');
  const accessKeyRepo = withDatabaseWriteGuard(
    createPgAccessKeyRepo(pool),
    serviceName,
    'identity',
  );
  const teamRepo = withDatabaseWriteGuard(createPgTeamRepo(pool), serviceName, 'identity');
  const membershipRepo = withDatabaseWriteGuard(
    createPgMembershipRepo(pool),
    serviceName,
    'identity',
  );
  const userRepo = withDatabaseWriteGuard(createPgUserRepo(pool), serviceName, 'identity');
  const feedbackRepo = withDatabaseWriteGuard(createPgFeedbackRepo(pool), serviceName, 'knowledge');
  const auditRepo = createPgAuditRepo(pool);

  return {
    repos: {
      knowledge: knowledgeRepo,
      candidate: candidateRepo,
      session: sessionRepo,
      accessKey: accessKeyRepo,
      team: teamRepo,
      membership: membershipRepo,
      user: userRepo,
      feedback: feedbackRepo,
      audit: auditRepo,
    },
    sessionLookup: createPgSessionLookup(pool),
    teamLookup: createPgTeamLookup(pool),
    permissionCheck: createPgPermissionCheck(pool),
    auditLog: createPgAuditLog(pool),
    retrievalQuery: createPgRetrievalQuery(pool),
    queuePorts: {
      task: createPgTaskQueue(pool),
      outbox: createPgOutbox(pool),
    },
  };
}
