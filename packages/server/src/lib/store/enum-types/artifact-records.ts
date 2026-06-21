import type {
  Boundary,
  DecayMeta,
  EvidenceMeta,
  FeedbackRemediationState,
  LifecycleState,
  Scope,
  ScriptActivationPolicy,
} from '@trapmap/contracts';
import type { AgentReviewRecord, MaintenanceMetaRecord } from './knowledge-records.js';

export type StoredScriptActivationPolicy = ScriptActivationPolicy | 'manual' | 'auto';

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

export interface ArtifactFilePayloadRecord {
  artifactId: string;
  revision: number;
  path: string;
  sha256: string;
  sizeBytes: number;
  mediaType: string;
  content: string;
  storedAt: string;
}

// Re-export AgentReviewRecord and MaintenanceMetaRecord from knowledge-records for artifact use
export type { AgentReviewRecord, MaintenanceMetaRecord } from './knowledge-records.js';
