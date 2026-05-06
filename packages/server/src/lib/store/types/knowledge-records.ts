import type { Boundary, DecayMeta, EvidenceMeta, LifecycleState, Scope } from '@trapmap/contracts';
import type { KnowledgeIndexStateRecord } from '../../indexing/types.js';

export interface KnowledgeRevisionRecord {
  revision: number;
  submittedAt: string;
  submittedByUserId: string;
  shortcut: string;
  detail: string;
  labels: string[];
  reviewNotes: KnowledgeReviewNoteRecord[];
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
  createdAt: string;
  updatedAt: string;
}
