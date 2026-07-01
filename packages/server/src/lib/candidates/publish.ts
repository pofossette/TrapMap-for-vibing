/**
 * Publish candidates as independent entities.
 *
 * @module candidates/publish
 */

import type { CandidateSubmission } from '@trapmap/contracts';
import type {
  EntityLineageRecord,
  KnowledgeRecord,
  SkillArtifactRecord,
  SkillShareerStore,
  StoreData,
} from '@trapmap/server/lib/store.js';

/**
 * Create a KnowledgeRecord from a trap candidate.
 * The new entry starts at 'agent-pass' lifecycle state.
 */
export function publishTrapCandidate(args: {
  store: SkillShareerStore;
  data: StoreData;
  candidate: CandidateSubmission;
  resolvedBy: string;
  resolvedAt: string;
}): { entry: KnowledgeRecord; lineage: EntityLineageRecord } {
  if (!args.candidate.originalPayload.trap) {
    throw new Error('Candidate has no trap payload');
  }

  const trapPayload = args.candidate.originalPayload.trap;

  // Create the knowledge entry with agent-pass state
  // (candidate already passed duplicate analysis, but needs reviewer approval)
  const entry: KnowledgeRecord = {
    id: args.store.nextId(args.data, 'knowledge'),
    teamId: args.candidate.teamId,
    scope: trapPayload.scope,
    labels: trapPayload.labels,
    shortcut: trapPayload.shortcut,
    detail: trapPayload.detail,
    requiredLevel: trapPayload.requiredLevel ?? 0,
    lifecycleState: 'agent-pass',
    ownerUserId: args.candidate.submittedBy,
    latestRevision: {
      revision: 1,
      submittedAt: args.resolvedAt,
      submittedByUserId: args.candidate.submittedBy,
      shortcut: trapPayload.shortcut,
      detail: trapPayload.detail,
      labels: trapPayload.labels,
      reviewNotes: [],
    },
    history: [],
    metadata: {
      scopeLabel: trapPayload.scope === 'global' ? 'global-constraint' : 'project-knowledge',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: args.resolvedAt,
      latestReviewedAt: args.resolvedAt,
      latestDecision: null,
    },
    latestSubmissionId: null,
    submissionHistory: [],
    agentReview: {
      status: 'agent-pass',
      duplicateRisk: 'low',
      correctnessRisk: 'low',
      completenessRisk: 'low',
      checkedAt: args.resolvedAt,
      notes: ['Published from candidate submission after duplicate review'],
    },
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [
      {
        id: args.store.nextId(args.data, 'knowledge_event'),
        type: 'submitted',
        createdAt: args.resolvedAt,
        actorUserId: args.candidate.submittedBy,
        submissionId: null,
        revision: 1,
        state: 'submitted',
        note: 'Published from candidate after duplicate resolution',
      },
      {
        id: args.store.nextId(args.data, 'knowledge_event'),
        type: 'agent-reviewed',
        createdAt: args.resolvedAt,
        actorUserId: null,
        submissionId: null,
        revision: 1,
        state: 'agent-pass',
        note: 'Auto-approved after duplicate resolution',
      },
    ],
    embeddingCache: null,
    indexState: null,
    decayMeta: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    boundary: null,
    createdAt: args.resolvedAt,
    updatedAt: args.resolvedAt,
  };

  // Push to knowledge entries
  args.data.knowledgeEntries.push(entry);

  // Create lineage record
  const lineage: EntityLineageRecord = {
    id: args.store.nextId(args.data, 'lineage'),
    candidateId: args.candidate.id,
    relationshipType: 'published_as',
    sourceType: 'candidate',
    sourceId: args.candidate.id,
    targetType: 'trap',
    targetId: entry.id,
    createdAt: args.resolvedAt,
    notes: 'Published as independent trap after duplicate resolution',
  };

  // Lineage is returned for the caller to flush via LineageRepository.
  return { entry, lineage };
}

/**
 * Create a SkillArtifactRecord from a skill candidate.
 * The new artifact starts at 'agent-pass' lifecycle state.
 */
export function publishSkillCandidate(args: {
  store: SkillShareerStore;
  data: StoreData;
  candidate: CandidateSubmission;
  resolvedBy: string;
  resolvedAt: string;
}): { artifact: SkillArtifactRecord; lineage: EntityLineageRecord } {
  if (!args.candidate.originalPayload.skill) {
    throw new Error('Candidate has no skill payload');
  }

  const skillPayload = args.candidate.originalPayload.skill;

  // Create skill artifact with agent-pass state
  const artifact: SkillArtifactRecord = {
    id: args.store.nextId(args.data, 'artifact'),
    teamId: args.candidate.teamId,
    scope: 'global', // Default scope for skills
    labels: skillPayload.metadata.labels,
    title: skillPayload.metadata.title || 'Untitled Skill',
    slug: skillPayload.metadata.slug || `skill-${Date.now()}`,
    requiredLevel: 0,
    lifecycleState: 'agent-pass',
    ownerUserId: args.candidate.submittedBy,
    latestRevision: {
      revision: 1,
      sourceHash: '', // Will be computed from files
      files: skillPayload.files.map((f) => ({
        path: f.path,
        kind: 'skill-markdown' as const,
        sha256: f.sha256,
        sizeBytes: f.sizeBytes,
        mediaType: f.mediaType,
        source: 'SKILL.md',
        includeInDerivation: true,
        activationOnly: false,
      })),
      submittedAt: args.resolvedAt,
      submittedByUserId: args.candidate.submittedBy,
      scriptDescriptors: [],
      derived: null,
    },
    history: [],
    metadata: {
      sourceKind: 'skill-directory',
      submissionCount: 1,
      resubmissionCount: 0,
      revisionCount: 1,
      latestSubmissionId: null,
      latestSubmittedAt: args.resolvedAt,
      latestReviewedAt: args.resolvedAt,
      latestDecision: null,
    },
    agentReview: {
      status: 'agent-pass',
      duplicateRisk: 'low',
      correctnessRisk: 'low',
      completenessRisk: 'low',
      checkedAt: args.resolvedAt,
      notes: ['Published from candidate submission after duplicate review'],
    },
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [
      {
        id: args.store.nextId(args.data, 'artifact_event'),
        type: 'submitted',
        createdAt: args.resolvedAt,
        actorUserId: args.candidate.submittedBy,
        submissionId: null,
        revision: 1,
        state: 'submitted',
        note: 'Published from candidate after duplicate resolution',
      },
      {
        id: args.store.nextId(args.data, 'artifact_event'),
        type: 'agent-reviewed',
        createdAt: args.resolvedAt,
        actorUserId: null,
        submissionId: null,
        revision: 1,
        state: 'agent-pass',
        note: 'Auto-approved after duplicate resolution',
      },
    ],
    decayMeta: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    boundary: null,
    createdAt: args.resolvedAt,
    updatedAt: args.resolvedAt,
  };

  // Push to skill artifacts
  args.data.skillArtifacts.push(artifact);

  // Create lineage record
  const lineage: EntityLineageRecord = {
    id: args.store.nextId(args.data, 'lineage'),
    candidateId: args.candidate.id,
    relationshipType: 'published_as',
    sourceType: 'candidate',
    sourceId: args.candidate.id,
    targetType: 'skill',
    targetId: artifact.id,
    createdAt: args.resolvedAt,
    notes: 'Published as independent skill after duplicate resolution',
  };

  // Lineage is returned for the caller to flush via LineageRepository.
  return { artifact, lineage };
}
