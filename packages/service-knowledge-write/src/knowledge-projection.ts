/**
 * Owner-local knowledge entry projection: row reading and SQL condition
 * building. Pure PostgreSQL mapping — no business judgment.
 */

import type { KnowledgeEntry, KnowledgeIndexingEntry, LifecycleState } from '@trapmap/contracts';
import { KNOWLEDGE_PROJECTION_OPERATION_CONDITIONS } from '@trapmap/backend-core';

import type { KnowledgeOwnerPort } from '@trapmap/contracts';

type Queryable = {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};

function readKnowledgeRowFields(row: Record<string, unknown>) {
  return {
    content: String(row.detail ?? ''),
    title: String(row.shortcut ?? ''),
    ownerUserId: String(row.owner_user_id ?? ''),
    teamId: (row.team_id as string | null) ?? null,
    requiredLevel: Number(row.required_level ?? 0),
    boundary: row.boundary ?? null,
    maintenanceMeta: row.maintenance_meta ?? null,
    embeddingCache: row.embedding_cache ?? null,
    indexState: row.index_state ?? null,
    decayMeta: row.decay_meta ?? null,
    evidenceMeta: row.evidence_meta ?? null,
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
  // lib type gap: the owner projection maps PG columns (snake_case) into the
  // contracts projection shape; strict structural assignment is impossible
  // because rows carry the full knowledge_entries column surface
  return normalizeKnowledgeProjection(row) as unknown as KnowledgeEntry; // lib type gap:
}

function toKnowledgeIndexingEntry(row: Record<string, unknown>): KnowledgeIndexingEntry {
  return {
    id: String(row.id),
    teamId: (row.team_id as string | null) ?? null,
    scope: String(row.scope) as KnowledgeIndexingEntry['scope'],
    labels: readKnowledgeRowLabels(row),
    shortcut: String(row.shortcut ?? ''),
    detail: String(row.detail ?? ''),
    requiredLevel: Number(row.required_level ?? 0),
    lifecycleState: readKnowledgeRowLifecycle(row),
    boundary: (row.boundary as KnowledgeIndexingEntry['boundary']) ?? null,
    updatedAt: String(row.updated_at ?? ''),
    revision: Number(row.index_revision ?? 0),
    indexState: (row.index_state as Record<string, unknown> | null) ?? null,
    embeddingCache: (row.embedding_cache as KnowledgeIndexingEntry['embeddingCache']) ?? null,
  };
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
  const condition = filter.operation
    ? KNOWLEDGE_PROJECTION_OPERATION_CONDITIONS[filter.operation]
    : undefined;
  if (condition) conditions.push(condition);
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

export function createKnowledgeOwnerProjection(
  pool: Queryable,
): Pick<
  KnowledgeOwnerPort,
  'getById' | 'getByIds' | 'getIndexingEntry' | 'listIndexingEntries' | 'listByFilter'
> {
  return {
    async getById(entryId) {
      const result = await pool.query('SELECT * FROM knowledge_entries WHERE id = $1', [entryId]);
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row ? toKnowledgeEntryProjection(row) : null;
    },
    async getIndexingEntry(entryId) {
      const result = await pool.query(
        `SELECT ke.*, COALESCE(MAX(kr.revision_no), 0)::int AS index_revision
         FROM knowledge_entries ke
         LEFT JOIN knowledge_revisions kr ON kr.entry_id = ke.id
         WHERE ke.id = $1
         GROUP BY ke.id`,
        [entryId],
      );
      const row = result.rows[0] as Record<string, unknown> | undefined;
      return row ? toKnowledgeIndexingEntry(row) : null;
    },
    async listIndexingEntries({ offset, limit }) {
      const boundedLimit = Math.max(1, Math.min(limit, 100));
      const result = await pool.query(
        `SELECT ke.*, COALESCE(kr.index_revision, 0)::int AS index_revision
         FROM knowledge_entries ke
         LEFT JOIN LATERAL (
           SELECT MAX(revision_no) AS index_revision
           FROM knowledge_revisions
           WHERE entry_id = ke.id
         ) kr ON true
         ORDER BY ke.updated_at DESC, ke.id DESC
         LIMIT $1 OFFSET $2`,
        [boundedLimit + 1, Math.max(0, offset)],
      );
      const entries = result.rows
        .slice(0, boundedLimit)
        .map((row) => toKnowledgeIndexingEntry(row as Record<string, unknown>));
      return {
        entries,
        nextOffset: result.rows.length > boundedLimit ? offset + boundedLimit : null,
      };
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
