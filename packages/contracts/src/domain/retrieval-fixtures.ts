import type { LifecycleState, Scope } from './common.js';
import { createRetrievalKnowledgeFixtureParts } from './retrieval-projection.js';

const DEFAULT_RETRIEVAL_FIXTURE_NOW = '2026-01-01T00:00:00.000Z';

export function createRetrievalKnowledgeFixture(
  id: string,
  options: {
    now?: string;
    teamId?: string | null;
    scope?: Scope;
    labels?: string[];
    shortcut?: string;
    detail?: string;
    requiredLevel?: number;
    lifecycleState?: LifecycleState;
    ownerUserId?: string;
    submittedByUserId?: string;
  } = {},
) {
  const now = options.now ?? DEFAULT_RETRIEVAL_FIXTURE_NOW;
  const shortcut = options.shortcut ?? `Shortcut ${id}`;
  const detail = options.detail ?? `Detail ${id}`;
  const labels = options.labels ?? ['test'];

  return {
    id,
    teamId: options.teamId ?? null,
    scope: options.scope ?? 'global',
    labels,
    shortcut,
    detail,
    requiredLevel: options.requiredLevel ?? 0,
    lifecycleState: options.lifecycleState ?? 'approved',
    ownerUserId: options.ownerUserId ?? 'user_1',
    ...createRetrievalKnowledgeFixtureParts({
      now,
      shortcut,
      detail,
      labels,
      submittedByUserId: options.submittedByUserId,
    }),
    embeddingCache: null,
    indexState: null,
    boundary: null,
    decayMeta: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    createdAt: now,
    updatedAt: now,
  };
}

export function createRetrievalArtifactFixture(id: string, now = DEFAULT_RETRIEVAL_FIXTURE_NOW) {
  return {
    id,
    slug: `artifact-${id}`,
    labels: ['test'],
    scope: 'global' as const,
    requiredLevel: 0,
    teamId: null,
    lifecycleState: 'approved' as const,
    ownerUserId: 'user1',
    latestRevision: {
      revision: 1,
      sourceHash: 'test-hash',
      submittedAt: now,
      submittedByUserId: 'user1',
      files: [],
      scriptDescriptors: [],
      derived: {
        profile: {
          artifactId: id,
          revision: 1,
          sourceHash: 'test-hash',
          title: `Artifact ${id}`,
          summary: 'Test summary',
          keywords: ['test'],
          referencePaths: [],
          contentHash: 'content-hash',
        },
        capsules: [],
        clientManifest: null,
        sourceHash: 'test-hash',
        derivedAt: now,
      },
    },
    history: [],
    metadata: {
      sourceKind: 'single-skill-md' as const,
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: null,
      latestReviewedAt: null,
      latestDecision: null,
    },
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
    agentReview: null,
    createdAt: now,
  };
}

export function createRetrievalConflictFixture(
  id: string,
  entryIdA: string,
  entryIdB: string,
  detectedAt = DEFAULT_RETRIEVAL_FIXTURE_NOW,
) {
  return {
    id,
    entryIdA,
    entryIdB,
    conflictType: 'alternative' as const,
    context: `Conflict between ${entryIdA} and ${entryIdB}`,
    problemOverlapScore: 0.8,
    solutionDiffScore: 0.6,
    detectedAt,
  };
}

export function createRetrievalMockRepos<RepositoryOverrides extends object = object>(
  overrides = {} as RepositoryOverrides,
) {
  const listByFilter = async () => [];
  const listAll = async () => [];

  const repositories = {
    knowledge: { listByFilter },
    artifact: { listByFilter },
    session: {},
    accessKey: {},
    team: {},
    membership: {},
    user: {},
    candidate: {},
    conflict: { listAll },
    usageAnalytics: {},
    feedback: { listByFilter },
    audit: {},
    duplicate: {},
    lineage: {},
    graphIndex: {},
    ...overrides,
  };
  const governanceRetrievalProjection =
    'governanceRetrievalProjection' in repositories && repositories.governanceRetrievalProjection
      ? repositories.governanceRetrievalProjection
      : {
          listFeedback: () => repositories.feedback.listByFilter({}),
          listConflicts: () => repositories.conflict.listAll(),
        };

  return { ...repositories, governanceRetrievalProjection };
}
