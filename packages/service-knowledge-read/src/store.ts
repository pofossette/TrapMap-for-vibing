import type {
  AgentReviewRecord,
  BadcaseTaxonomy,
  Boundary,
  ClientManifestRecord,
  ConflictRelation,
  DecayMeta,
  DerivedSkillCapsuleRecord,
  DerivedSkillProfileRecord,
  EvidenceMeta,
  FeedbackProblemType,
  FeedbackRemediationState,
  KnowledgeRecord,
  LifecycleState,
  MaintenanceMetaRecord,
  Scope,
  ScriptActivationPolicy,
  StoredScriptActivationPolicy,
} from '@trapmap/contracts';

export type {
  AdapterSyncState,
  AgentReviewRecord,
  ClientManifestAssetRecord,
  ClientManifestRecord,
  ClientManifestReferenceRecord,
  ClientManifestScriptRecord,
  DerivedSkillCapsuleRecord,
  DerivedSkillProfileRecord,
  EmbeddingCacheRecord,
  KeywordAdapterSyncState,
  KnowledgeIndexStateRecord,
  KnowledgeKeywordPersistedState,
  KnowledgeLifecycleEventRecord,
  KnowledgeMetadataRecord,
  KnowledgeRecord,
  KnowledgeRevisionRecord,
  KnowledgeReviewDecisionRecord,
  KnowledgeReviewNoteRecord,
  KnowledgeSubmissionRecord,
  MaintenanceMetaRecord,
  StoredScriptActivationPolicy,
} from '@trapmap/contracts';

export interface SkillArtifactFileRecord {
  path: string;
  kind: 'skill-markdown' | 'reference' | 'asset' | 'script';
  sha256: string;
  sizeBytes: number;
  mediaType: string;
  source: 'references/' | 'assets/' | 'scripts/' | 'SKILL.md';
  includeInDerivation: boolean;
  activationOnly: boolean;
}

export interface SkillScriptDescriptorRecord {
  path: string;
  sha256: string;
  capability: string;
  argsSchemaSummary: string;
  sideEffectSummary: string;
  defaultPolicy: StoredScriptActivationPolicy;
}

export interface SkillArtifactDerivedRecord {
  profile: DerivedSkillProfileRecord | null;
  capsules: DerivedSkillCapsuleRecord[];
  clientManifest: ClientManifestRecord | null;
  sourceHash: string;
  derivedAt: string;
}

export interface SkillArtifactReviewNoteRecord {
  id: string;
  createdAt: string;
  authorType: 'submitter' | 'agent' | 'reviewer' | 'system';
  authorUserId: string | null;
  message: string;
}

export interface SkillArtifactReviewDecisionRecord {
  decidedAt: string;
  decidedByUserId: string;
  decision: 'approve' | 'reject';
  notes: string;
}

export interface SkillArtifactLifecycleEventRecord {
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

export interface SkillArtifactMetadataRecord {
  sourceKind: 'skill-directory' | 'single-skill-md' | 'legacy-knowledge';
  submissionCount: number;
  resubmissionCount: number;
  revisionCount: number;
  latestSubmissionId: string | null;
  latestSubmittedAt: string | null;
  latestReviewedAt: string | null;
  latestDecision: 'approve' | 'reject' | null;
}

export interface SkillArtifactRevisionRecord {
  revision: number;
  sourceHash: string;
  files: SkillArtifactFileRecord[];
  submittedAt: string;
  submittedByUserId: string;
  scriptDescriptors: SkillScriptDescriptorRecord[];
  derived: SkillArtifactDerivedRecord | null;
}

export interface SkillArtifactRecord {
  id: string;
  teamId: string | null;
  scope: Scope;
  labels: string[];
  title: string;
  slug: string;
  requiredLevel: number;
  lifecycleState: LifecycleState;
  ownerUserId: string;
  latestRevision: SkillArtifactRevisionRecord;
  history: SkillArtifactRevisionRecord[];
  metadata: SkillArtifactMetadataRecord;
  agentReview: AgentReviewRecord | null;
  reviewHistory: SkillArtifactReviewDecisionRecord[];
  reviewNotes: SkillArtifactReviewNoteRecord[];
  lifecycleHistory: SkillArtifactLifecycleEventRecord[];
  boundary: Boundary | null;
  decayMeta: DecayMeta | null;
  evidenceMeta: EvidenceMeta | null;
  maintenanceMeta: MaintenanceMetaRecord | null;
  remediation?: FeedbackRemediationState | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackQueueRecord {
  id: string;
  entryId: string;
  entryType: 'trap' | 'skill';
  problemType: FeedbackProblemType;
  description: string;
  context: string | null;
  querySeed: string | null;
  queryId: string | null;
  routeFamily: 'entry' | 'capsule' | 'graph-plan' | null;
  failureClassification: BadcaseTaxonomy | null;
  expectedCorrection: string | null;
  selectedResultSnapshot: Record<string, unknown> | null;
  customAnswers: Array<{ prompt: string; answer: string }> | null;
  submittedAt: string;
  submittedByUserId: string;
  submittedByHandle: string;
  status: 'new' | 'triaged' | 'resolved' | 'dismissed';
  adminNotes: string | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  triggeredTransition: string | null;
  remediationStatus?: 'pending-human-review' | 'in-remediation' | 'ready-to-reindex' | null;
  remediationOpenedAt?: string | null;
  remediationOpenedByUserId?: string | null;
  remediationResolvedAt?: string | null;
  remediationResolvedByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoreData {
  knowledgeEntries: KnowledgeRecord[];
  conflicts: ConflictRelation[];
}
