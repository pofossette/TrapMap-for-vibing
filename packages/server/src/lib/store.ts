import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { LifecycleState, Permission, RoleTemplate, Scope } from '@skill-shareer/contracts';

export interface UserRecord {
  id: string;
  handle: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeamRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipRecord {
  id: string;
  userId: string;
  teamId: string;
  roleTemplate: RoleTemplate;
  securityLevel: number;
  permissions: Permission[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccessKeyRecord {
  id: string;
  memberId: string;
  tokenHash: string;
  tokenPreview: string;
  issuedByUserId: string;
  teamId: string;
  level: number;
  notes: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  id: string;
  subjectType: 'user' | 'system-admin';
  userId: string | null;
  activeTeamId: string | null;
  tokenHash: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
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

/**
 * Cached embedding vector for retrieval.
 * Enables reusing embeddings across queries without recomputing.
 */
export interface EmbeddingCacheRecord {
  /** Hash of the text that was embedded (shortcut + detail + labels) */
  textHash: string;
  /** The embedding vector */
  vector: number[];
  /** Timestamp when this cache entry was created */
  createdAt: string;
  /** The revision number this embedding was computed from */
  revision: number;
}

/**
 * Adapter-specific sync status tracked in the store.
 * Used by the indexing pipeline to track per-adapter state.
 */
export interface AdapterSyncState {
  /** Current sync status */
  status: 'pending' | 'synced' | 'failed';
  /** Revision that was last synced */
  revision: number;
  /** Content hash that was last synced */
  contentHash: string;
  /** When this adapter was last synced */
  lastSyncedAt: string | null;
  /** Last error message (if sync failed) */
  lastError: string | null;
}

/**
 * Complete index state record persisted on KnowledgeRecord.
 * Tracks normalization and per-adapter sync status.
 */
export interface KnowledgeIndexStateRecord {
  /** SHA-256 hash of the normalized content */
  contentHash: string;
  /** When the content was last normalized */
  normalizedAt: string;
  /** Vector adapter sync state */
  vector: AdapterSyncState;
  /** Keyword adapter sync state */
  keyword: AdapterSyncState;
  /** Graph adapter sync state */
  graph: AdapterSyncState;
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
  /** Cached embedding for retrieval (null if not yet computed) */
  embeddingCache: EmbeddingCacheRecord | null;
  /** Index state for lifecycle-driven indexing (null if not yet indexed) */
  indexState: KnowledgeIndexStateRecord | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEventRecord {
  id: string;
  teamId: string | null;
  actorId: string;
  action: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/**
 * File record within a skill artifact revision.
 * Stores path, hash, and inclusion flags without content bodies.
 */
export interface SkillArtifactFileRecord {
  /** Canonical path within the skill directory (e.g., 'references/docker.md') */
  path: string;
  /** File kind controlling derivation and activation behavior */
  kind: 'skill-markdown' | 'reference' | 'asset' | 'script';
  /** SHA-256 hash of file content for integrity and derivation caching */
  sha256: string;
  /** File size in bytes for storage quota and transfer validation */
  sizeBytes: number;
  /** IANA media type (e.g., 'text/markdown', 'application/json') */
  mediaType: string;
  /** Source directory within the skill artifact */
  source: 'references/' | 'assets/' | 'scripts/' | 'SKILL.md';
  /** If true, file content may be used for capsule/profile derivation */
  includeInDerivation: boolean;
  /** If true, file is activation-only and should not be indexed for retrieval */
  activationOnly: boolean;
}

/**
 * Script capability descriptor for executable scripts in skill artifacts.
 * Captures intent and constraints without exposing script bodies in retrieval context.
 */
export interface SkillScriptDescriptorRecord {
  /** Path to the script file within the skill directory */
  path: string;
  /** SHA-256 hash of the script content */
  sha256: string;
  /** Human-readable capability description (e.g., 'Docker container cleanup') */
  capability: string;
  /** Brief summary of expected argument schema */
  argsSchemaSummary: string;
  /** Brief summary of side effects (e.g., 'Modifies local files') */
  sideEffectSummary: string;
  /** Default execution policy (e.g., 'manual', 'auto', 'blocked') */
  defaultPolicy: 'manual' | 'auto' | 'blocked';
}

/**
 * Derived profile record from SKILL.md and references/.
 * Captures the distilled artifact-wide text shape for model context.
 */
export interface DerivedSkillProfileRecord {
  /** Artifact identifier */
  artifactId: string;
  /** Revision number this profile was derived from */
  revision: number;
  /** Hash of all source files used for derivation */
  sourceHash: string;
  /** Human-readable title from skill metadata */
  title: string;
  /** Distilled summary of artifact content */
  summary: string;
  /** Keywords extracted from skill content */
  keywords: string[];
  /** Paths to reference files included in derivation */
  referencePaths: string[];
  /** Hash of the derived profile content for caching */
  contentHash: string;
}

/**
 * Knowledge capsule record distilled from SKILL.md and references/.
 * Carries deterministic capsule id, source paths, and governance inheritance.
 * Does NOT embed asset or script bodies (T-12-02 mitigation).
 */
export interface DerivedSkillCapsuleRecord {
  /** Unique capsule identifier */
  capsuleId: string;
  /** Artifact identifier */
  artifactId: string;
  /** Revision number this capsule was derived from */
  revision: number;
  /** Source file paths that contributed to this capsule */
  sourcePaths: string[];
  /** Distilled capsule content (text only, no asset/script bodies) */
  content: string;
  /** Situation context */
  situation: string;
  /** Problem statement */
  problem: string;
  /** Goal or solution */
  goal: string;
  /** Optional error text for error-specific capsules */
  errorText: string | null;
  /** Searchable labels */
  labels: string[];
  /** Governance scope (inherited from artifact) */
  scope: Scope;
  /** Required security level (inherited from artifact) */
  requiredLevel: number;
}

/**
 * Client manifest reference entry.
 * Metadata-only reference for activation-time delivery.
 */
export interface ClientManifestReferenceRecord {
  path: string;
  sha256: string;
  sizeBytes: number;
  mediaType: string;
}

/**
 * Client manifest asset entry.
 * Metadata-only asset for activation-time delivery.
 */
export interface ClientManifestAssetRecord {
  path: string;
  sha256: string;
  sizeBytes: number;
  mediaType: string;
}

/**
 * Client manifest script entry.
 * Metadata-only script descriptor (no body) for activation-time delivery.
 * Excludes script body text (T-12-02 mitigation).
 */
export interface ClientManifestScriptRecord {
  path: string;
  sha256: string;
  capability: string;
  argsSchemaSummary: string;
  sideEffectSummary: string;
  defaultPolicy: 'manual' | 'auto' | 'blocked';
}

/**
 * Client activation manifest record for references, assets, and scripts.
 * Exposes activation metadata while remaining distinct from retrieval output defaults.
 * Scripts are metadata-only (T-12-02 mitigation).
 */
export interface ClientManifestRecord {
  /** Artifact identifier */
  artifactId: string;
  /** Revision number this manifest was derived from */
  revision: number;
  /** Reference file metadata */
  references: ClientManifestReferenceRecord[];
  /** Asset file metadata */
  assets: ClientManifestAssetRecord[];
  /** Script metadata (capability only, no bodies) */
  scripts: ClientManifestScriptRecord[];
  /** Hash of all source files for this manifest */
  sourceHash: string;
}

/**
 * Derived output envelope for skill artifact revisions.
 * Contains cached deterministic outputs keyed by source content hash.
 */
export interface SkillArtifactDerivedRecord {
  /** Distilled profile from SKILL.md and references/ */
  profile: DerivedSkillProfileRecord | null;
  /** Knowledge capsules distilled from SKILL.md and references/ */
  capsules: DerivedSkillCapsuleRecord[];
  /** Client activation manifest for references, assets, and scripts */
  clientManifest: ClientManifestRecord | null;
  /** Hash of all source files used for derivation (SKILL.md + references/) */
  sourceHash: string;
  /** ISO timestamp when derivation was computed */
  derivedAt: string;
}

/**
 * Review note record for skill artifacts.
 */
export interface SkillArtifactReviewNoteRecord {
  id: string;
  createdAt: string;
  authorType: 'submitter' | 'agent' | 'reviewer' | 'system';
  authorUserId: string | null;
  message: string;
}

/**
 * Review decision record for skill artifacts.
 */
export interface SkillArtifactReviewDecisionRecord {
  decidedAt: string;
  decidedByUserId: string;
  decision: 'approve' | 'reject';
  notes: string;
}

/**
 * Lifecycle event record specific to skill artifacts.
 */
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

/**
 * Metadata record specific to skill artifacts.
 */
export interface SkillArtifactMetadataRecord {
  /** How this artifact was originally created */
  sourceKind: 'skill-directory' | 'single-skill-md' | 'legacy-knowledge';
  /** Total number of submissions across all revisions */
  submissionCount: number;
  /** Number of times this artifact was resubmitted after rejection */
  resubmissionCount: number;
  /** Total number of revisions */
  revisionCount: number;
  /** ID of the most recent submission */
  latestSubmissionId: string | null;
  /** When the most recent submission was created */
  latestSubmittedAt: string | null;
  /** When the most recent review was completed */
  latestReviewedAt: string | null;
  /** Most recent review decision (approve/reject) */
  latestDecision: 'approve' | 'reject' | null;
}

/**
 * Immutable revision record within a skill artifact.
 * Captures source file manifest and derived outputs at a point in time.
 */
export interface SkillArtifactRevisionRecord {
  /** Monotonically increasing revision number */
  revision: number;
  /** SHA-256 hash of all source files for this revision */
  sourceHash: string;
  /** All files in the skill directory at this revision */
  files: SkillArtifactFileRecord[];
  /** When this revision was submitted */
  submittedAt: string;
  /** Who submitted this revision */
  submittedByUserId: string;
  /** Script descriptors for executable scripts in this revision */
  scriptDescriptors: SkillScriptDescriptorRecord[];
  /** Cached derived outputs keyed by source hash */
  derived: SkillArtifactDerivedRecord | null;
}

/**
 * Canonical skill artifact aggregate root.
 * Stores governance, lifecycle, and revision history for skill-native artifacts.
 * Additive to legacy KnowledgeEntry - does not replace existing knowledge contracts.
 */
export interface SkillArtifactRecord {
  /** Unique artifact identifier */
  id: string;
  /** Team ID if this is a team-scoped artifact */
  teamId: string | null;
  /** Global or project scope */
  scope: Scope;
  /** Searchable labels for this artifact */
  labels: string[];
  /** Human-readable title */
  title: string;
  /** URL-friendly slug for references */
  slug: string;
  /** Required security level to access this artifact */
  requiredLevel: number;
  /** Current lifecycle state */
  lifecycleState: LifecycleState;
  /** Artifact owner/creator */
  ownerUserId: string;
  /** Currently active revision record */
  latestRevision: SkillArtifactRevisionRecord;
  /** Complete revision history */
  history: SkillArtifactRevisionRecord[];
  /** Artifact-specific metadata */
  metadata: SkillArtifactMetadataRecord;
  /** Agent review result (if applicable) */
  agentReview: AgentReviewRecord | null;
  /** Review decision history */
  reviewHistory: SkillArtifactReviewDecisionRecord[];
  /** Review notes from all reviewers */
  reviewNotes: SkillArtifactReviewNoteRecord[];
  /** Lifecycle event history */
  lifecycleHistory: SkillArtifactLifecycleEventRecord[];
  /** Created timestamp */
  createdAt: string;
  /** Updated timestamp */
  updatedAt: string;
}

/**
 * File payload storage record for imported artifact files.
 * Stores inline file content keyed by artifact id + revision + path.
 * Enables round-trip export without server-side filesystem behavior (IMEX-04).
 */
export interface ArtifactFilePayloadRecord {
  /** Artifact identifier */
  artifactId: string;
  /** Revision number */
  revision: number;
  /** Canonical path within the skill directory */
  path: string;
  /** SHA-256 hash of file content */
  sha256: string;
  /** File size in bytes */
  sizeBytes: number;
  /** IANA media type */
  mediaType: string;
  /** Inline file content: base64-encoded bytes or UTF-8 text */
  content: string;
  /** When this payload was stored */
  storedAt: string;
}

export interface StoreData {
  counters: Record<string, number>;
  users: UserRecord[];
  teams: TeamRecord[];
  memberships: MembershipRecord[];
  accessKeys: AccessKeyRecord[];
  sessions: SessionRecord[];
  knowledgeEntries: KnowledgeRecord[];
  auditEvents: AuditEventRecord[];
  /** Additive skill artifacts collection (ARTF-02, T-12-05) */
  skillArtifacts: SkillArtifactRecord[];
  /** Additive file payload storage for imported artifacts (IMEX-04) */
  artifactFilePayloads: ArtifactFilePayloadRecord[];
}

const EMPTY_STORE: StoreData = {
  counters: {},
  users: [],
  teams: [],
  memberships: [],
  accessKeys: [],
  sessions: [],
  knowledgeEntries: [],
  auditEvents: [],
  skillArtifacts: [],
  artifactFilePayloads: [],
};

function cloneEmptyStore(): StoreData {
  return JSON.parse(JSON.stringify(EMPTY_STORE)) as StoreData;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function createOpaqueToken(prefix: string): string {
  return `${prefix}_${randomBytes(18).toString('base64url')}`;
}

export function createSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export class JsonStore {
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async snapshot(): Promise<StoreData> {
    return this.read();
  }

  async transact<T>(mutator: (data: StoreData) => Promise<T> | T): Promise<T> {
    let result!: T;

    this.writeChain = this.writeChain.then(async () => {
      const data = await this.read();
      result = await mutator(data);
      await writeFile(this.filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    });

    await this.writeChain;

    return result;
  }

  nextId(data: StoreData, prefix: string): string {
    const nextValue = (data.counters[prefix] ?? 0) + 1;
    data.counters[prefix] = nextValue;
    return `${prefix}_${nextValue}`;
  }

  private async read(): Promise<StoreData> {
    await this.ensureFile();
    const raw = await readFile(this.filePath, 'utf8');
    return JSON.parse(raw) as StoreData;
  }

  private async ensureFile(): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      await readFile(this.filePath, 'utf8');
    } catch {
      await writeFile(this.filePath, `${JSON.stringify(cloneEmptyStore(), null, 2)}\n`, 'utf8');
    }
  }
}
