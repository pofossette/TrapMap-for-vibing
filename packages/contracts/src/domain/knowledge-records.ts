import type { ScriptActivationPolicy } from './artifacts.js';
import type { Boundary } from './boundary.js';
import type { LifecycleState, Scope } from './common.js';
import type { DecayMeta } from './decay.js';
import type { EvidenceMeta } from './evidence.js';
import type { FeedbackRemediationState } from './feedback.js';

/**
 * Persistence record shapes for knowledge entries and skill artifact
 * derivation outputs. Single source of truth shared by
 * service-knowledge-read (store), service-knowledge-write and
 * service-governance-review.
 *
 * Note: these are the raw stored shapes (userId-style actor references),
 * distinct from the API-facing zod shapes in knowledge.ts which use
 * actorRef-style references.
 */

export interface AdapterSyncState {
  status: 'pending' | 'synced' | 'failed';
  revision: number;
  contentHash: string;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface KnowledgeKeywordPersistedState {
  tokens: string[];
  fieldTokens: {
    shortcut: string[];
    detail: string[];
    labels: string[];
  };
}

export interface KeywordAdapterSyncState extends AdapterSyncState {
  persistedState?: KnowledgeKeywordPersistedState;
}

export interface KnowledgeIndexStateRecord {
  contentHash: string;
  normalizedAt: string;
  adapters: Record<string, AdapterSyncState>;
  vector?: AdapterSyncState;
  keyword?: KeywordAdapterSyncState;
  graph?: AdapterSyncState;
}

export interface KnowledgeReviewNoteRecord {
  id: string;
  createdAt: string;
  authorType: 'submitter' | 'agent' | 'reviewer' | 'system';
  authorUserId: string | null;
  message: string;
}

export interface AgentReviewRecord {
  status: 'agent-pass' | 'agent-rejected';
  duplicateRisk: 'low' | 'medium' | 'high';
  correctnessRisk: 'low' | 'medium' | 'high';
  completenessRisk: 'low' | 'medium' | 'high';
  checkedAt: string;
  notes: string[];
}

export interface KnowledgeReviewDecisionRecord {
  decidedAt: string;
  decidedByUserId: string;
  decision: 'approve' | 'reject';
  notes: string;
}

export interface KnowledgeSubmissionRecord {
  id: string;
  revision: number;
  submittedAt: string;
  submittedByUserId: string;
  lifecycleState: LifecycleState;
  resubmissionOf: string | null;
  agentReview: AgentReviewRecord | null;
  reviewerDecision: KnowledgeReviewDecisionRecord | null;
  reviewNotes: KnowledgeReviewNoteRecord[];
}

export interface KnowledgeLifecycleEventRecord {
  id: string;
  type:
    | 'submitted'
    | 'resubmitted'
    | 'agent-reviewed'
    | 'reviewer-approved'
    | 'reviewer-rejected'
    | 'updated'
    | 'deactivated';
  createdAt: string;
  actorUserId: string | null;
  submissionId: string | null;
  revision: number | null;
  state: LifecycleState;
  note: string | null;
}

export interface KnowledgeMetadataRecord {
  scopeLabel: 'global-constraint' | 'project-knowledge';
  submissionCount: number;
  resubmissionCount: number;
  revisionCount: number;
  latestSubmissionId: string | null;
  latestSubmittedAt: string | null;
  latestReviewedAt: string | null;
  latestDecision: 'approve' | 'reject' | null;
}

export interface EmbeddingCacheRecord {
  textHash: string;
  vector: number[];
  createdAt: string;
  revision: number;
}

export interface MaintenanceMetaRecord {
  maintainerUserId: string | null;
  maintainerHandle: string | null;
  maintainerLevel: number | null;
  reviewBy: string | null;
}

export interface KnowledgeRevisionRecord {
  revision: number;
  submittedAt: string;
  submittedByUserId: string;
  shortcut: string;
  detail: string;
  labels: string[];
  reviewNotes: KnowledgeReviewNoteRecord[];
}

export interface KnowledgeRecord {
  id: string;
  teamId: string | null;
  scope: Scope;
  labels: string[];
  shortcut: string;
  detail: string;
  requiredLevel: number;
  lifecycleState: LifecycleState;
  ownerUserId: string;
  latestRevision: KnowledgeRevisionRecord;
  history: KnowledgeRevisionRecord[];
  metadata: KnowledgeMetadataRecord;
  latestSubmissionId: string | null;
  submissionHistory: KnowledgeSubmissionRecord[];
  agentReview: AgentReviewRecord | null;
  reviewHistory: KnowledgeReviewDecisionRecord[];
  reviewNotes: KnowledgeReviewNoteRecord[];
  lifecycleHistory: KnowledgeLifecycleEventRecord[];
  embeddingCache: EmbeddingCacheRecord | null;
  indexState: KnowledgeIndexStateRecord | null;
  boundary: Boundary | null;
  decayMeta: DecayMeta | null;
  evidenceMeta: EvidenceMeta | null;
  maintenanceMeta: MaintenanceMetaRecord | null;
  remediation?: FeedbackRemediationState | null;
  createdAt: string;
  updatedAt: string;
}

export type StoredScriptActivationPolicy = ScriptActivationPolicy | 'manual' | 'auto';

export interface ClientManifestReferenceRecord {
  path: string;
  sha256: string;
  sizeBytes: number;
  mediaType: string;
}

export interface ClientManifestAssetRecord {
  path: string;
  sha256: string;
  sizeBytes: number;
  mediaType: string;
}

export interface ClientManifestScriptRecord {
  path: string;
  sha256: string;
  capability: string;
  argsSchemaSummary: string;
  sideEffectSummary: string;
  defaultPolicy: StoredScriptActivationPolicy;
}

export interface ClientManifestRecord {
  artifactId: string;
  revision: number;
  references: ClientManifestReferenceRecord[];
  assets: ClientManifestAssetRecord[];
  scripts: ClientManifestScriptRecord[];
  sourceHash: string;
}

export interface DerivedSkillProfileRecord {
  artifactId: string;
  revision: number;
  sourceHash: string;
  title: string;
  description?: string;
  summary: string;
  keywords: string[];
  labels?: string[];
  prerequisites?: string[];
  referencePaths: string[];
  contentHash: string;
}

export interface DerivedSkillCapsuleRecord {
  capsuleId: string;
  artifactId: string;
  revision: number;
  sourcePaths: string[];
  content: string;
  situation: string | null;
  problem: string | null;
  goal: string | null;
  errorText: string | null;
  contextualPrefix?: string;
  labels: string[];
  scope: Scope;
  requiredLevel: number;
}
