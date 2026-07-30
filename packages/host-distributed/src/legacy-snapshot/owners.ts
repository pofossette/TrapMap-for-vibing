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
  createArtifactSnapshotOwner,
  createKnowledgeSnapshotOwner,
  migrateArtifactFilePayloads,
  migrateKnowledgeSnapshot,
  migrateLegacySkillArtifacts,
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

/** Host-only composition for the one-time legacy snapshot backfill. */
export function createLegacySnapshotBackfillOwners(pool: Pool): LegacySnapshotBackfillOwners {
  const candidateIngestion = createCandidateIngestionPgOwnerBundle(pool);
  const governance = createGovernanceReviewPgOwnerBundle(pool);
  const rebuildGraphProjection = createKnowledgeReadGraphProjectionRebuilder(pool);
  const artifactSnapshot = createArtifactSnapshotOwner(pool);

  return {
    identityAudit: (snapshot) =>
      migrateIdentityAudit({ pool, snapshot: identitySnapshotPort(snapshot) }),
    knowledge: (snapshot) =>
      migrateKnowledgeSnapshot({
        owner: createKnowledgeSnapshotOwner(pool),
        records: snapshot.knowledgeEntries,
      }),
    artifacts: (snapshot) =>
      migrateLegacySkillArtifacts({
        owner: artifactSnapshot,
        records: snapshot.skillArtifacts,
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
