import type { FeedbackRemediationState } from './feedback.js';

export interface RetrievalProjectionSources<KnowledgeEntry, Artifact, Feedback, Conflict> {
  listKnowledge(): Promise<KnowledgeEntry[]>;
  listArtifacts(): Promise<Artifact[]>;
  listFeedback(): Promise<Feedback[]>;
  listConflicts(entryIds: string[]): Promise<Conflict[]>;
  listRemediation?(entryIds: string[]): Promise<RetrievalRemediationProjection[]>;
}

export interface RetrievalReadModelRepositories<KnowledgeEntry, Artifact, Feedback, Conflict> {
  knowledge: {
    listByFilter(filter: {}): Promise<KnowledgeEntry[]>;
  };
  artifact: {
    listByFilter(filter: {}): Promise<Artifact[]>;
    listForRetrieval?(filter: {}): Promise<Artifact[]>;
  };
}

export interface RetrievalGovernanceProjection<Feedback, Conflict> {
  listFeedback(): Promise<Feedback[]>;
  listConflicts(entryIds: string[]): Promise<Conflict[]>;
  listRemediation?(entryIds: string[]): Promise<RetrievalRemediationProjection[]>;
}

export interface RetrievalRemediationProjection {
  entryId: string;
  remediation: FeedbackRemediationState;
}

export function attachRemediationProjection<Record extends { id: string }>(
  records: Record[],
  projections: readonly RetrievalRemediationProjection[] = [],
): Record[] {
  const remediationByEntryId = new Map(
    projections.map((projection) => [projection.entryId, projection.remediation]),
  );
  return records.map((record) => {
    const remediation = remediationByEntryId.get(record.id);
    return remediation ? ({ ...record, remediation } as Record) : record;
  });
}

export interface RetrievalReadProjection<KnowledgeEntry, Artifact, Conflict> {
  knowledgeEntries: KnowledgeEntry[];
  skillArtifacts: Artifact[];
  conflicts: Conflict[];
}

export interface RetrievalReadModelCache<Model> {
  get(): Model | null;
  set(model: Model): void;
}

