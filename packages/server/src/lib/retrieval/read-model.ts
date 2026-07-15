/**
 * Repository-backed retrieval read model.
 *
 * Assembles knowledge entries, skill artifacts, and conflict relations
 * from their canonical repository seams instead of relying on
 * compatibility store snapshot reads inside retrieval assembly.
 *
 * Phase 4.1: Introduce a repository-backed retrieval read model.
 */

import type { ConflictRelation, SkillArtifact } from '@trapmap/contracts';
import {
  getCachedRetrievalReadModel,
  setCachedRetrievalReadModel,
} from '@trapmap/server/lib/cache/retrieval-read-model-cache.js';
import {
  attachRemediationToArtifacts,
  attachRemediationToKnowledgeEntries,
} from '@trapmap/server/lib/feedback/remediation.js';
import type { SkillShareerRepos } from '@trapmap/server/lib/repos/index.js';
import type { KnowledgeRecord, SkillArtifactRecord } from '@trapmap/server/lib/store.js';

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

/**
 * Assembled read model for retrieval flows.
 * Provides the three data shapes that retrieval consumers need:
 * knowledge entries, skill artifacts, and conflict relations.
 */
export interface RetrievalReadModel {
  knowledgeEntries: KnowledgeRecord[];
  skillArtifacts: SkillArtifactRecord[];
  conflicts: ConflictRelation[];
}

/**
 * Build a retrieval read model from repositories.
 *
 * Knowledge, artifact, feedback, and conflict data are read from their
 * dedicated repository seams in parallel.
 *
 * @param repos - Unified repository object
 * @returns Assembled read model with all retrieval-relevant data
 */
export async function buildRetrievalReadModel(
  repos: SkillShareerRepos,
): Promise<RetrievalReadModel> {
  const cached = getCachedRetrievalReadModel();
  if (cached) {
    return cached;
  }

  const artifactLister =
    typeof repos.artifact.listForRetrieval === 'function'
      ? repos.artifact.listForRetrieval.bind(repos.artifact)
      : repos.artifact.listByFilter.bind(repos.artifact);

  const [knowledgeEntries, skillArtifacts, feedbackQueue, conflicts] = await Promise.all([
    repos.knowledge.listByFilter({}),
    artifactLister({}),
    repos.feedback.listByFilter({}),
    repos.conflict.listAll(),
  ]);

  const model = {
    knowledgeEntries: attachRemediationToKnowledgeEntries(knowledgeEntries, feedbackQueue),
    skillArtifacts: attachRemediationToArtifacts(
      skillArtifacts.map(normalizeArtifactForRetrieval),
      feedbackQueue,
    ),
    conflicts,
  };

  setCachedRetrievalReadModel(model);
  return model;
}
