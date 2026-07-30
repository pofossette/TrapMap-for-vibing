import type { LegacySnapshot, LegacySnapshotSource } from './source.js';
import { loadLegacySnapshot } from './source.js';

interface MigrationEvidence {
  migrated: number;
  skipped: number;
  verified: number;
  errors: readonly unknown[];
}

interface IdentityDomainEvidence {
  inserted: number;
  skipped: number;
  errors: readonly unknown[];
}

interface IdentityVerificationEvidence {
  domain: string;
  snapshotCount: number;
  tableCount: number;
  matched: boolean;
}

interface CandidateDomainEvidence {
  migrated: number;
  skipped: number;
  errors: readonly unknown[];
}

interface CandidateVerificationEvidence {
  domain: string;
  snapshotCount: number;
  destinationCount: number;
  matched: boolean;
}

export interface LegacySnapshotBackfillOwners {
  identityAudit(snapshot: LegacySnapshot['identityAudit']): Promise<{
    domains: Record<string, IdentityDomainEvidence>;
    verification: readonly IdentityVerificationEvidence[];
    durationMs: number;
  }>;
  knowledge(snapshot: LegacySnapshot['knowledge']): Promise<MigrationEvidence>;
  artifacts(
    snapshot: LegacySnapshot['artifacts'],
  ): Promise<MigrationEvidence & { totalArtifacts: number; durationMs: number }>;
  artifactFilePayloads(
    snapshot: LegacySnapshot['artifactFilePayloads'],
  ): Promise<MigrationEvidence>;
  candidateIngestion(snapshot: LegacySnapshot['candidateIngestion']): Promise<{
    domains: Record<string, CandidateDomainEvidence>;
    verification: readonly CandidateVerificationEvidence[];
  }>;
  governance(snapshot: LegacySnapshot['governance']): Promise<MigrationEvidence>;
  rebuildGraphProjection(): Promise<{ sourceCount: number; destinationCount: number }>;
}

export interface LegacySnapshotSourceCounts {
  identityAudit: {
    users: number;
    teams: number;
    memberships: number;
    accessKeys: number;
    sessions: number;
    auditEvents: number;
  };
  knowledgeEntries: number;
  skillArtifacts: number;
  artifactFilePayloads: number;
  candidateIngestion: {
    candidateSubmissions: number;
    duplicateCases: number;
    entityLineage: number;
  };
  governance: {
    feedbackQueue: number;
    conflicts: number;
  };
}

export interface LegacySnapshotBackfillResult {
  succeeded: boolean;
  sourceCounts: LegacySnapshotSourceCounts;
  evidence: LegacySnapshotBucketEvidence[];
  buckets: {
    identityAudit: Awaited<ReturnType<LegacySnapshotBackfillOwners['identityAudit']>>;
    knowledge: Awaited<ReturnType<LegacySnapshotBackfillOwners['knowledge']>>;
    artifacts: Awaited<ReturnType<LegacySnapshotBackfillOwners['artifacts']>>;
    artifactFilePayloads: Awaited<ReturnType<LegacySnapshotBackfillOwners['artifactFilePayloads']>>;
    candidateIngestion: Awaited<ReturnType<LegacySnapshotBackfillOwners['candidateIngestion']>>;
    governance: Awaited<ReturnType<LegacySnapshotBackfillOwners['governance']>>;
    graphProjection: Awaited<ReturnType<LegacySnapshotBackfillOwners['rebuildGraphProjection']>>;
  };
}

/** A uniform, operator-facing view over the owner-specific evidence in `buckets`. */
export interface LegacySnapshotBucketEvidence {
  owner: string;
  bucket: string;
  inserted: number;
  skipped: number;
  sourceCount: number;
  destinationCount: number;
  verified: boolean;
  result: unknown;
}

function sourceCounts(snapshot: LegacySnapshot): LegacySnapshotSourceCounts {
  return {
    identityAudit: {
      users: snapshot.identityAudit.users.length,
      teams: snapshot.identityAudit.teams.length,
      memberships: snapshot.identityAudit.memberships.length,
      accessKeys: snapshot.identityAudit.accessKeys.length,
      sessions: snapshot.identityAudit.sessions.length,
      auditEvents: snapshot.identityAudit.auditEvents.length,
    },
    knowledgeEntries: snapshot.knowledge.knowledgeEntries.length,
    skillArtifacts: snapshot.artifacts.skillArtifacts.length,
    artifactFilePayloads: snapshot.artifactFilePayloads.length,
    candidateIngestion: {
      candidateSubmissions: snapshot.candidateIngestion.candidateSubmissions.length,
      duplicateCases: snapshot.candidateIngestion.duplicateCases.length,
      entityLineage: snapshot.candidateIngestion.entityLineage.length,
    },
    governance: {
      feedbackQueue: snapshot.governance.feedbackQueue.length,
      conflicts: snapshot.governance.conflicts.length,
    },
  };
}

