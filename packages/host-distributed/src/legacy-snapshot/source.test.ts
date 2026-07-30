import { describe, expect, it, vi } from 'vitest';

import {
  createLegacySnapshotSource,
  loadLegacySnapshot,
  type LegacySnapshotSource,
} from './source.js';

const timestamp = '2026-07-29T00:00:00.000Z';
const sha256 = 'a'.repeat(64);

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
  teamId: null,
  scope: 'global',
  labels: ['legacy'],
  shortcut: 'legacy-knowledge',
  detail: 'A valid legacy knowledge entry.',
  requiredLevel: 0,
  lifecycleState: 'approved',
  ownerUserId: 'user_1',
  latestRevision: knowledgeRevision,
  history: [knowledgeRevision],
  metadata: {
    scopeLabel: 'global-constraint',
    submissionCount: 0,
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
  createdAt: timestamp,
  updatedAt: timestamp,
};

const skillArtifact = {
  id: 'artifact_1',
  teamId: null,
  scope: 'global',
  labels: ['legacy'],
  title: 'Legacy artifact',
  slug: 'legacy-artifact',
  requiredLevel: 0,
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
        sizeBytes: 1,
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
    submissionCount: 0,
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
  lifecycleHistory: [],
  boundary: null,
  decayMeta: null,
  evidenceMeta: null,
  maintenanceMeta: null,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const feedbackRecord = {
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
  createdAt: timestamp,
  updatedAt: timestamp,
};

const completeSnapshot = {
  users: [
    {
      id: 'user_1',
      handle: 'snapshot-user',
      notes: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ],
  teams: [],
  memberships: [],
  accessKeys: [],
  sessions: [],
  knowledgeEntries: [],
  auditEvents: [],
  skillArtifacts: [],
  artifactFilePayloads: [],
  candidateSubmissions: [
    {
      id: 'candidate_1',
      sourceType: 'trap',
      submittedBy: 'user_1',
      teamId: null,
      status: 'received',
      originalPayload: {
        trap: {
          scope: 'global',
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
    },
  ],
  duplicateCases: [],
  entityLineage: [],
  graphIndexDocuments: [],
  conflicts: [],
  feedbackQueue: [],
};

function sourceReturning(data: unknown): LegacySnapshotSource {
  return createLegacySnapshotSource({
    query: vi.fn().mockResolvedValue({ rows: [{ data }] }),
  });
}

describe('loadLegacySnapshot', () => {
  it('loads the singleton row and exposes typed owner bucket views', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ data: completeSnapshot }] });

    await expect(loadLegacySnapshot(createLegacySnapshotSource({ query }))).resolves.toMatchObject({
      identityAudit: { users: [expect.objectContaining({ id: 'user_1' })] },
      candidateIngestion: { candidateSubmissions: [expect.any(Object)] },
    });
    expect(query).toHaveBeenCalledWith('SELECT data FROM store_snapshot WHERE key = $1', ['main']);
  });

  it('requires exactly one store_snapshot main row', async () => {
    await expect(
      loadLegacySnapshot(
        createLegacySnapshotSource({ query: vi.fn().mockResolvedValue({ rows: [] }) }),
      ),
    ).rejects.toThrow('legacy store_snapshot main row is required');

    await expect(
      loadLegacySnapshot(
        createLegacySnapshotSource({
          query: vi
            .fn()
            .mockResolvedValue({ rows: [{ data: completeSnapshot }, { data: completeSnapshot }] }),
        }),
      ),
    ).rejects.toThrow('legacy store_snapshot main row is required');
  });

  it.each([
    [{ users: [] }, 'missing required legacy bucket: teams'],
    [{ ...completeSnapshot, unknownBucket: [] }, 'unknown legacy snapshot bucket: unknownBucket'],
  ])('rejects malformed legacy source data', async (data, message) => {
    await expect(loadLegacySnapshot(sourceReturning(data))).rejects.toThrow(message);
  });

  it('rejects malformed records before exposing owner views', async () => {
    const { handle: _handle, ...userWithoutHandle } = completeSnapshot.users[0]!;

    await expect(
      loadLegacySnapshot(sourceReturning({ ...completeSnapshot, users: [userWithoutHandle] })),
    ).rejects.toThrow('handle');
  });

  it.each([
    [
      {
        ...completeSnapshot,
        memberships: [
          {
            id: 'membership_1',
            userId: 'user_1',
            teamId: 'team_1',
            roleTemplate: 'owner',
            securityLevel: 0,
            permissions: [],
            notes: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      },
      'roleTemplate',
    ],
    [
      {
        ...completeSnapshot,
        candidateSubmissions: [{ ...completeSnapshot.candidateSubmissions[0], status: 'bogus' }],
      },
      'status',
    ],
  ])('rejects invalid structured record values', async (data, message) => {
    await expect(loadLegacySnapshot(sourceReturning(data))).rejects.toThrow(message);
  });

  it.each([
    [
      { ...completeSnapshot, knowledgeEntries: [{ ...knowledgeEntry, lifecycleState: 'bogus' }] },
      'lifecycleState',
    ],
    [
      {
        ...completeSnapshot,
        knowledgeEntries: [{ ...knowledgeEntry, latestRevision: { revision: 'one' } }],
      },
      'latestRevision',
    ],
    [
      {
        ...completeSnapshot,
        knowledgeEntries: [{ ...knowledgeEntry, metadata: { revisionCount: 'one' } }],
      },
      'metadata',
    ],
    [
      {
        ...completeSnapshot,
        knowledgeEntries: [
          {
            ...knowledgeEntry,
            reviewHistory: [
              { decidedAt: timestamp, decidedByUserId: 'user_1', decision: 'bogus', notes: 'No' },
            ],
          },
        ],
      },
      'reviewHistory',
    ],
    [
      {
        ...completeSnapshot,
        knowledgeEntries: [
          {
            ...knowledgeEntry,
            lifecycleHistory: [
              {
                id: 'event_1',
                type: 'submitted',
                createdAt: timestamp,
                actorUserId: 'user_1',
                submissionId: null,
                revision: 1,
                state: 'bogus',
                note: null,
              },
            ],
          },
        ],
      },
      'lifecycleHistory',
    ],
    [
      { ...completeSnapshot, skillArtifacts: [{ ...skillArtifact, lifecycleState: 'bogus' }] },
      'lifecycleState',
    ],
    [
      {
        ...completeSnapshot,
        skillArtifacts: [{ ...skillArtifact, latestRevision: { revision: 'one' } }],
      },
      'latestRevision',
    ],
    [
      {
        ...completeSnapshot,
        skillArtifacts: [{ ...skillArtifact, metadata: { sourceKind: 'bogus' } }],
      },
      'metadata',
    ],
    [
      {
        ...completeSnapshot,
        skillArtifacts: [
          {
            ...skillArtifact,
            reviewHistory: [
              { decidedAt: timestamp, decidedByUserId: 'user_1', decision: 'bogus', notes: 'No' },
            ],
          },
        ],
      },
      'reviewHistory',
    ],
    [
      {
        ...completeSnapshot,
        skillArtifacts: [
          {
            ...skillArtifact,
            lifecycleHistory: [
              {
                id: 'event_1',
                type: 'submitted',
                createdAt: timestamp,
                actorUserId: 'user_1',
                submissionId: null,
                revision: 1,
                state: 'bogus',
                note: null,
              },
            ],
          },
        ],
      },
      'lifecycleHistory',
    ],
    [
      { ...completeSnapshot, feedbackQueue: [{ ...feedbackRecord, problemType: 'bogus' }] },
      'problemType',
    ],
    [
      { ...completeSnapshot, feedbackQueue: [{ ...feedbackRecord, failureClassification: {} }] },
      'failureClassification',
    ],
    [
      {
        ...completeSnapshot,
        feedbackQueue: [{ ...feedbackRecord, customAnswers: [{ prompt: 1, answer: 'valid' }] }],
      },
      'customAnswers',
    ],
  ])(
    'rejects malformed legacy knowledge, artifact, and governance records',
    async (data, message) => {
      await expect(loadLegacySnapshot(sourceReturning(data))).rejects.toThrow(message);
    },
  );

  it('accepts only the documented technical bucket defaults', async () => {
    await expect(loadLegacySnapshot(sourceReturning(completeSnapshot))).resolves.toMatchObject({
      identityAudit: { users: [expect.objectContaining({ id: 'user_1' })] },
    });
  });

  it.each([
    [{ ...completeSnapshot, counters: [] }, 'counters'],
    [{ ...completeSnapshot, promptVersion: 'one' }, 'promptVersion'],
    [{ ...completeSnapshot, rebuildState: {} }, 'rebuildState'],
  ])('rejects malformed technical state', async (data, message) => {
    await expect(loadLegacySnapshot(sourceReturning(data))).rejects.toThrow(message);
  });

  it('returns immutable owner bucket views', async () => {
    const snapshot = await loadLegacySnapshot(sourceReturning(completeSnapshot));

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.identityAudit)).toBe(true);
    expect(Object.isFrozen(snapshot.identityAudit.users)).toBe(true);
  });
});
