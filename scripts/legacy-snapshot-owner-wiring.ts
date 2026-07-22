import { createCandidateIngestionPgOwnerBundle } from '../packages/service-candidate-ingestion/src/pg-ports.js';
import { migrateCandidateIngestionSnapshot } from '../packages/service-candidate-ingestion/src/snapshot-backfill.js';
import {
  migrateIdentityAudit,
  type IdentityAuditSnapshot,
} from '../packages/service-identity-access/src/identity-audit-backfill.js';
import { createGovernanceReviewPgOwnerBundle } from '../packages/service-governance-review/src/pg-ports.js';
import { migrateGovernanceSnapshot } from '../packages/service-governance-review/src/snapshot-backfill.js';
import { createKnowledgeWriteOwnerBundle } from '../packages/service-knowledge-write/src/pg-ports.js';
import { createArtifactFilePayloadOwner } from '../packages/service-knowledge-write/src/artifact-ports.js';
import { createKnowledgeSnapshotOwner } from '../packages/service-knowledge-write/src/knowledge-snapshot-owner.js';
import { migrateArtifactFilePayloads } from '../packages/service-knowledge-write/src/wave9-artifact-payload-backfill.js';
import {
  migrateKnowledgeSnapshot,
  type LegacyKnowledgeSnapshotRecord,
} from '../packages/service-knowledge-write/src/knowledge-snapshot-backfill.js';
import { migrateSkillArtifacts } from '../packages/service-knowledge-write/src/wave9-artifact-backfill.js';
import type { Pool } from 'pg';

import type {
  LegacySnapshotBackfillDeps,
  LegacySnapshotBackfillSnapshot,
} from './legacy-snapshot-backfill.js';

function errors(items: Array<{ error: string }> | string[]) {
  return items.map((item) => (typeof item === 'string' ? item : item));
}

/**
 * Binds Task-9-only snapshot records to their owner-local PostgreSQL ports.
 * Graph rebuilding remains an explicit knowledge-read owner operation.
 */
export function createLegacySnapshotOwnerWiring(
  targetPool: Pool,
  rebuildGraphProjection: LegacySnapshotBackfillDeps['rebuildGraphProjection'],
): Omit<LegacySnapshotBackfillDeps, 'readSnapshot'> {
  const candidate = createCandidateIngestionPgOwnerBundle(targetPool);
  const governance = createGovernanceReviewPgOwnerBundle(targetPool);
  const knowledge = createKnowledgeWriteOwnerBundle(targetPool);
  const knowledgeSnapshotOwner = createKnowledgeSnapshotOwner(targetPool);
  const artifactPayloadOwner = createArtifactFilePayloadOwner(targetPool);

  return {
    async migrateIdentityAudit(snapshot) {
      const source = snapshot as IdentityAuditSnapshot;
      const result = await migrateIdentityAudit({
        pool: targetPool,
        snapshot: {
          read: async () => source,
          transact: async (work) => work(source),
          nextId: () => {
            throw new Error('Task-9 identity backfill must preserve snapshot IDs');
          },
        },
      });
      return {
        errors: [
          ...Object.values(result.domains).flatMap((domain) => errors(domain.errors)),
          ...result.verification
            .filter((verification) => !verification.matched)
            .map((verification) => `identity ${verification.domain} count mismatch`),
        ],
      };
    },
    async migrateKnowledge(records) {
      const result = await migrateKnowledgeSnapshot({
        owner: knowledgeSnapshotOwner,
        records: records as LegacyKnowledgeSnapshotRecord[],
      });
      return { errors: errors(result.errors) };
    },
    async migrateArtifacts(records) {
      const result = await migrateSkillArtifacts({
        artifacts: records as never,
        artifactWriter: knowledge.artifactWriter,
        artifactReadProjection: knowledge.artifactReadProjection,
      });
      return { errors: errors(result.errors) };
    },
    async migrateArtifactFilePayloads(payloads) {
      const result = await migrateArtifactFilePayloads({
        owner: artifactPayloadOwner,
        payloads: payloads as never,
      });
      return { errors: errors(result.errors) };
    },
    async migrateCandidateIngestion(snapshot) {
      const result = await migrateCandidateIngestionSnapshot({
        owner: candidate,
        snapshot: snapshot as never,
      });
      return {
        errors: Object.values(result.domains).flatMap((domain) => errors(domain.errors)),
      };
    },
    async migrateGovernance(snapshot) {
      const result = await migrateGovernanceSnapshot({
        owner: governance,
        snapshot: snapshot as never,
      });
      return { errors: errors(result.errors) };
    },
    rebuildGraphProjection,
  };
}

export function snapshotReader(source: LegacySnapshotBackfillSnapshot) {
  return async () => source;
}
