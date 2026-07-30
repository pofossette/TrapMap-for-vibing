import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg, { type Pool } from 'pg';

import { createLegacySnapshotBackfillOwners } from './owners.js';
import { runLegacySnapshotBackfill } from './coordinator.js';
import { createLegacySnapshotSource, type LegacySnapshotSource } from './source.js';

const timestamp = '2026-07-29T00:00:00.000Z';
const sha256 = 'a'.repeat(64);

const user = {
  id: 'user_1',
  handle: 'snapshot-user',
  notes: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const team = {
  id: 'team_1',
  name: 'Snapshot Team',
  slug: 'snapshot-team',
  description: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const membership = {
  id: 'membership_1',
  userId: 'user_1',
  teamId: 'team_1',
  roleTemplate: 'admin',
  securityLevel: 5,
  permissions: ['session:read'],
  notes: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const accessKey = {
  id: 'access_key_1',
  memberId: 'membership_1',
  tokenHash: sha256,
  tokenPreview: 'preview',
  issuedByUserId: 'user_1',
  teamId: 'team_1',
  level: 5,
  notes: null,
  revokedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const session = {
  id: 'session_1',
  subjectType: 'user' as const,
  userId: 'user_1',
  activeTeamId: 'team_1',
  tokenHash: sha256,
  expiresAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const auditEvent = {
  id: 'audit_1',
  teamId: 'team_1',
  actorId: 'user_1',
  action: 'team:create',
  entityId: 'team_1',
  payload: { source: 'snapshot' },
  createdAt: timestamp,
  updatedAt: timestamp,
};

const knowledgeRevision = {
  revision: 1,
  submittedAt: timestamp,
  submittedByUserId: 'user_1',
  shortcut: 'legacy-knowledge',
  detail: 'A valid legacy knowledge revision.',
  labels: ['legacy'],
  reviewNotes: [],
};

const knowledgeEntry = {
  id: 'knowledge_1',
  teamId: 'team_1',
  scope: 'project',
  labels: ['legacy'],
  shortcut: 'legacy-knowledge',
  detail: 'A valid legacy knowledge entry.',
  requiredLevel: 2,
  lifecycleState: 'approved',
  ownerUserId: 'user_1',
  latestRevision: knowledgeRevision,
  history: [knowledgeRevision],
  metadata: {
    scopeLabel: 'project-knowledge',
    submissionCount: 1,
    resubmissionCount: 0,
    revisionCount: 1,
    latestSubmissionId: null,
    latestSubmittedAt: null,
    latestReviewedAt: null,
    latestDecision: null,
  },
  latestSubmissionId: null,
  submissionHistory: [],
  agentReview: null,
  reviewHistory: [],
  reviewNotes: [],
  lifecycleHistory: [],
  embeddingCache: null,
  indexState: null,
  boundary: null,
  decayMeta: null,
  evidenceMeta: null,
  maintenanceMeta: null,
  remediation: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const skillArtifact = {
  id: 'artifact_1',
  teamId: 'team_1',
  scope: 'project',
  labels: ['legacy'],
  title: 'Legacy skill artifact',
  slug: 'legacy-skill-artifact',
  requiredLevel: 2,
  lifecycleState: 'approved',
  ownerUserId: 'user_1',
  latestRevision: {
    revision: 1,
    sourceHash: sha256,
    files: [
      {
        path: 'SKILL.md',
        kind: 'skill-markdown',
        sha256,
        sizeBytes: 24,
        mediaType: 'text/markdown',
        source: 'SKILL.md',
        includeInDerivation: true,
        activationOnly: false,
      },
    ],
    submittedAt: timestamp,
    submittedByUserId: 'user_1',
    scriptDescriptors: [],
    derived: null,
  },
  history: [],
  metadata: {
    sourceKind: 'skill-directory',
    submissionCount: 1,
    resubmissionCount: 0,
    revisionCount: 1,
    latestSubmissionId: null,
    latestSubmittedAt: null,
    latestReviewedAt: null,
    latestDecision: null,
  },
  agentReview: null,
  reviewHistory: [],
  reviewNotes: [],
  lifecycleHistory: [
    {
      id: 'artifact_event_1',
      type: 'submitted',
      createdAt: timestamp,
      actorUserId: 'user_1',
      submissionId: null,
      revision: 1,
      state: 'submitted',
      note: 'Legacy artifact submitted',
    },
  ],
  boundary: null,
  decayMeta: null,
  evidenceMeta: null,
  maintenanceMeta: null,
  remediation: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const artifactFilePayload = {
  artifactId: 'artifact_1',
  revision: 1,
  path: 'SKILL.md',
  sha256,
  sizeBytes: 24,
  mediaType: 'text/markdown',
  content: '# Legacy skill\n\nUse safely.',
  storedAt: timestamp,
};

const candidateSubmission = {
  id: 'candidate_1',
  sourceType: 'trap',
  submittedBy: 'user_1',
  teamId: 'team_1',
  status: 'received',
  originalPayload: {
    trap: {
      scope: 'project',
      labels: ['legacy'],
      shortcut: 'legacy-snapshot',
      detail: 'A complete legacy candidate record.',
    },
  },
  analysisSnapshot: null,
  duplicateCase: null,
  receivedAt: timestamp,
  queuedAt: null,
  analyzingAt: null,
  completedAt: null,
  lastError: null,
  retryCount: 0,
  manualResult: null,
};

const duplicateCase = {
  id: 'dup_case_1',
  candidateId: 'candidate_1',
  detectedAt: timestamp,
  detectionVersion: '1.0.0',
  matches: [
    {
      entityType: 'trap',
      entityId: 'knowledge_1',
      entityTitle: 'Legacy knowledge',
      similarityScore: 0.95,
      matchType: 'semantic-similar',
      overlapDetails: {
        sharedKeywords: ['legacy'],
        sharedTokens: ['legacy', 'knowledge'],
        textOverlapPercent: 42,
      },
    },
  ],
  highestSimilarity: 0.95,
  hasExactDuplicate: false,
  duplicateType: 'semantic',
};

const entityLineage = {
  id: 'lineage_1',
  candidateId: 'candidate_1',
  relationshipType: 'published_as',
  sourceType: 'candidate',
  sourceId: 'candidate_1',
  targetType: 'trap',
  targetId: 'knowledge_1',
  createdAt: timestamp,
  notes: 'Snapshot-seeded lineage',
};

const conflict = {
  id: 'conflict_1',
  entryIdA: 'artifact_1',
  entryIdB: 'knowledge_1',
  conflictType: 'alternative',
  context: 'Snapshot-seeded conflict relation',
  problemOverlapScore: 0.5,
  solutionDiffScore: 0.5,
  detectedAt: timestamp,
};

const feedbackQueueRecord = {
  id: 'feedback_1',
  entryId: 'knowledge_1',
  entryType: 'trap',
  problemType: 'incorrect',
  description: 'This legacy feedback record is valid.',
  context: null,
  querySeed: null,
  queryId: null,
  routeFamily: null,
  failureClassification: null,
  expectedCorrection: null,
  selectedResultSnapshot: null,
  customAnswers: null,
  submittedAt: timestamp,
  submittedByUserId: 'user_1',
  submittedByHandle: 'snapshot-user',
  status: 'new',
  adminNotes: null,
  resolvedAt: null,
  resolvedByUserId: null,
  triggeredTransition: null,
  remediationStatus: null,
  remediationOpenedAt: null,
  remediationOpenedByUserId: null,
  remediationResolvedAt: null,
  remediationResolvedByUserId: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const completeSnapshot = {
  counters: {},
  users: [user],
  teams: [team],
  memberships: [membership],
  accessKeys: [accessKey],
  sessions: [session],
  knowledgeEntries: [knowledgeEntry],
  auditEvents: [auditEvent],
  skillArtifacts: [skillArtifact],
  artifactFilePayloads: [artifactFilePayload],
  candidateSubmissions: [candidateSubmission],
  duplicateCases: [duplicateCase],
  entityLineage: [entityLineage],
  graphIndexDocuments: [
    {
      id: 'graphdoc_legacy_should_not_be_copied',
      sourceType: 'trap',
      sourceId: 'knowledge_1',
      revision: 99,
      contentHash: 'b'.repeat(64),
      teamId: 'team_1',
      scope: 'project',
      requiredLevel: 2,
      nodes: [{ id: 'trap:knowledge_1', kind: 'trap', label: 'should not be copied' }],
      edges: [],
      evidence: 'legacy snapshot graph document that must not be copied',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  conflicts: [conflict],
  feedbackQueue: [feedbackQueueRecord],
  promptVersion: null,
  rebuildState: null,
};

function createPostgresLegacySource(pool: Pool): LegacySnapshotSource {
  return createLegacySnapshotSource({
    query: async (sql, values) =>
      pool.query(sql, values as never[]) as { rows: { data: unknown }[] },
  });
}

function createPostgresBackfillDeps(pool: Pool) {
  return {
    source: createPostgresLegacySource(pool),
    owners: createLegacySnapshotBackfillOwners(pool),
  };
}

async function seedStoreSnapshot(pool: Pool, snapshot: unknown): Promise<void> {
  await pool.query('DELETE FROM store_snapshot');
  await pool.query('INSERT INTO store_snapshot (key, data) VALUES ($1, $2)', ['main', snapshot]);
}

async function truncateOwnerTables(pool: Pool): Promise<void> {
  await pool.query(`TRUNCATE TABLE
    artifact_lifecycle_events, artifact_revisions, skill_artifact_files, skill_artifacts,
    knowledge_review_decisions, knowledge_submissions, knowledge_revisions, knowledge_labels, knowledge_entries,
    lifecycle_events, graph_index_documents,
    candidate_manual_results, candidate_resolution_outcomes, candidate_duplicate_matches,
    candidate_duplicate_cases, candidate_analyses, candidates,
    entity_lineage, conflict_relations,
    feedback_records, feedback_custom_answers,
    audit_events, access_keys, sessions, memberships, teams, users
    CASCADE`);
}

const databaseUrl = process.env.TRAPMAP_DATABASE_URL ?? process.env.DATABASE_URL;
const skip = !databaseUrl;
const describeOrSkip = skip ? describe.skipIf(true) : describe;

describeOrSkip('legacy snapshot backfill PostgreSQL integration', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: databaseUrl });
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  it('migrates every legacy bucket and makes a second run a verified no-op', async () => {
    await truncateOwnerTables(pool);
    await seedStoreSnapshot(pool, completeSnapshot);

    const first = await runLegacySnapshotBackfill(createPostgresBackfillDeps(pool));

    expect(first.succeeded).toBe(true);
    expect(first.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: 'identity/audit',
          bucket: 'users',
          sourceCount: 1,
          destinationCount: 1,
          inserted: 1,
          skipped: 0,
          verified: true,
        }),
        expect.objectContaining({
          owner: 'identity/audit',
          bucket: 'teams',
          sourceCount: 1,
          destinationCount: 1,
          verified: true,
        }),
        expect.objectContaining({
          owner: 'identity/audit',
          bucket: 'memberships',
          sourceCount: 1,
          destinationCount: 1,
          verified: true,
        }),
        expect.objectContaining({
          owner: 'identity/audit',
          bucket: 'accessKeys',
          sourceCount: 1,
          destinationCount: 1,
          verified: true,
        }),
        expect.objectContaining({
          owner: 'identity/audit',
          bucket: 'sessions',
          sourceCount: 1,
          destinationCount: 1,
          verified: true,
        }),
        expect.objectContaining({
          owner: 'identity/audit',
          bucket: 'auditEvents',
          sourceCount: 1,
          destinationCount: 1,
          verified: true,
        }),
        expect.objectContaining({
          owner: 'knowledge',
          bucket: 'knowledgeEntries',
          sourceCount: 1,
          destinationCount: 1,
          inserted: 1,
          verified: true,
        }),
        expect.objectContaining({
          owner: 'knowledge',
          bucket: 'skillArtifacts',
          sourceCount: 1,
          destinationCount: 1,
          inserted: 1,
          verified: true,
        }),
        expect.objectContaining({
          owner: 'knowledge',
          bucket: 'artifactFilePayloads',
          sourceCount: 1,
          destinationCount: 1,
          inserted: 1,
          verified: true,
        }),
        expect.objectContaining({
          owner: 'candidate/duplicate/lineage',
          bucket: 'candidateSubmissions',
          sourceCount: 1,
          destinationCount: 1,
          verified: true,
        }),
        expect.objectContaining({
          owner: 'candidate/duplicate/lineage',
          bucket: 'duplicateCases',
          sourceCount: 1,
          destinationCount: 1,
          verified: true,
        }),
        expect.objectContaining({
          owner: 'candidate/duplicate/lineage',
          bucket: 'entityLineage',
          sourceCount: 1,
          destinationCount: 1,
          verified: true,
        }),
        expect.objectContaining({
          owner: 'governance feedback/conflicts',
          bucket: 'governance',
          sourceCount: 2,
          destinationCount: 2,
          inserted: 2,
          verified: true,
        }),
        expect.objectContaining({
          owner: 'knowledge-read graph rebuild',
          bucket: 'graphProjection',
          sourceCount: 2,
          destinationCount: 2,
          verified: true,
        }),
      ]),
    );

    const second = await runLegacySnapshotBackfill(createPostgresBackfillDeps(pool));

    expect(second.succeeded).toBe(true);
    expect(second.evidence.filter((entry) => entry.bucket !== 'graphProjection')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bucket: 'users', inserted: 0, skipped: 1, verified: true }),
        expect.objectContaining({
          bucket: 'knowledgeEntries',
          inserted: 0,
          skipped: 1,
          verified: true,
        }),
        expect.objectContaining({
          bucket: 'skillArtifacts',
          inserted: 0,
          skipped: 1,
          verified: true,
        }),
        expect.objectContaining({
          bucket: 'artifactFilePayloads',
          inserted: 0,
          skipped: 1,
          verified: true,
        }),
        expect.objectContaining({
          bucket: 'candidateSubmissions',
          inserted: 0,
          skipped: 1,
          verified: true,
        }),
        expect.objectContaining({
          bucket: 'duplicateCases',
          inserted: 0,
          skipped: 1,
          verified: true,
        }),
        expect.objectContaining({
          bucket: 'entityLineage',
          inserted: 0,
          skipped: 1,
          verified: true,
        }),
        expect.objectContaining({
          bucket: 'governance',
          inserted: 0,
          skipped: 2,
          verified: true,
        }),
      ]),
    );
    // graph projection is a derived rebuild, so a second run still reports the
    // rebuilt count rather than skipped.
    const graphEvidence = second.evidence.find((entry) => entry.bucket === 'graphProjection');
    expect(graphEvidence).toEqual(
      expect.objectContaining({
        sourceCount: 2,
        destinationCount: 2,
        verified: true,
      }),
    );
  });

  it('rebuilds the graph projection only from authoritative owner tables', async () => {
    await truncateOwnerTables(pool);
    await seedStoreSnapshot(pool, completeSnapshot);

    await runLegacySnapshotBackfill(createPostgresBackfillDeps(pool));

    const { rows } = await pool.query(
      'SELECT id, source_type, source_id, revision_no, evidence FROM graph_index_documents ORDER BY id',
    );
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.id)).toEqual(
      expect.arrayContaining(['graphdoc_trap_knowledge_1_r1', 'graphdoc_skill_artifact_1_r1']),
    );
    // The legacy snapshot's graph document must NOT be copied into the derived table.
    expect(rows.map((row) => row.id)).not.toContain('graphdoc_legacy_should_not_be_copied');
    for (const row of rows) {
      expect(row.evidence).toEqual(expect.stringContaining('derived from authoritative'));
    }
  });

  it('rejects a conflicting destination record without overwrite', async () => {
    await truncateOwnerTables(pool);
    await seedStoreSnapshot(pool, completeSnapshot);
    // Seed a conflicting knowledge record (same ID, different content) so the
    // knowledge owner's exact-match verification will fail.
    const conflicting = {
      ...knowledgeEntry,
      shortcut: 'tampered-knowledge',
      detail: 'A tampered destination record that differs from the snapshot.',
    };
    await pool.query(
      `INSERT INTO knowledge_entries (
         id, team_id, scope, labels, shortcut, detail, required_level, lifecycle_state,
         owner_user_id, boundary, maintenance_meta, embedding_cache, metadata, agent_review,
         index_state, decay_meta, evidence_meta, remediation, created_at, updated_at
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
       )`,
      [
        conflicting.id,
        conflicting.teamId,
        conflicting.scope,
        JSON.stringify(conflicting.labels),
        conflicting.shortcut,
        conflicting.detail,
        conflicting.requiredLevel,
        conflicting.lifecycleState,
        conflicting.ownerUserId,
        JSON.stringify(conflicting.boundary),
        JSON.stringify(conflicting.maintenanceMeta),
        JSON.stringify(conflicting.embeddingCache),
        JSON.stringify({ ...conflicting.metadata, legacySnapshotRecord: conflicting }),
        JSON.stringify(conflicting.agentReview),
        JSON.stringify(conflicting.indexState),
        JSON.stringify(conflicting.decayMeta),
        JSON.stringify(conflicting.evidenceMeta),
        JSON.stringify(conflicting.remediation),
        conflicting.createdAt,
        conflicting.updatedAt,
      ],
    );

    await expect(runLegacySnapshotBackfill(createPostgresBackfillDeps(pool))).rejects.toThrow(
      'legacy snapshot backfill failed for knowledge',
    );

    // The conflicting destination must remain unchanged.
    const { rows } = await pool.query(
      'SELECT shortcut, detail FROM knowledge_entries WHERE id = $1',
      [knowledgeEntry.id],
    );
    expect(rows[0]?.shortcut).toBe('tampered-knowledge');
  });
});
