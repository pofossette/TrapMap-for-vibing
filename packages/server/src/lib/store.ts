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

export interface StoreData {
  counters: Record<string, number>;
  users: UserRecord[];
  teams: TeamRecord[];
  memberships: MembershipRecord[];
  accessKeys: AccessKeyRecord[];
  sessions: SessionRecord[];
  knowledgeEntries: KnowledgeRecord[];
  auditEvents: AuditEventRecord[];
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