export function createRetrievalKnowledgeFixtureParts(options: {
  now: string;
  shortcut: string;
  detail: string;
  submittedByUserId?: string;
  labels?: string[];
}) {
  const { now, shortcut, detail, submittedByUserId = 'user_1', labels = ['test'] } = options;

  return {
    latestRevision: {
      revision: 1,
      submittedAt: now,
      submittedByUserId,
      shortcut,
      detail,
      labels,
      reviewNotes: [],
    },
    history: [],
    metadata: {
      scopeLabel: 'global-constraint' as const,
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
  };
}

export async function buildRetrievalReadProjection<
  KnowledgeEntry,
  Artifact,
  Feedback,
  Conflict,
  ProjectedKnowledgeEntry = KnowledgeEntry,
  ProjectedArtifact = Artifact,
>(
  sources: RetrievalProjectionSources<KnowledgeEntry, Artifact, Feedback, Conflict>,
  normalizeArtifact: (artifact: Artifact) => ProjectedArtifact,
  attachFeedbackToKnowledge: (
    entries: KnowledgeEntry[],
    feedback: Feedback[],
    remediation?: RetrievalRemediationProjection[],
  ) => ProjectedKnowledgeEntry[],
  attachFeedbackToArtifacts: (
    artifacts: ProjectedArtifact[],
    feedback: Feedback[],
    remediation?: RetrievalRemediationProjection[],
  ) => ProjectedArtifact[],
): Promise<RetrievalReadProjection<ProjectedKnowledgeEntry, ProjectedArtifact, Conflict>> {
  const knowledgeEntriesPromise = sources.listKnowledge();
  const artifactsPromise = sources.listArtifacts();
  const feedbackPromise = sources.listRemediation
    ? Promise.resolve([] as Feedback[])
    : sources.listFeedback();
  const knowledgeEntries = await knowledgeEntriesPromise;
  const entryIds = knowledgeEntries.flatMap((entry) => {
    const id = (entry as { id?: unknown }).id;
    return typeof id === 'string' ? [id] : [];
  });
  const [artifacts, feedback, conflicts] = await Promise.all([
    artifactsPromise,
    feedbackPromise,
    sources.listConflicts(entryIds),
  ]);
  const artifactIds = artifacts.flatMap((artifact) => {
    const id = (artifact as { id?: unknown }).id;
    return typeof id === 'string' ? [id] : [];
  });
  const remediation = sources.listRemediation
    ? await sources.listRemediation([...new Set([...entryIds, ...artifactIds])])
    : [];

  return {
    knowledgeEntries: attachFeedbackToKnowledge(knowledgeEntries, feedback, remediation),
    skillArtifacts: attachFeedbackToArtifacts(
      artifacts.map(normalizeArtifact),
      feedback,
      remediation,
    ),
    conflicts,
  };
}

export async function buildCachedRetrievalReadModel<
  KnowledgeEntry,
  Artifact,
  Feedback,
  Conflict,
  ProjectedKnowledgeEntry = KnowledgeEntry,
  ProjectedArtifact = Artifact,
>(
  cache: RetrievalReadModelCache<
    RetrievalReadProjection<ProjectedKnowledgeEntry, ProjectedArtifact, Conflict>
  >,
  sources: RetrievalProjectionSources<KnowledgeEntry, Artifact, Feedback, Conflict>,
  normalizeArtifact: (artifact: Artifact) => ProjectedArtifact,
  attachFeedbackToKnowledge: (
    entries: KnowledgeEntry[],
    feedback: Feedback[],
    remediation?: RetrievalRemediationProjection[],
  ) => ProjectedKnowledgeEntry[],
  attachFeedbackToArtifacts: (
    artifacts: ProjectedArtifact[],
    feedback: Feedback[],
    remediation?: RetrievalRemediationProjection[],
  ) => ProjectedArtifact[],
): Promise<RetrievalReadProjection<ProjectedKnowledgeEntry, ProjectedArtifact, Conflict>> {
  const cached = cache.get();
  if (cached) {
    return cached;
  }

  const model = await buildRetrievalReadProjection(
    sources,
    normalizeArtifact,
    attachFeedbackToKnowledge,
    attachFeedbackToArtifacts,
  );
  cache.set(model);
  return model;
}

export function buildCachedRetrievalReadModelFromRepositories<
  KnowledgeEntry,
  Artifact,
  Feedback,
  Conflict,
  ProjectedKnowledgeEntry = KnowledgeEntry,
  ProjectedArtifact = Artifact,
>(
  cache: RetrievalReadModelCache<
    RetrievalReadProjection<ProjectedKnowledgeEntry, ProjectedArtifact, Conflict>
  >,
  repositories: RetrievalReadModelRepositories<KnowledgeEntry, Artifact, Feedback, Conflict>,
  governanceRetrievalProjection: RetrievalGovernanceProjection<Feedback, Conflict>,
  normalizeArtifact: (artifact: Artifact) => ProjectedArtifact,
  attachFeedbackToKnowledge: (
    entries: KnowledgeEntry[],
    feedback: Feedback[],
    remediation?: RetrievalRemediationProjection[],
  ) => ProjectedKnowledgeEntry[],
  attachFeedbackToArtifacts: (
    artifacts: ProjectedArtifact[],
    feedback: Feedback[],
    remediation?: RetrievalRemediationProjection[],
  ) => ProjectedArtifact[],
): Promise<RetrievalReadProjection<ProjectedKnowledgeEntry, ProjectedArtifact, Conflict>> {
  const listArtifacts = repositories.artifact.listForRetrieval
    ? repositories.artifact.listForRetrieval.bind(repositories.artifact)
    : repositories.artifact.listByFilter.bind(repositories.artifact);

  return buildCachedRetrievalReadModel(
    cache,
    {
      listKnowledge: () => repositories.knowledge.listByFilter({}),
      listArtifacts: () => listArtifacts({}),
      listFeedback: () => governanceRetrievalProjection.listFeedback(),
      listConflicts: (entryIds) => governanceRetrievalProjection.listConflicts(entryIds),
      ...(governanceRetrievalProjection.listRemediation
        ? {
            listRemediation: (entryIds: string[]) =>
              governanceRetrievalProjection.listRemediation!(entryIds),
          }
        : {}),
    },
    normalizeArtifact,
    attachFeedbackToKnowledge,
    attachFeedbackToArtifacts,
  );
}
