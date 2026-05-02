/**
 * Skill artifact model and persistence layer.
 *
 * This module provides:
 * - createSkillArtifactRecord(): Create a new artifact aggregate
 * - appendSkillArtifactRevision(): Add a new revision to an existing artifact
 * - toSkillArtifact(): Serialize server record to shared contract
 *
 * Governance is inherited at the artifact boundary (T-12-07, T-12-08).
 * Assets are activation-only, scripts are descriptor-only (T-12-06).
 */

import type { AgentReviewResult } from '@trapmap/contracts';
import { skillArtifactSchema } from '@trapmap/contracts';

import type {
  AgentReviewRecord,
  SkillArtifactRecord as ServerSkillArtifactRecord,
  SkillArtifactLifecycleEventRecord,
  SkillArtifactMetadataRecord,
  SkillArtifactRecord,
  SkillArtifactReviewDecisionRecord,
  SkillArtifactReviewNoteRecord,
  SkillArtifactRevisionRecord,
  SkillShareerStore,
  StoreData,
  StoredScriptActivationPolicy,
} from '../store.js';
import { nowIso } from '../store.js';

/**
 * Get a user from the store data.
 */
function getUser(data: StoreData, userId: string) {
  const user = data.users.find((candidate) => candidate.id === userId);
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }
  return user;
}

/**
 * Get membership level for a user in a team.
 */
function getMembershipLevel(
  data: StoreData,
  userId: string,
  teamId: string | null,
  fallbackLevel: number,
) {
  if (!teamId) {
    return fallbackLevel;
  }
  return (
    data.memberships.find((candidate) => candidate.userId === userId && candidate.teamId === teamId)
      ?.securityLevel ?? fallbackLevel
  );
}

/**
 * Convert a user ID to an actor ref.
 */
function toActorRef(data: StoreData, userId: string, teamId: string | null, fallbackLevel: number) {
  const user = getUser(data, userId);
  return {
    id: user.id,
    handle: user.handle,
    securityLevel: getMembershipLevel(data, userId, teamId, fallbackLevel),
  };
}

/**
 * Convert a server review decision to contract format.
 */
function toReviewDecision(
  data: StoreData,
  record: SkillArtifactReviewDecisionRecord,
  teamId: string | null,
  fallbackLevel: number,
) {
  return {
    decidedAt: record.decidedAt,
    decidedBy: toActorRef(data, record.decidedByUserId, teamId, fallbackLevel),
    decision: record.decision,
    notes: record.notes,
  };
}

/**
 * Convert a server review note to contract format.
 */
function toReviewNote(
  data: StoreData,
  record: SkillArtifactReviewNoteRecord,
  teamId: string | null,
  fallbackLevel: number,
) {
  return {
    id: record.id,
    createdAt: record.createdAt,
    authorType: record.authorType,
    author: record.authorUserId
      ? toActorRef(data, record.authorUserId, teamId, fallbackLevel)
      : null,
    message: record.message,
  };
}

/**
 * Convert a server lifecycle event to contract format.
 */
function toLifecycleEvent(
  data: StoreData,
  record: SkillArtifactLifecycleEventRecord,
  teamId: string | null,
  fallbackLevel: number,
) {
  return {
    id: record.id,
    type: record.type,
    createdAt: record.createdAt,
    actor: record.actorUserId ? toActorRef(data, record.actorUserId, teamId, fallbackLevel) : null,
    submissionId: record.submissionId,
    revision: record.revision,
    state: record.state,
    note: record.note,
  };
}

/**
 * Convert a server revision record to contract format.
 */
function toRevision(
  data: StoreData,
  record: SkillArtifactRevisionRecord,
  teamId: string | null,
  fallbackLevel: number,
) {
  return {
    revision: record.revision,
    sourceHash: record.sourceHash,
    files: record.files.map((f) => ({
      path: f.path,
      kind: f.kind,
      sha256: f.sha256,
      sizeBytes: f.sizeBytes,
      mediaType: f.mediaType,
      source: f.source,
      includeInDerivation: f.includeInDerivation,
      activationOnly: f.activationOnly,
    })),
    submittedAt: record.submittedAt,
    submittedBy: toActorRef(data, record.submittedByUserId, teamId, fallbackLevel),
    scriptDescriptors: record.scriptDescriptors,
    derived: record.derived
      ? {
          profile: record.derived.profile,
          capsules: record.derived.capsules,
          clientManifest: record.derived.clientManifest,
          sourceHash: record.derived.sourceHash,
          derivedAt: record.derived.derivedAt,
        }
      : null,
  };
}

/**
 * Create a lifecycle event record.
 */
function createLifecycleEvent(
  store: SkillShareerStore,
  data: StoreData,
  input: Omit<SkillArtifactLifecycleEventRecord, 'id'>,
): SkillArtifactLifecycleEventRecord {
  return {
    id: store.nextId(data, 'artifact_event'),
    ...input,
  };
}

/**
 * Convert agent review result to agent review record.
 */
function toAgentReviewRecord(review: AgentReviewResult): AgentReviewRecord {
  return {
    status: review.status,
    duplicateRisk: review.duplicateRisk,
    correctnessRisk: review.correctnessRisk,
    completenessRisk: review.completenessRisk,
    checkedAt: review.checkedAt,
    notes: review.notes,
  };
}

/**
 * Create review notes from agent review result.
 */
