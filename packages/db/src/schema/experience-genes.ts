import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from 'drizzle-orm/pg-core';

import type {
  GeneEventType,
  GeneGeneratorKind,
  GeneIndexStatus,
  GeneSourceKind,
  GeneStatus,
} from '@trapmap/contracts';

import { auditTimestamps } from './column-factories.js';

const activeGeneStatuses = sql`('candidate', 'validated', 'solidified')`;

export const experienceGenes = pgTable(
  'experience_genes',
  {
    id: text('id').primaryKey(),
    schemaVersion: text('schema_version').notNull(),
    status: text('status').notNull().$type<GeneStatus>(),
    title: text('title').notNull(),
    signalsMatch: jsonb('signals_match').notNull().$type<string[]>(),
    summary: text('summary').notNull(),
    strategy: jsonb('strategy').notNull().$type<string[]>(),
    avoid: jsonb('avoid').notNull().$type<string[]>(),
    constraints: jsonb('constraints').notNull().$type<string[]>(),
    validation: jsonb('validation').notNull().$type<string[]>(),
    labels: jsonb('labels').notNull().$type<string[]>(),
    scope: text('scope').notNull(),
    teamId: text('team_id'),
    requiredLevel: integer('required_level').notNull(),
    sourceType: text('source_type').notNull().$type<GeneSourceKind>(),
    sourceId: text('source_id').notNull(),
    sourceRevision: integer('source_revision').notNull(),
    sourceHash: text('source_hash').notNull(),
    artifactId: text('artifact_id'),
    capsuleId: text('capsule_id'),
    artifactRevision: integer('artifact_revision'),
    derivationUnitId: text('derivation_unit_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    contentHash: text('content_hash').notNull(),
    parentEventId: text('parent_event_id'),
    priorGeneHash: text('prior_gene_hash'),
    generatorKind: text('generator_kind').notNull().$type<GeneGeneratorKind>(),
    generatorModel: text('generator_model'),
    promptVersion: text('prompt_version').notNull(),
    indexStatus: text('index_status').notNull().$type<GeneIndexStatus>(),
    indexLastError: text('index_last_error'),
    ...auditTimestamps(),
  },
  (table) => [
    uniqueIndex('uq_experience_genes_active_idempotency')
      .on(table.idempotencyKey)
      .where(sql`${table.status} IN ${activeGeneStatuses}`),
    index('idx_experience_genes_status_updated').on(table.status, table.updatedAt),
    index('idx_experience_genes_source').on(table.sourceType, table.sourceId),
    index('idx_experience_genes_governance').on(table.scope, table.teamId, table.requiredLevel),
    check('ck_experience_genes_schema_version', sql`${table.schemaVersion} = '1'`),
    check(
      'ck_experience_genes_status',
      sql`${table.status} IN ('candidate', 'validated', 'solidified', 'stale', 'deprecated')`,
    ),
    check(
      'ck_experience_genes_source_kind',
      sql`${table.sourceType} IN ('trap', 'skill-artifact', 'skill-capsule')`,
    ),
    check('ck_experience_genes_scope', sql`${table.scope} IN ('global', 'project')`),
    check(
      'ck_experience_genes_generator_kind',
      sql`${table.generatorKind} IN ('rule', 'llm', 'hybrid')`,
    ),
    check(
      'ck_experience_genes_index_status',
      sql`${table.indexStatus} IN ('pending', 'ready', 'failed')`,
    ),
  ],
);

export const experienceGeneEvents = pgTable(
  'experience_gene_events',
  {
    id: text('id').primaryKey(),
    geneId: text('gene_id').notNull(),
    type: text('type').notNull().$type<GeneEventType>(),
    sourceType: text('source_type').notNull().$type<GeneSourceKind>(),
    sourceId: text('source_id').notNull(),
    sourceRevision: integer('source_revision').notNull(),
    sourceHash: text('source_hash').notNull(),
    actorKind: text('actor_kind').notNull(),
    actorId: text('actor_id'),
    validatorSummary: jsonb('validator_summary').notNull().$type<Record<string, unknown>>(),
    reasonClass: text('reason_class'),
    payloadSnapshotHash: text('payload_snapshot_hash').notNull(),
    payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('idx_experience_gene_events_gene_time').on(table.geneId, table.createdAt),
    check(
      'ck_experience_gene_events_type',
      sql`${table.type} IN ('derived', 'validated', 'rejected', 'solidified', 'staled', 'deprecated', 'index-failed')`,
    ),
    check(
      'ck_experience_gene_events_actor_kind',
      sql`${table.actorKind} IN ('system', 'user', 'agent')`,
    ),
  ],
);

export const experienceGeneEmbeddings = pgTable(
  'experience_gene_embeddings',
  {
    geneId: text('gene_id').primaryKey(),
    contentHash: text('content_hash').notNull(),
    embedding: vector('embedding', { dimensions: 384 }).notNull(),
    // fallow-ignore-next-line code-duplication -- projection tail is intentionally parallel across both Gene indexes.
    embeddingModelVersion: text('embedding_model_version').notNull(),
    /** Consolidated search document (was experience_gene_search_documents.document) */
    document: text('document').notNull().default(''),
    labels: text('labels').array().notNull().default([]),
    status: text('status').notNull().default('pending').$type<GeneIndexStatus>(),
    lastError: text('last_error'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_experience_gene_embeddings_content_hash').on(table.contentHash),
    check(
      'ck_experience_gene_embeddings_status',
      sql`${table.status} IN ('pending', 'ready', 'failed')`,
    ),
  ],
);


