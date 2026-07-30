import {
  createCandidateIngestionPgOwnerBundle,
  migrateCandidateIngestionSnapshot,
} from '@trapmap/service-candidate-ingestion';
import {
  createGovernanceReviewPgOwnerBundle,
  migrateGovernanceSnapshot,
} from '@trapmap/service-governance-review';
import {
  createIdentityAccessSnapshotPort,
  migrateIdentityAudit,
  type IdentityAuditSnapshot,
} from '@trapmap/service-identity-access';
import { createKnowledgeReadGraphProjectionRebuilder } from '@trapmap/service-knowledge-read';
import {
  createArtifactFilePayloadOwner,
  createKnowledgeSnapshotOwner,
  createKnowledgeWriteOwnerBundle,
  migrateArtifactFilePayloads,
  migrateKnowledgeSnapshot,
  migrateSkillArtifacts,
} from '@trapmap/service-knowledge-write';
import type { Pool } from 'pg';

import type { LegacySnapshotBackfillOwners } from './coordinator.js';
import type { LegacySnapshot } from './source.js';

function identitySnapshotPort(snapshot: IdentityAuditSnapshot) {
  return createIdentityAccessSnapshotPort<IdentityAuditSnapshot>({
    read: async () => snapshot,
    transact: async (work) => work(snapshot),
    nextId: () => {
      throw new Error('legacy snapshot identity backfill does not allocate IDs');
    },
  });
}

function knowledgeRecords(snapshot: LegacySnapshot['knowledge']) {
  // The service owner persists the original validated legacy record verbatim.
  return snapshot.knowledgeEntries as Parameters<typeof migrateKnowledgeSnapshot>[0]['records'];
}

function artifactRecords(snapshot: LegacySnapshot['artifacts']) {
  // The legacy snapshot is the compatibility input for the existing owner-local backfill.
  return snapshot.skillArtifacts as unknown as Parameters<
    typeof migrateSkillArtifacts
  >[0]['artifacts'];
}

/** Host-only composition for the one-time legacy snapshot backfill. */
export function createLegacySnapshotBackfillOwners(pool: Pool): LegacySnapshotBackfillOwners {
  const knowledgeWrite = createKnowledgeWriteOwnerBundle(pool);
  const candidateIngestion = createCandidateIngestionPgOwnerBundle(pool);
  const governance = createGovernanceReviewPgOwnerBundle(pool);
  const rebuildGraphProjection = createKnowledgeReadGraphProjectionRebuilder(pool);

  return {
    identityAudit: (snapshot) =>
      migrateIdentityAudit({ pool, snapshot: identitySnapshotPort(snapshot) }),
    knowledge: (snapshot) =>
      migrateKnowledgeSnapshot({
        owner: createKnowledgeSnapshotOwner(pool),
        records: knowledgeRecords(snapshot),
      }),
    artifacts: (snapshot) =>
      migrateSkillArtifacts({
        artifacts: artifactRecords(snapshot),
        artifactWriter: knowledgeWrite.artifactWriter,
        artifactReadProjection: knowledgeWrite.artifactReadProjection,
      }),
    artifactFilePayloads: (snapshot) =>
      migrateArtifactFilePayloads({
        owner: createArtifactFilePayloadOwner(pool),
        payloads: snapshot,
      }),
    candidateIngestion: (snapshot) =>
      migrateCandidateIngestionSnapshot({ owner: candidateIngestion, snapshot }),
    governance: (snapshot) => migrateGovernanceSnapshot({ owner: governance, snapshot }),
    rebuildGraphProjection,
  };
}
