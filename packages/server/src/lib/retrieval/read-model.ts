/**
 * Repository-backed retrieval read model.
 *
 * Assembles knowledge entries, skill artifacts, and conflict relations
 * from their canonical repository seams instead of relying on
 * compatibility store snapshot reads inside retrieval assembly.
 *
 * Phase 4.1: Introduce a repository-backed retrieval read model.
 */

import {
  attachRemediationProjection,
  buildCachedRetrievalReadModelFromRepositories,
  type ConflictRelation,
  type RetrievalReadProjection,
  type RetrievalGovernanceProjection,
  type SkillArtifact,
} from '@trapmap/contracts';
import {
  getCachedRetrievalReadModel,
  setCachedRetrievalReadModel,
} from '@trapmap/server/lib/cache/retrieval-read-model-cache.js';
import type { SkillShareerRepos } from '@trapmap/server/lib/repos/index.js';
import type { KnowledgeRecord, SkillArtifactRecord } from '@trapmap/server/lib/store.js';
import type { FeedbackQueueRecord } from '@trapmap/server/lib/store.js';

function normalizeArtifactRevision(revision: SkillArtifact['history'][number]) {
  return {
    ...revision,
    submittedByUserId: revision.submittedBy.id,
  };
}

function normalizeAgentReview(artifact: SkillArtifact) {
  return artifact.agentReview
    ? {
        status: artifact.agentReview.status,
        duplicateRisk: artifact.agentReview.duplicateRisk,
        correctnessRisk: artifact.agentReview.correctnessRisk,
        completenessRisk: artifact.agentReview.completenessRisk,
        checkedAt: artifact.agentReview.checkedAt,
        notes: artifact.agentReview.notes,
      }
    : null;
}

function normalizeReviewHistory(artifact: SkillArtifact) {
  return (artifact.reviewHistory ?? []).map((decision) => ({
    decidedAt: decision.decidedAt,
    decidedByUserId: decision.decidedBy.id,
    decision: decision.decision,
    notes: decision.notes,
  }));
}

function normalizeReviewNotes(artifact: SkillArtifact) {
  return (artifact.reviewNotes ?? []).map((note) => ({
    id: note.id,
    createdAt: note.createdAt,
    authorType: note.authorType,
    authorUserId: note.author?.id ?? null,
    message: note.message,
  }));
}

function normalizeLifecycleHistory(artifact: SkillArtifact) {
  return (artifact.lifecycleHistory ?? []).map((event) => ({
    id: event.id,
    type: event.type,
    createdAt: event.createdAt,
    actorUserId: event.actor?.id ?? null,
    submissionId: event.submissionId,
    revision: event.revision,
    state: event.state,
    note: event.note,
  }));
}

function normalizeMaintenanceMeta(artifact: SkillArtifact) {
  return artifact.maintenanceMeta
    ? {
        maintainerUserId: artifact.maintenanceMeta.maintainer?.id ?? null,
        maintainerHandle: artifact.maintenanceMeta.maintainer?.handle ?? null,
        maintainerLevel: artifact.maintenanceMeta.maintainer?.securityLevel ?? null,
        reviewBy: artifact.maintenanceMeta.reviewBy,
      }
    : null;
}

function normalizeArtifactForRetrieval(
  artifact: SkillArtifact | SkillArtifactRecord,
): SkillArtifactRecord {
  if (typeof artifact.latestRevision === 'object') {
    return artifact as SkillArtifactRecord;
  }

  const latestRevision = artifact.history.find(
    (revision) => revision.revision === artifact.latestRevision,
  );
  if (!latestRevision) {
    throw new Error(
      `Artifact ${artifact.id} is missing latest revision ${artifact.latestRevision}`,
    );
  }

  return {
    id: artifact.id,
    teamId: artifact.teamId,
    scope: artifact.scope,
    labels: artifact.labels,
    title: artifact.title,
    slug: artifact.slug,
    requiredLevel: artifact.requiredLevel,
    lifecycleState: artifact.lifecycleState,
    ownerUserId: artifact.owner.id,
    latestRevision: normalizeArtifactRevision(latestRevision),
    history: artifact.history.map(normalizeArtifactRevision),
    metadata: artifact.metadata,
    agentReview: normalizeAgentReview(artifact),
    reviewHistory: normalizeReviewHistory(artifact),
    reviewNotes: normalizeReviewNotes(artifact),
    lifecycleHistory: normalizeLifecycleHistory(artifact),
    boundary: artifact.boundaryMeta ?? null,
    decayMeta: null,
    evidenceMeta: artifact.evidenceMeta ?? null,
    maintenanceMeta: normalizeMaintenanceMeta(artifact),
    remediation: artifact.remediation ?? null,
    createdAt: artifact.createdAt,
    updatedAt: artifact.updatedAt,
  };
}

export type RetrievalReadModel = RetrievalReadProjection<
  KnowledgeRecord,
  SkillArtifactRecord,
  ConflictRelation
>;

export async function buildRetrievalReadModel(
  repos: SkillShareerRepos,
): Promise<RetrievalReadModel> {
  const governanceRetrievalProjection = repos.governanceRetrievalProjection;
  if (!governanceRetrievalProjection) {
    throw new Error('server retrieval requires the governance retrieval projection owner port');
  }
  return buildCachedRetrievalReadModelFromRepositories(
    {
      get: getCachedRetrievalReadModel,
      set: setCachedRetrievalReadModel,
    },
    repos,
    governanceRetrievalProjection as RetrievalGovernanceProjection<
      FeedbackQueueRecord,
      ConflictRelation
    >,
    normalizeArtifactForRetrieval,
    (entries, _feedback, remediation) => attachRemediationProjection(entries, remediation),
    (artifacts, _feedback, remediation) => attachRemediationProjection(artifacts, remediation),
  );
}
