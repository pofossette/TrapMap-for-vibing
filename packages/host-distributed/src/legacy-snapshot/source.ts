import { z } from 'zod';

import {
  artifactFilePayloadRecordSchema,
  boundarySchema,
  CandidateSubmissionSchema,
  conflictRelationSchema,
  decayMetaSchema,
  DuplicateCaseSchema,
  EntityLineageSchema,
  evidenceMetaSchema,
  feedbackCustomAnswerSchema,
  feedbackFailureClassificationSchema,
  feedbackProblemTypeSchema,
  feedbackRemediationStateSchema,
  feedbackSelectedResultSnapshotSchema,
  feedbackStatusSchema,
  lifecycleStateSchema,
  permissionSchema,
  roleTemplateSchema,
  skillArtifactDerivedSchema,
  skillArtifactFileSchema,
  skillArtifactMetadataSchema,
  skillScriptDescriptorSchema,
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

const legacyReviewNoteSchema = z
  .object({
    id: z.string().min(1),
    createdAt: timestamp,
    authorType: z.enum(['submitter', 'agent', 'reviewer', 'system']),
    authorUserId: nullableString,
    message: z.string().min(1).max(2000),
  })
  .strict();

const legacyAgentReviewSchema = z
  .object({
    status: z.enum(['agent-pass', 'agent-rejected']),
    duplicateRisk: z.enum(['low', 'medium', 'high']),
    correctnessRisk: z.enum(['low', 'medium', 'high']),
    completenessRisk: z.enum(['low', 'medium', 'high']),
    checkedAt: timestamp,
    notes: z.array(z.string()),
  })
  .strict();

const legacyReviewDecisionSchema = z
  .object({
    decidedAt: timestamp,
    decidedByUserId: z.string().min(1),
    decision: z.enum(['approve', 'reject']),
    notes: z.string().min(1).max(2000),
  })
  .strict();

const legacyKnowledgeRevisionSchema = z
  .object({
    revision: z.number().int().min(1),
    submittedAt: timestamp,
    submittedByUserId: z.string().min(1),
    shortcut: z.string().min(1).max(280),
    detail: z.string().min(1).max(10000),
    labels: z.array(z.string().min(1)).min(1),
    reviewNotes: z.array(legacyReviewNoteSchema),
  })
  .strict();

const legacyKnowledgeSubmissionSchema = z
  .object({
    id: z.string().min(1),
    revision: z.number().int().min(1),
    submittedAt: timestamp,
    submittedByUserId: z.string().min(1),
    lifecycleState: lifecycleStateSchema,
    resubmissionOf: nullableString,
    agentReview: legacyAgentReviewSchema.nullable(),
    reviewerDecision: legacyReviewDecisionSchema.nullable(),
    reviewNotes: z.array(legacyReviewNoteSchema),
  })
  .strict();

const legacyLifecycleEventSchema = z
  .object({
    id: z.string().min(1),
    type: z.enum([
      'submitted',
      'resubmitted',
      'agent-reviewed',
      'reviewer-approved',
      'reviewer-rejected',
      'updated',
      'deactivated',
    ]),
    createdAt: timestamp,
    actorUserId: nullableString,
    submissionId: nullableString,
    revision: z.number().int().min(1).nullable(),
    state: lifecycleStateSchema,
    note: nullableString,
  })
  .strict();

const legacyKnowledgeMetadataSchema = z
  .object({
    scopeLabel: z.enum(['global-constraint', 'project-knowledge']),
    submissionCount: z.number().int().min(0),
    resubmissionCount: z.number().int().min(0),
    revisionCount: z.number().int().min(1),
    latestSubmissionId: nullableString,
    latestSubmittedAt: nullableString,
    latestReviewedAt: nullableString,
    latestDecision: z.enum(['approve', 'reject']).nullable(),
  })
  .strict()
  .refine((data) => data.submissionCount >= data.resubmissionCount, {
    message: 'submissionCount must be >= resubmissionCount',
  });

const legacyEmbeddingCacheSchema = z
  .object({
    textHash: z.string().min(1),
    vector: z.array(z.number()),
    createdAt: timestamp,
    revision: z.number().int(),
  })
  .strict();

const legacyAdapterSyncStateSchema = z
  .object({
    status: z.enum(['pending', 'synced', 'failed']),
    revision: z.number().int(),
    contentHash: z.string().min(1),
    lastSyncedAt: nullableString,
    lastError: nullableString,
  })
  .strict();

const legacyIndexStateSchema = z
  .object({
    contentHash: z.string().min(1),
    normalizedAt: timestamp,
    adapters: z.record(z.string(), legacyAdapterSyncStateSchema),
    vector: legacyAdapterSyncStateSchema.optional(),
    keyword: legacyAdapterSyncStateSchema.optional(),
    graph: legacyAdapterSyncStateSchema.optional(),
  })
  .strict();

const legacyMaintenanceMetaSchema = z
  .object({
    maintainerUserId: nullableString,
    maintainerHandle: nullableString,
    maintainerLevel: z.number().int().nullable(),
    reviewBy: nullableString,
  })
  .strict();

const legacyKnowledgeRecordSchema = z
  .object({
    id: z.string().min(1),
    teamId: nullableString,
    scope: z.enum(['global', 'project']),
    labels: z.array(z.string()),
    shortcut: z.string().min(1),
    detail: z.string().min(1),
    requiredLevel: z.number().int(),
    lifecycleState: lifecycleStateSchema,
    ownerUserId: z.string().min(1),
    latestRevision: legacyKnowledgeRevisionSchema,
    history: z.array(legacyKnowledgeRevisionSchema),
    metadata: legacyKnowledgeMetadataSchema,
    latestSubmissionId: nullableString,
    submissionHistory: z.array(legacyKnowledgeSubmissionSchema),
    agentReview: legacyAgentReviewSchema.nullable(),
    reviewHistory: z.array(legacyReviewDecisionSchema),
    reviewNotes: z.array(legacyReviewNoteSchema),
    lifecycleHistory: z.array(legacyLifecycleEventSchema),
    embeddingCache: legacyEmbeddingCacheSchema.nullable(),
    indexState: legacyIndexStateSchema.nullable(),
    boundary: boundarySchema.nullable(),
    decayMeta: decayMetaSchema.nullable(),
    evidenceMeta: evidenceMetaSchema.nullable(),
    maintenanceMeta: legacyMaintenanceMetaSchema.nullable(),
    remediation: feedbackRemediationStateSchema.nullable().optional(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

const legacyArtifactRevisionSchema = z
  .object({
    revision: z.number().int().min(1),
    sourceHash: z.string().min(1),
    files: z.array(skillArtifactFileSchema),
    submittedAt: timestamp,
    submittedByUserId: z.string().min(1),
    scriptDescriptors: z.array(skillScriptDescriptorSchema),
    derived: skillArtifactDerivedSchema.nullable(),
  })
  .strict();

const skillArtifactRecordSchema = z
  .object({
    id: z.string().min(1),
    teamId: nullableString,
    scope: z.enum(['global', 'project']),
    labels: z.array(z.string()),
    title: z.string().min(1),
    slug: z.string().min(1),
    requiredLevel: z.number().int(),
    lifecycleState: lifecycleStateSchema,
    ownerUserId: z.string().min(1),
    latestRevision: legacyArtifactRevisionSchema,
    history: z.array(legacyArtifactRevisionSchema),
    metadata: skillArtifactMetadataSchema,
    agentReview: legacyAgentReviewSchema.nullable(),
    reviewHistory: z.array(legacyReviewDecisionSchema),
    reviewNotes: z.array(legacyReviewNoteSchema),
    lifecycleHistory: z.array(legacyLifecycleEventSchema),
    boundary: boundarySchema.nullable(),
    decayMeta: decayMetaSchema.nullable(),
    evidenceMeta: evidenceMetaSchema.nullable(),
    maintenanceMeta: legacyMaintenanceMetaSchema.nullable(),
    remediation: feedbackRemediationStateSchema.nullable().optional(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

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
    problemType: feedbackProblemTypeSchema,
    description: z.string().min(10).max(2000),
    context: nullableString,
    querySeed: nullableString,
    queryId: nullableString,
    routeFamily: z.enum(['entry', 'capsule', 'graph-plan']).nullable(),
    failureClassification: feedbackFailureClassificationSchema.nullable(),
    expectedCorrection: nullableString,
    selectedResultSnapshot: feedbackSelectedResultSnapshotSchema.nullable(),
    customAnswers: z.array(feedbackCustomAnswerSchema).nullable(),
    submittedAt: timestamp,
    submittedByUserId: z.string().min(1),
    submittedByHandle: z.string().min(1),
    status: feedbackStatusSchema,
    adminNotes: nullableString,
    resolvedAt: nullableString,
    resolvedByUserId: nullableString,
    triggeredTransition: nullableString,
    remediationStatus: z
      .enum(['pending-human-review', 'in-remediation', 'ready-to-reindex'])
      .nullable()
      .optional(),
    remediationOpenedAt: nullableString.optional(),
    remediationOpenedByUserId: nullableString.optional(),
    remediationResolvedAt: nullableString.optional(),
    remediationResolvedByUserId: nullableString.optional(),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

const legacySnapshotSchema = z
  .object({
    counters: z.record(z.string(), z.number()).default({}),
    users: z.array(userRecordSchema),
    teams: z.array(teamRecordSchema),
    memberships: z.array(membershipRecordSchema),
    accessKeys: z.array(accessKeyRecordSchema),
    sessions: z.array(sessionRecordSchema),
    knowledgeEntries: z.array(legacyKnowledgeRecordSchema),
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