function toBucketEvidence(input: {
  owner: string;
  bucket: string;
  sourceCount: number;
  inserted: number;
  skipped: number;
  destinationCount: number;
  verified: boolean;
  result: unknown;
}): LegacySnapshotBucketEvidence {
  return input;
}

function assertMigrationEvidence(
  owner: string,
  evidence: MigrationEvidence,
  expectedCount: number,
): void {
  if (evidence.errors.length > 0) {
    throw new Error(`${owner} reported ${evidence.errors.length} migration error(s)`);
  }
  if (evidence.migrated + evidence.skipped !== expectedCount) {
    throw new Error(
      `${owner} processed ${evidence.migrated + evidence.skipped} records; expected ${expectedCount}`,
    );
  }
  if (evidence.verified !== expectedCount) {
    throw new Error(`${owner} verified ${evidence.verified} records; expected ${expectedCount}`);
  }
}

function assertIdentityEvidence(
  result: Awaited<ReturnType<LegacySnapshotBackfillOwners['identityAudit']>>,
  expected: LegacySnapshotSourceCounts['identityAudit'],
): void {
  for (const [domain, expectedCount] of Object.entries(expected)) {
    const domainEvidence = result.domains[domain];
    const verification = result.verification.find((item) => item.domain === domain);
    if (!domainEvidence) throw new Error(`identity/audit did not report ${domain} evidence`);
    if (domainEvidence.errors.length > 0) {
      throw new Error(
        `identity/audit ${domain} reported ${domainEvidence.errors.length} migration error(s)`,
      );
    }
    if (domainEvidence.inserted + domainEvidence.skipped !== expectedCount) {
      throw new Error(`identity/audit ${domain} processed an unexpected record count`);
    }
    if (
      !verification ||
      !verification.matched ||
      verification.snapshotCount !== expectedCount ||
      verification.tableCount !== expectedCount
    ) {
      throw new Error(`identity/audit ${domain} verification mismatch`);
    }
  }
}

function assertCandidateEvidence(
  result: Awaited<ReturnType<LegacySnapshotBackfillOwners['candidateIngestion']>>,
  expected: LegacySnapshotSourceCounts['candidateIngestion'],
): void {
  for (const [domain, expectedCount] of Object.entries(expected)) {
    const domainEvidence = result.domains[domain];
    const verification = result.verification.find((item) => item.domain === domain);
    if (!domainEvidence)
      throw new Error(`candidate/duplicate/lineage did not report ${domain} evidence`);
    if (domainEvidence.errors.length > 0) {
      throw new Error(
        `candidate/duplicate/lineage ${domain} reported ${domainEvidence.errors.length} migration error(s)`,
      );
    }
    if (domainEvidence.migrated + domainEvidence.skipped !== expectedCount) {
      throw new Error(`candidate/duplicate/lineage ${domain} processed an unexpected record count`);
    }
    if (
      !verification ||
      !verification.matched ||
      verification.snapshotCount !== expectedCount ||
      verification.destinationCount !== expectedCount
    ) {
      throw new Error(`candidate/duplicate/lineage ${domain} verification mismatch`);
    }
  }
}

async function runOwner<TResult>(
  owner: string,
  work: () => Promise<TResult>,
  assertResult: (result: TResult) => void,
): Promise<TResult> {
  try {
    const result = await work();
    assertResult(result);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`legacy snapshot backfill failed for ${owner}: ${message}`);
  }
}

