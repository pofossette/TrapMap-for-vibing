import type {
  Boundary,
  ConflictRelation,
  DecayMeta,
  FeedbackRemediationState,
  LifecycleState,
  Scope,
  ScriptActivationPolicy,
} from '@trapmap/contracts';

export interface EmbeddingCacheRecord {
  textHash: string;
  vector: number[];
  createdAt: string;
  revision: number;
}

export interface KnowledgeRevisionRecord {
  revision: number;
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
  history: KnowledgeRevisionRecord[];
  embeddingCache: EmbeddingCacheRecord | null;
  boundary: Boundary | null;
  decayMeta: DecayMeta | null;
  remediation?: FeedbackRemediationState | null;
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
  defaultPolicy: ScriptActivationPolicy | 'manual' | 'auto';
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
  capsules: DerivedSkillCapsuleRecord[];
  clientManifest: ClientManifestRecord | null;
}

export interface SkillArtifactRevisionRecord {
  revision: number;
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
  latestRevision: SkillArtifactRevisionRecord;
  boundary: Boundary | null;
  decayMeta: DecayMeta | null;
  remediation?: FeedbackRemediationState | null;
}

export interface FeedbackQueueRecord {
  entryId: string;
  entryType: 'trap' | 'skill';
  status: 'new' | 'triaged' | 'resolved' | 'dismissed';
  remediationStatus?: 'pending-human-review' | 'in-remediation' | 'ready-to-reindex' | null;
}

export interface StoreData {
  knowledgeEntries: KnowledgeRecord[];
  conflicts: ConflictRelation[];
}
