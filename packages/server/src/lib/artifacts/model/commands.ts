/**
 * Artifact write operations: create and append revisions.
 *
 * Governance is inherited at the artifact boundary (T-12-07, T-12-08).
 * Assets are activation-only, scripts are descriptor-only (T-12-06).
 */

import type { AgentReviewResult } from '@trapmap/contracts';

import type { ArtifactRepository } from '@trapmap/server/lib/artifacts/repository.js';
import { transitionLifecycleState } from '@trapmap/server/lib/lifecycle/index.js';
import type {
  SkillArtifactRecord as ServerSkillArtifactRecord,
  SkillArtifactMetadataRecord,
  SkillArtifactRevisionRecord,
  SkillShareerStore,
  StoreData,
  StoredScriptActivationPolicy,
} from '@trapmap/server/lib/store.js';

import { createLifecycleEvent, toAgentReviewNotes, toAgentReviewRecord } from './helpers.js';

/**
 * Create a new skill artifact record.
 *
 * This creates an additive artifact aggregate beside knowledgeEntries (T-12-05).
 * Governance is stored at the artifact root (T-12-07).
 *
 * When artifactRepo is provided, uses repository for ID generation and persistence.
 * Otherwise falls back to store-based mutation (for JsonStore compatibility).
 */
export async function createSkillArtifactRecord(args: {
  store: SkillShareerStore;
  data: StoreData;
  artifactRepo?: ArtifactRepository;
  ownerUserId: string;
  teamId: string | null;
  payload: {
    scope: 'global' | 'project';
    labels: string[];
    title: string;
    slug: string;
    requiredLevel: number;
    files: Array<{
      path: string;
      kind: 'skill-markdown' | 'reference' | 'asset' | 'script';
      sha256: string;
      sizeBytes: number;
      mediaType: string;
      source: 'references/' | 'assets/' | 'scripts/' | 'SKILL.md';
      includeInDerivation: boolean;
      activationOnly: boolean;
    }>;
    scriptDescriptors: Array<{
      path: string;
      sha256: string;
      capability: string;
      argsSchemaSummary: string;
      sideEffectSummary: string;
      defaultPolicy: StoredScriptActivationPolicy;
    }>;
    sourceKind: 'skill-directory' | 'single-skill-md' | 'legacy-knowledge';
    /** Optional canonical source hash computed from derivation-eligible files */
    sourceHash?: string;
  };
  requiredLevel: number;
  createdAt: string;
  preReview: AgentReviewResult;
}): Promise<ServerSkillArtifactRecord> {
  const agentNotes = toAgentReviewNotes(args.store, args.data, args.preReview);
  const agentReview = toAgentReviewRecord(args.preReview);

  // Create initial revision
  // Note: sourceHash should be computed from normalized bundle using computeSourceHash()
  // The caller should provide a canonical source hash, not concatenated file hashes
  const revision: SkillArtifactRevisionRecord = {
    revision: 1,
    sourceHash: args.payload.sourceHash ?? args.payload.files.map((f) => f.sha256).join(''),
    files: args.payload.files,
    submittedAt: args.createdAt,
    submittedByUserId: args.ownerUserId,
    scriptDescriptors: args.payload.scriptDescriptors,
    derived: null, // Derived outputs will be computed in a later phase
  };

  // Generate artifact ID using repository if available
  const artifactId = args.artifactRepo
    ? await args.artifactRepo.nextId()
    : args.store.nextId(args.data, 'artifact');

  // Create metadata
  const metadata: SkillArtifactMetadataRecord = {
    sourceKind: args.payload.sourceKind,
    submissionCount: 1,
    resubmissionCount: 0,
    revisionCount: 1,
    latestSubmissionId: args.store.nextId(args.data, 'artifact_submission'),
    latestSubmittedAt: args.createdAt,
    latestReviewedAt: args.preReview.checkedAt,
    latestDecision: null,
  };

  // Create artifact record
  const artifact: ServerSkillArtifactRecord = {
    id: artifactId,
    teamId: args.teamId,
    scope: args.payload.scope,
    labels: args.payload.labels,
    title: args.payload.title,
    slug: args.payload.slug,
    requiredLevel: args.requiredLevel,
    lifecycleState: args.preReview.status === 'agent-pass' ? 'agent-pass' : 'agent-rejected',
    ownerUserId: args.ownerUserId,
    latestRevision: revision,
    history: [revision],
    metadata,
    agentReview,
    reviewHistory: [],
    reviewNotes: agentNotes,
    lifecycleHistory: [
      createLifecycleEvent(args.store, args.data, {
        type: 'submitted',
        createdAt: args.createdAt,
        actorUserId: args.ownerUserId,
        submissionId: metadata.latestSubmissionId,
        revision: 1,
        state: 'submitted',
        note: null,
      }),
      createLifecycleEvent(args.store, args.data, {
        type: 'agent-reviewed',
        createdAt: args.preReview.checkedAt,
        actorUserId: null,
        submissionId: metadata.latestSubmissionId,
        revision: 1,
        state: args.preReview.status,
        note: args.preReview.notes[0] ?? null,
      }),
    ],
    decayMeta: null,
    evidenceMeta: null,
    maintenanceMeta: null,
    boundary: null,
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
  };

  // Persist using repository if available, otherwise use store mutation
  if (args.artifactRepo) {
    await args.artifactRepo.insert(artifact);
  } else {
    // Add to skillArtifacts array (additive, not replacing knowledgeEntries)
    if (!args.data.skillArtifacts) {
      args.data.skillArtifacts = [];
    }
    args.data.skillArtifacts.push(artifact);
  }

  return artifact;
}