export async function runLegacySnapshotBackfill(input: {
  source: LegacySnapshotSource;
  owners: LegacySnapshotBackfillOwners;
}): Promise<LegacySnapshotBackfillResult> {
  const snapshot = await loadLegacySnapshot(input.source);
  const counts = sourceCounts(snapshot);

  const identityAudit = await runOwner(
    'identity/audit',
    () => input.owners.identityAudit(snapshot.identityAudit),
    (result) => assertIdentityEvidence(result, counts.identityAudit),
  );
  const knowledge = await runOwner(
    'knowledge',
    () => input.owners.knowledge(snapshot.knowledge),
    (result) => assertMigrationEvidence('knowledge', result, counts.knowledgeEntries),
  );
  const artifacts = await runOwner(
    'artifacts',
    () => input.owners.artifacts(snapshot.artifacts),
    (result) => assertMigrationEvidence('artifacts', result, counts.skillArtifacts),
  );
  const artifactFilePayloads = await runOwner(
    'artifact payloads',
    () => input.owners.artifactFilePayloads(snapshot.artifactFilePayloads),
    (result) => assertMigrationEvidence('artifact payloads', result, counts.artifactFilePayloads),
  );
  const candidateIngestion = await runOwner(
    'candidate/duplicate/lineage',
    () => input.owners.candidateIngestion(snapshot.candidateIngestion),
    (result) => assertCandidateEvidence(result, counts.candidateIngestion),
  );
  const governance = await runOwner(
    'governance feedback/conflicts',
    () => input.owners.governance(snapshot.governance),
    (result) =>
      assertMigrationEvidence(
        'governance feedback/conflicts',
        result,
        counts.governance.feedbackQueue + counts.governance.conflicts,
      ),
  );
  const graphProjection = await runOwner(
    'knowledge-read graph rebuild',
    () => input.owners.rebuildGraphProjection(),
    (result) => {
      if (result.sourceCount !== result.destinationCount) {
        throw new Error(
          `knowledge-read graph rebuild count mismatch: source ${result.sourceCount}, destination ${result.destinationCount}`,
        );
      }
    },
  );

  return {
    succeeded: true,
    sourceCounts: counts,
    evidence: [
      ...Object.entries(counts.identityAudit).map(([bucket, sourceCount]) => {
        const domain = identityAudit.domains[bucket]!;
        const verification = identityAudit.verification.find((item) => item.domain === bucket)!;
        return toBucketEvidence({
          owner: 'identity/audit',
          bucket,
          sourceCount,
          inserted: domain.inserted,
          skipped: domain.skipped,
          destinationCount: verification.tableCount,
          verified: verification.matched,
          result: { domain, verification },
        });
      }),
      toBucketEvidence({
        owner: 'knowledge',
        bucket: 'knowledgeEntries',
        sourceCount: counts.knowledgeEntries,
        inserted: knowledge.migrated,
        skipped: knowledge.skipped,
        destinationCount: knowledge.verified,
        verified: knowledge.verified === counts.knowledgeEntries,
        result: knowledge,
      }),
      toBucketEvidence({
        owner: 'knowledge',
        bucket: 'skillArtifacts',
        sourceCount: counts.skillArtifacts,
        inserted: artifacts.migrated,
        skipped: artifacts.skipped,
        destinationCount: artifacts.verified,
        verified: artifacts.verified === counts.skillArtifacts,
        result: artifacts,
      }),
      toBucketEvidence({
        owner: 'knowledge',
        bucket: 'artifactFilePayloads',
        sourceCount: counts.artifactFilePayloads,
        inserted: artifactFilePayloads.migrated,
        skipped: artifactFilePayloads.skipped,
        destinationCount: artifactFilePayloads.verified,
        verified: artifactFilePayloads.verified === counts.artifactFilePayloads,
        result: artifactFilePayloads,
      }),
      ...Object.entries(counts.candidateIngestion).map(([bucket, sourceCount]) => {
        const domain = candidateIngestion.domains[bucket]!;
        const verification = candidateIngestion.verification.find(
          (item) => item.domain === bucket,
        )!;
        return toBucketEvidence({
          owner: 'candidate/duplicate/lineage',
          bucket,
          sourceCount,
          inserted: domain.migrated,
          skipped: domain.skipped,
          destinationCount: verification.destinationCount,
          verified: verification.matched,
          result: { domain, verification },
        });
      }),
      toBucketEvidence({
        owner: 'governance feedback/conflicts',
        bucket: 'governance',
        sourceCount: counts.governance.feedbackQueue + counts.governance.conflicts,
        inserted: governance.migrated,
        skipped: governance.skipped,
        destinationCount: governance.verified,
        verified:
          governance.verified === counts.governance.feedbackQueue + counts.governance.conflicts,
        result: governance,
      }),
      toBucketEvidence({
        owner: 'knowledge-read graph rebuild',
        bucket: 'graphProjection',
        sourceCount: graphProjection.sourceCount,
        inserted: graphProjection.destinationCount,
        skipped: 0,
        destinationCount: graphProjection.destinationCount,
        verified: graphProjection.sourceCount === graphProjection.destinationCount,
        result: graphProjection,
      }),
    ],
    buckets: {
      identityAudit,
      knowledge,
      artifacts,
      artifactFilePayloads,
      candidateIngestion,
      governance,
      graphProjection,
    },
  };
}

export function assertLegacySnapshotBackfillSucceeded(
  result: LegacySnapshotBackfillResult,
): asserts result is LegacySnapshotBackfillResult & { succeeded: true } {
  if (!result.succeeded) throw new Error('legacy snapshot backfill did not succeed');
}
