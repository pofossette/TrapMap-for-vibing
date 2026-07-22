export interface LegacySnapshotBackfillSnapshot {
  counters: Record<string, number>;
  users: unknown[];
  teams: unknown[];
  memberships: unknown[];
  accessKeys: unknown[];
  sessions: unknown[];
  auditEvents: unknown[];
  knowledgeEntries: unknown[];
  skillArtifacts: unknown[];
  artifactFilePayloads: unknown[];
  candidateSubmissions: unknown[];
  duplicateCases: unknown[];
  entityLineage: unknown[];
  conflicts: unknown[];
  feedbackQueue: unknown[];
  graphIndexDocuments: unknown[];
  promptVersion: number | null;
  rebuildState: { targetVersion: number; completedSourceKeys: string[] } | null;
}

type OwnerMigrationResult = {
  errors: Array<string | { error: string }>;
};

export interface LegacySnapshotBackfillDeps {
  readSnapshot(): Promise<LegacySnapshotBackfillSnapshot>;
  migrateIdentityAudit(
    snapshot: Pick<
      LegacySnapshotBackfillSnapshot,
      'users' | 'teams' | 'memberships' | 'accessKeys' | 'sessions' | 'auditEvents'
    >,
  ): Promise<OwnerMigrationResult>;
  migrateKnowledge(records: unknown[]): Promise<OwnerMigrationResult>;
  migrateArtifacts(records: unknown[]): Promise<OwnerMigrationResult>;
  migrateArtifactFilePayloads(payloads: unknown[]): Promise<OwnerMigrationResult>;
  migrateCandidateIngestion(
    snapshot: Pick<
      LegacySnapshotBackfillSnapshot,
      'candidateSubmissions' | 'duplicateCases' | 'entityLineage'
    >,
  ): Promise<OwnerMigrationResult>;
  migrateGovernance(
    snapshot: Pick<LegacySnapshotBackfillSnapshot, 'conflicts' | 'feedbackQueue'>,
  ): Promise<OwnerMigrationResult>;
  rebuildGraphProjection(input: {
    source: Pick<LegacySnapshotBackfillSnapshot, 'knowledgeEntries' | 'skillArtifacts'>;
    legacyDocumentCount: number;
  }): Promise<{ sourceCount: number; destinationCount: number }>;
}

export interface LegacySnapshotBackfillResult {
  errors: Array<{ owner: string; error: string }>;
  graphProjection: { sourceCount: number; destinationCount: number } | null;
  discardedLegacyBuckets: readonly ['counters', 'promptVersion', 'rebuildState'];
  readyForCompatibilityStateDeletion: boolean;
}

function collectErrors(owner: string, result: OwnerMigrationResult) {
  return result.errors.map((item) => ({
    owner,
    error: typeof item === 'string' ? item : item.error,
  }));
}

/**
 * Coordinates the Task-9-only transfer from the legacy aggregate into owner
 * tables. Graph documents are derived state and are rebuilt only after every
 * authoritative owner confirms that its source records are conflict-free.
 */
export async function runLegacySnapshotBackfill(
  deps: LegacySnapshotBackfillDeps,
): Promise<LegacySnapshotBackfillResult> {
  const snapshot = await deps.readSnapshot();
  const [identity, knowledge, artifacts, payloads, candidates, governance] = await Promise.all([
    deps.migrateIdentityAudit({
      users: snapshot.users,
      teams: snapshot.teams,
      memberships: snapshot.memberships,
      accessKeys: snapshot.accessKeys,
      sessions: snapshot.sessions,
      auditEvents: snapshot.auditEvents,
    }),
    deps.migrateKnowledge(snapshot.knowledgeEntries),
    deps.migrateArtifacts(snapshot.skillArtifacts),
    deps.migrateArtifactFilePayloads(snapshot.artifactFilePayloads),
    deps.migrateCandidateIngestion({
      candidateSubmissions: snapshot.candidateSubmissions,
      duplicateCases: snapshot.duplicateCases,
      entityLineage: snapshot.entityLineage,
    }),
    deps.migrateGovernance({
      conflicts: snapshot.conflicts,
      feedbackQueue: snapshot.feedbackQueue,
    }),
  ]);
  const errors = [
    ...collectErrors('identity-access', identity),
    ...collectErrors('knowledge-write', knowledge),
    ...collectErrors('knowledge-write-artifacts', artifacts),
    ...collectErrors('knowledge-write-artifact-payloads', payloads),
    ...collectErrors('candidate-ingestion', candidates),
    ...collectErrors('governance-review', governance),
  ];

  if (errors.length > 0) {
    return {
      errors,
      graphProjection: null,
      discardedLegacyBuckets: ['counters', 'promptVersion', 'rebuildState'],
      readyForCompatibilityStateDeletion: false,
    };
  }

  const graphProjection = await deps.rebuildGraphProjection({
    source: {
      knowledgeEntries: snapshot.knowledgeEntries,
      skillArtifacts: snapshot.skillArtifacts,
    },
    legacyDocumentCount: snapshot.graphIndexDocuments.length,
  });
  const expectedGraphSourceCount =
    snapshot.knowledgeEntries.length + snapshot.skillArtifacts.length;
  return {
    errors: [],
    graphProjection,
    discardedLegacyBuckets: ['counters', 'promptVersion', 'rebuildState'],
    readyForCompatibilityStateDeletion:
      graphProjection.sourceCount === expectedGraphSourceCount &&
      graphProjection.destinationCount === expectedGraphSourceCount,
  };
}