/**
 * Append a new revision to an existing skill artifact.
 *
 * This preserves governance at the artifact root while adding immutable revisions.
 *
 * When artifactRepo is provided, uses repository for persistence.
 * Otherwise falls back to in-memory mutation (for JsonStore compatibility).
 */
export async function appendSkillArtifactRevision(args: {
  store: SkillShareerStore;
  data: StoreData;
  artifactRepo?: ArtifactRepository;
  artifact: ServerSkillArtifactRecord;
  ownerUserId: string;
  payload: {
    files: Array<{
      path: string;
      kind: 'skill-markdown' | 'reference' | 'asset' | 'script';
      sha256: string;
      sizeBytes: number;
      mediaType: string;
      source: 'references/' | 'assets/' | 'scripts/' | 'SKILL.md';
      includeInDerivation: boolean;
      activationOnly: boolean;
    }>;
    scriptDescriptors: Array<{
      path: string;
      sha256: string;
      capability: string;
      argsSchemaSummary: string;
      sideEffectSummary: string;
      defaultPolicy: StoredScriptActivationPolicy;
    }>;
    /** Canonical source hash computed from derivation-eligible files */
    sourceHash: string;
  };
  submittedAt: string;
  preReview: AgentReviewResult;
}): Promise<ServerSkillArtifactRecord> {
  const agentNotes = toAgentReviewNotes(args.store, args.data, args.preReview);
  const agentReview = toAgentReviewRecord(args.preReview);
  const revisionNumber = args.artifact.history.length + 1;

  // Create new revision
  const revision: SkillArtifactRevisionRecord = {
    revision: revisionNumber,
    sourceHash: args.payload.sourceHash,
    files: args.payload.files,
    submittedAt: args.submittedAt,
    submittedByUserId: args.ownerUserId,
    scriptDescriptors: args.payload.scriptDescriptors,
    derived: null,
  };

  // Update metadata
  args.artifact.metadata.submissionCount += 1;
  args.artifact.metadata.revisionCount = revisionNumber;
  args.artifact.metadata.latestSubmissionId = args.store.nextId(args.data, 'artifact_submission');
  args.artifact.metadata.latestSubmittedAt = args.submittedAt;
  args.artifact.metadata.latestReviewedAt = args.preReview.checkedAt;
  args.artifact.metadata.latestDecision = null;

  // Update artifact
  transitionLifecycleState(
    args.artifact,
    args.preReview.status === 'agent-pass' ? 'agent-pass' : 'agent-rejected',
    'artifact revision resubmit',
  );
  args.artifact.latestRevision = revision;
  args.artifact.history.push(revision);
  args.artifact.agentReview = agentReview;
  args.artifact.reviewNotes.push(...agentNotes);
  args.artifact.lifecycleHistory.push(
    createLifecycleEvent(args.store, args.data, {
      type: 'submitted',
      createdAt: args.submittedAt,
      actorUserId: args.ownerUserId,
      submissionId: args.artifact.metadata.latestSubmissionId,
      revision: revisionNumber,
      state: 'submitted',
      note: null,
    }),
    createLifecycleEvent(args.store, args.data, {
      type: 'agent-reviewed',
      createdAt: args.preReview.checkedAt,
      actorUserId: null,
      submissionId: args.artifact.metadata.latestSubmissionId,
      revision: revisionNumber,
      state: args.preReview.status,
      note: args.preReview.notes[0] ?? null,
    }),
  );
  args.artifact.updatedAt = args.submittedAt;

  // Persist using repository if available
  if (args.artifactRepo) {
    await args.artifactRepo.appendRevision(args.artifact.id, revision);
  }

  return args.artifact;
}