function toAgentReviewNotes(
  store: SkillShareerStore,
  data: StoreData,
  review: AgentReviewResult,
): SkillArtifactReviewNoteRecord[] {
  return review.notes.map((message) => ({
    id: store.nextId(data, 'artifact_note'),
    createdAt: review.checkedAt,
    authorType: 'agent',
    authorUserId: null,
    message,
  }));
}

/**
 * Create a new skill artifact record.
 *
 * This creates an additive artifact aggregate beside knowledgeEntries (T-12-05).
 * Governance is stored at the artifact root (T-12-07).
 */
export function createSkillArtifactRecord(args: {
  store: SkillShareerStore;
  data: StoreData;
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
}): ServerSkillArtifactRecord {
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
    id: args.store.nextId(args.data, 'artifact'),
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
    createdAt: args.createdAt,
    updatedAt: args.createdAt,
  };

  // Add to skillArtifacts array (additive, not replacing knowledgeEntries)
  if (!args.data.skillArtifacts) {
    args.data.skillArtifacts = [];
  }
  args.data.skillArtifacts.push(artifact);

  return artifact;
}

/**
 * Append a new revision to an existing skill artifact.
 *
 * This preserves governance at the artifact root while adding immutable revisions.
 */
export function appendSkillArtifactRevision(args: {
  store: SkillShareerStore;
  data: StoreData;
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
}): ServerSkillArtifactRecord {
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
  args.artifact.lifecycleState =
    args.preReview.status === 'agent-pass' ? 'agent-pass' : 'agent-rejected';
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

  return args.artifact;
}

/**
 * Serialize a server artifact record to the shared contract format.
 *
 * This preserves governance (scope, teamId, requiredLevel) and audit lineage
 * (reviewHistory, lifecycleHistory) as required by T-12-07 and T-12-08.
 */
export function toSkillArtifact(data: StoreData, record: ServerSkillArtifactRecord) {
  const owner = toActorRef(data, record.ownerUserId, record.teamId, record.requiredLevel);

  return skillArtifactSchema.parse({
    id: record.id,
    teamId: record.teamId,
    scope: record.scope,
    labels: record.labels,
    title: record.title,
    slug: record.slug,
    requiredLevel: record.requiredLevel,
    lifecycleState: record.lifecycleState,
    owner,
    latestRevision: record.latestRevision.revision,
    history: record.history.map((revision) =>
      toRevision(data, revision, record.teamId, record.requiredLevel),
    ),
    metadata: record.metadata,
    agentReview: record.agentReview,
    reviewHistory: record.reviewHistory.map((decision) =>
      toReviewDecision(data, decision, record.teamId, record.requiredLevel),
    ),
    reviewNotes: record.reviewNotes.map((note) =>
      toReviewNote(data, note, record.teamId, record.requiredLevel),
    ),
    lifecycleHistory: record.lifecycleHistory.map((event) =>
      toLifecycleEvent(data, event, record.teamId, record.requiredLevel),
    ),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}

/**
 * Apply derived outputs to a revision record.
 *
 * This persists the derived outputs on the revision for caching.
 * The outputs are keyed by sourceHash so downstream phases can
 * consume them without recomputing derivation.
 *
 * T-12-11: Persist derived outputs on governed revisions
 * T-12-12: Cache outputs for downstream consumption
 *
 * @param data - Store data
 * @param artifact - Skill artifact record
 * @param revision - Artifact revision to update
 * @param derived - Derived outputs to apply
 * @returns Updated artifact record
 */
export function applyDerivedArtifactOutputs(
  data: StoreData,
  artifact: SkillArtifactRecord,
  revision: SkillArtifactRevisionRecord,
  derived: {
    profile: {
      artifactId: string;
      revision: number;
      sourceHash: string;
      title: string;
      summary: string;
      keywords: string[];
      referencePaths: string[];
      contentHash: string;
    } | null;
    capsules: Array<{
      capsuleId: string;
      artifactId: string;
      revision: number;
      sourcePaths: string[];
      content: string;
      situation: string;
      problem: string;
      goal: string;
      errorText: string | null;
      labels: string[];
      scope: 'global' | 'project';
      requiredLevel: number;
    }>;
    clientManifest: {
      artifactId: string;
      revision: number;
      references: Array<{
        path: string;
        sha256: string;
        sizeBytes: number;
        mediaType: string;
      }>;
      assets: Array<{
        path: string;
        sha256: string;
        sizeBytes: number;
        mediaType: string;
      }>;
      scripts: Array<{
        path: string;
        sha256: string;
        capability: string;
        argsSchemaSummary: string;
        sideEffectSummary: string;
        defaultPolicy: StoredScriptActivationPolicy;
      }>;
      sourceHash: string;
    } | null;
    sourceHash: string;
    derivedAt: string;
  },
): SkillArtifactRecord {
  // Create derived record
  const derivedRecord = {
    profile: derived.profile,
    capsules: derived.capsules,
    clientManifest: derived.clientManifest,
    sourceHash: derived.sourceHash,
    derivedAt: derived.derivedAt,
  };

  // Update the revision with derived outputs
  revision.derived = derivedRecord;

  // Update the artifact's latestRevision reference
  artifact.latestRevision = revision;

  // Update the revision in history
  const historyIndex = artifact.history.findIndex((h) => h.revision === revision.revision);
  if (historyIndex !== -1) {
    artifact.history[historyIndex] = revision;
  }

  return artifact;
}
