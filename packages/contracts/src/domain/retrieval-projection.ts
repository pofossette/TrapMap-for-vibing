export interface RetrievalProjectionSources<KnowledgeEntry, Artifact, Feedback, Conflict> {
  listKnowledge(): Promise<KnowledgeEntry[]>;
  listArtifacts(): Promise<Artifact[]>;
  listFeedback(): Promise<Feedback[]>;
  listConflicts(): Promise<Conflict[]>;
}

export interface RetrievalReadModelRepositories<KnowledgeEntry, Artifact, Feedback, Conflict> {
  knowledge: {
    listByFilter(filter: {}): Promise<KnowledgeEntry[]>;
  };
  artifact: {
    listByFilter(filter: {}): Promise<Artifact[]>;
    listForRetrieval?(filter: {}): Promise<Artifact[]>;
  };
  feedback: {
    listByFilter(filter: {}): Promise<Feedback[]>;
  };
  conflict: {
    listAll(): Promise<Conflict[]>;
  };
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
  ) => ProjectedKnowledgeEntry[],
  attachFeedbackToArtifacts: (
    artifacts: ProjectedArtifact[],
    feedback: Feedback[],
  ) => ProjectedArtifact[],
): Promise<RetrievalReadProjection<ProjectedKnowledgeEntry, ProjectedArtifact, Conflict>> {
  const [knowledgeEntries, artifacts, feedback, conflicts] = await Promise.all([
    sources.listKnowledge(),
    sources.listArtifacts(),
    sources.listFeedback(),
    sources.listConflicts(),
  ]);

  return {
    knowledgeEntries: attachFeedbackToKnowledge(knowledgeEntries, feedback),
    skillArtifacts: attachFeedbackToArtifacts(artifacts.map(normalizeArtifact), feedback),
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
  ) => ProjectedKnowledgeEntry[],
  attachFeedbackToArtifacts: (
    artifacts: ProjectedArtifact[],
    feedback: Feedback[],
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
  normalizeArtifact: (artifact: Artifact) => ProjectedArtifact,
  attachFeedbackToKnowledge: (
    entries: KnowledgeEntry[],
    feedback: Feedback[],
  ) => ProjectedKnowledgeEntry[],
  attachFeedbackToArtifacts: (
    artifacts: ProjectedArtifact[],
    feedback: Feedback[],
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
      listFeedback: () => repositories.feedback.listByFilter({}),
      listConflicts: () => repositories.conflict.listAll(),
    },
    normalizeArtifact,
    attachFeedbackToKnowledge,
    attachFeedbackToArtifacts,
  );
}
