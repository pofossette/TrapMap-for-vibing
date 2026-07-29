import { z } from 'zod';

import {
  artifactFilePayloadRecordSchema,
  CandidateSubmissionSchema,
  conflictRelationSchema,
  DuplicateCaseSchema,
  EntityLineageSchema,
  permissionSchema,
  roleTemplateSchema,
} from '@trapmap/contracts';

const nullableString = z.string().nullable();
const timestamp = z.string().datetime({ offset: true });
const unknownRecord = z.record(z.string(), z.unknown());

const userRecordSchema = z
  .object({
    id: z.string().min(1),
    handle: z.string().min(1),
    notes: nullableString,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .passthrough();

const teamRecordSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    slug: z.string().min(1),
    description: nullableString,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .passthrough();

const membershipRecordSchema = z
  .object({
    id: z.string().min(1),
    userId: z.string().min(1),
    teamId: z.string().min(1),
    roleTemplate: roleTemplateSchema,
    securityLevel: z.number().int(),
    permissions: z.array(permissionSchema),
    notes: nullableString,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .passthrough();

const accessKeyRecordSchema = z
  .object({
    id: z.string().min(1),
    memberId: z.string().min(1),
    tokenHash: z.string().min(1),
    tokenPreview: z.string().min(1),
    issuedByUserId: z.string().min(1),
    teamId: z.string().min(1),
    level: z.number().int(),
    notes: nullableString,
    revokedAt: nullableString,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .passthrough();

const sessionRecordSchema = z
  .object({
    id: z.string().min(1),
    subjectType: z.enum(['user', 'system-admin']),
    userId: nullableString,
    activeTeamId: nullableString,
    tokenHash: z.string().min(1),
    expiresAt: nullableString,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .passthrough();

const auditEventRecordSchema = z
  .object({
    id: z.string().min(1),
    teamId: nullableString,
    actorId: z.string().min(1),
    action: z.string().min(1),
    entityId: z.string().min(1),
    payload: unknownRecord,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .passthrough();

const knowledgeRecordSchema = z
  .object({
    id: z.string().min(1),
    teamId: nullableString,
    scope: z.enum(['global', 'project']),
    labels: z.array(z.string()),
    shortcut: z.string().min(1),
    detail: z.string().min(1),
    requiredLevel: z.number().int(),
    lifecycleState: z.string().min(1),
    ownerUserId: z.string().min(1),
    latestRevision: unknownRecord,
    history: z.array(unknownRecord),
    metadata: unknownRecord,
    latestSubmissionId: nullableString,
    submissionHistory: z.array(unknownRecord),
    agentReview: unknownRecord.nullable(),
    reviewHistory: z.array(unknownRecord),
    reviewNotes: z.array(unknownRecord),
    lifecycleHistory: z.array(unknownRecord),
    embeddingCache: unknownRecord.nullable(),
    indexState: unknownRecord.nullable(),
    boundary: unknownRecord.nullable(),
    decayMeta: unknownRecord.nullable(),
    evidenceMeta: unknownRecord.nullable(),
    maintenanceMeta: unknownRecord.nullable(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .passthrough();

const skillArtifactRecordSchema = z
  .object({
    id: z.string().min(1),
    teamId: nullableString,
    scope: z.enum(['global', 'project']),
    labels: z.array(z.string()),
    title: z.string().min(1),
    slug: z.string().min(1),
    requiredLevel: z.number().int(),
    lifecycleState: z.string().min(1),
    ownerUserId: z.string().min(1),
    latestRevision: unknownRecord,
    history: z.array(unknownRecord),
    metadata: unknownRecord,
    agentReview: unknownRecord.nullable(),
    reviewHistory: z.array(unknownRecord),
    reviewNotes: z.array(unknownRecord),
    lifecycleHistory: z.array(unknownRecord),
    boundary: unknownRecord.nullable(),
    decayMeta: unknownRecord.nullable(),
    evidenceMeta: unknownRecord.nullable(),
    maintenanceMeta: unknownRecord.nullable(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .passthrough();

const candidateSubmissionRecordSchema = CandidateSubmissionSchema.passthrough();
const duplicateCaseRecordSchema = DuplicateCaseSchema.passthrough();
const entityLineageRecordSchema = EntityLineageSchema.passthrough();

const graphIndexDocumentRecordSchema = z
  .object({
    id: z.string().min(1),
    sourceType: z.enum(['trap', 'skill']),
    sourceId: z.string().min(1),
    revision: z.number().int().min(1),
    contentHash: z.string().min(1),
    teamId: nullableString,
    scope: z.enum(['global', 'project']),
    requiredLevel: z.number().int(),
    nodes: z.array(unknownRecord),
    edges: z.array(unknownRecord),
    evidence: z.string(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .passthrough();

const conflictRecordSchema = conflictRelationSchema.passthrough();

const feedbackQueueRecordSchema = z
  .object({
    id: z.string().min(1),
    entryId: z.string().min(1),
    entryType: z.enum(['trap', 'skill']),
    problemType: z.string().min(1),
    description: z.string().min(1),
    context: nullableString,
    querySeed: nullableString,
    queryId: nullableString,
    routeFamily: z.enum(['entry', 'capsule', 'graph-plan']).nullable(),
    failureClassification: z.unknown().nullable(),
    expectedCorrection: nullableString,
    selectedResultSnapshot: unknownRecord.nullable(),
    customAnswers: z.array(unknownRecord).nullable(),
    submittedAt: timestamp,
    submittedByUserId: z.string().min(1),
    submittedByHandle: z.string().min(1),
    status: z.enum(['new', 'triaged', 'resolved', 'dismissed']),
    adminNotes: nullableString,
    resolvedAt: nullableString,
    resolvedByUserId: nullableString,
    triggeredTransition: nullableString,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .passthrough();

const legacySnapshotSchema = z
  .object({
    counters: z.record(z.string(), z.number()).default({}),
    users: z.array(userRecordSchema),
    teams: z.array(teamRecordSchema),
    memberships: z.array(membershipRecordSchema),
    accessKeys: z.array(accessKeyRecordSchema),
    sessions: z.array(sessionRecordSchema),
    knowledgeEntries: z.array(knowledgeRecordSchema),
    auditEvents: z.array(auditEventRecordSchema),
    skillArtifacts: z.array(skillArtifactRecordSchema),
    artifactFilePayloads: z.array(artifactFilePayloadRecordSchema),
    candidateSubmissions: z.array(candidateSubmissionRecordSchema),
    duplicateCases: z.array(duplicateCaseRecordSchema),
    entityLineage: z.array(entityLineageRecordSchema),
    graphIndexDocuments: z.array(graphIndexDocumentRecordSchema),
    conflicts: z.array(conflictRecordSchema),
    feedbackQueue: z.array(feedbackQueueRecordSchema),
    promptVersion: z.number().int().nullable().default(null),
    rebuildState: z
      .object({
        targetVersion: z.number().int(),
        completedSourceKeys: z.array(z.string()),
      })
      .nullable()
      .default(null),
  })
  .strict();

type ParsedLegacySnapshot = z.infer<typeof legacySnapshotSchema>;

export interface LegacySnapshotSource {
  query<T extends { data: unknown }>(
    sql: string,
    values: readonly unknown[],
  ): Promise<{ rows: T[] }>;
}

export interface LegacySnapshot {
  identityAudit: Pick<
    ParsedLegacySnapshot,
    'users' | 'teams' | 'memberships' | 'accessKeys' | 'sessions' | 'auditEvents'
  >;
  knowledge: Pick<ParsedLegacySnapshot, 'knowledgeEntries'>;
  artifacts: Pick<ParsedLegacySnapshot, 'skillArtifacts'>;
  artifactFilePayloads: ParsedLegacySnapshot['artifactFilePayloads'];
  candidateIngestion: Pick<
    ParsedLegacySnapshot,
    'candidateSubmissions' | 'duplicateCases' | 'entityLineage'
  >;
  governance: Pick<ParsedLegacySnapshot, 'conflicts' | 'feedbackQueue'>;
}

const requiredBusinessBuckets = [
  'users',
  'teams',
  'memberships',
  'accessKeys',
  'sessions',
  'knowledgeEntries',
  'auditEvents',
  'skillArtifacts',
  'artifactFilePayloads',
  'candidateSubmissions',
  'duplicateCases',
  'entityLineage',
  'graphIndexDocuments',
  'conflicts',
  'feedbackQueue',
] as const;

const knownLegacyBuckets = new Set([
  'counters',
  ...requiredBusinessBuckets,
  'promptVersion',
  'rebuildState',
]);

function parseLegacySnapshot(data: unknown): ParsedLegacySnapshot {
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return legacySnapshotSchema.parse(data);
  }

  const buckets = data as Record<string, unknown>;
  for (const bucket of Object.keys(buckets)) {
    if (!knownLegacyBuckets.has(bucket)) {
      throw new Error(`unknown legacy snapshot bucket: ${bucket}`);
    }
  }
  for (const bucket of requiredBusinessBuckets) {
    if (!Object.hasOwn(buckets, bucket)) {
      throw new Error(`missing required legacy bucket: ${bucket}`);
    }
  }
  return legacySnapshotSchema.parse(buckets);
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}

export function createLegacySnapshotSource(source: LegacySnapshotSource): LegacySnapshotSource {
  return source;
}

export async function loadLegacySnapshot(source: LegacySnapshotSource): Promise<LegacySnapshot> {
  const { rows } = await source.query<{ data: unknown }>(
    'SELECT data FROM store_snapshot WHERE key = $1',
    ['main'],
  );
  if (rows.length !== 1) throw new Error('legacy store_snapshot main row is required');

  const parsed = parseLegacySnapshot(rows[0]!.data);
  return deepFreeze({
    identityAudit: {
      users: parsed.users,
      teams: parsed.teams,
      memberships: parsed.memberships,
      accessKeys: parsed.accessKeys,
      sessions: parsed.sessions,
      auditEvents: parsed.auditEvents,
    },
    knowledge: { knowledgeEntries: parsed.knowledgeEntries },
    artifacts: { skillArtifacts: parsed.skillArtifacts },
    artifactFilePayloads: parsed.artifactFilePayloads,
    candidateIngestion: {
      candidateSubmissions: parsed.candidateSubmissions,
      duplicateCases: parsed.duplicateCases,
      entityLineage: parsed.entityLineage,
    },
    governance: { conflicts: parsed.conflicts, feedbackQueue: parsed.feedbackQueue },
  });
}
