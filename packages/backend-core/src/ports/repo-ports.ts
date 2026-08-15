/**
 * Repository port interfaces.
 *
 * These are host-agnostic repository contracts that define the persistence
 * shape required by backend-core bounded-context modules. Host assemblies
 * (local-agent, team-monolith, distributed) provide concrete implementations
 * backed by JSON store, PostgreSQL, or any other persistence layer.
 *
 * The interfaces mirror the existing repository interfaces in `packages/server`
 * but are decoupled from `pg`, `SkillShareerStore`, and implementation details.
 * Record types are re-exported from `@trapmap/contracts` where available.
 */

import type {
  AnalysisSnapshot,
  CandidateStatus,
  CandidateSubmission,
  DuplicateCase,
  LifecycleState,
  ManualResultSubmission,
} from '@trapmap/contracts';

// ---------------------------------------------------------------------------
// Shared record stubs — these reference the server's record types.
// A future refactor may move canonical record types into @trapmap/contracts.
// For now we define minimal structural types that host assemblies can extend.
// ---------------------------------------------------------------------------

/** Minimal shape of a knowledge entry record as seen by application logic. */
export interface KnowledgeEntryRecord {
  id: string;
  content: string;
  lifecycleState: LifecycleState;
  ownerUserId: string;
  teamId: string;
  [key: string]: unknown;
}

/** Minimal shape of a knowledge revision record. */
export interface KnowledgeRevisionRecord {
  id: string;
  [key: string]: unknown;
}

/** Minimal shape of a knowledge lifecycle event record. */
export interface KnowledgeLifecycleEventRecord {
  id: string;
  type: string;
  createdAt: string;
  actorUserId: string;
  submissionId: string | null;
  revision: unknown;
  state: LifecycleState | null;
  note: string | null;
}

/** Minimal shape of an embedding cache record. */
export interface EmbeddingCacheRecord {
  [key: string]: unknown;
}

/** Minimal shape of a session record. */
export interface SessionRecord {
  id: string;
  subjectType: 'user' | 'system-admin';
  userId: string | null;
  tokenHash: string;
  activeTeamId: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

/** Minimal shape of an access key record. */
export interface AccessKeyRecord {
  id: string;
  tokenHash: string;
  memberId: string;
  revokedAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

/** Minimal shape of a team record. */
export interface TeamRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt?: string;
  [key: string]: unknown;
}

/** Minimal shape of a membership record. */
export interface MembershipRecord {
  id: string;
  userId: string;
  teamId: string;
  roleTemplate: 'admin' | 'editor' | 'viewer' | 'system-admin';
  securityLevel: number;
  permissions: string[];
  notes: string | null;
  createdAt: string;
  updatedAt?: string;
  [key: string]: unknown;
}

/** Minimal shape of a user record. */
export interface UserRecord {
  id: string;
  handle: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

/** Minimal shape of a feedback queue record. */
export interface FeedbackQueueRecord {
  id: string;
  entryId: string;
  status: string;
  problemType: string;
  entryType?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

/** Minimal shape of an audit event record. */
export interface AuditEventRecord {
  id: string;
  action: string;
  actorId: string;
  entityId?: string;
  teamId?: string;
  createdAt: string;
  eventVersion?: number;
  sourceService?: string;
  requestId?: string;
  traceId?: string;
  operationId?: string;
  causationId?: string;
  outcome?: 'success' | 'rejected' | 'failed';
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Knowledge repository port
// ---------------------------------------------------------------------------

export interface KnowledgeRepositoryPort {
  nextId(): Promise<string>;
  insert(entry: KnowledgeEntryRecord): Promise<void>;
  getById(entryId: string): Promise<KnowledgeEntryRecord | null>;
  getByIds?(entryIds: string[]): Promise<KnowledgeEntryRecord[]>;
  updateLifecycle(
    entryId: string,
    newState: LifecycleState,
    context: { actorId: string; note?: string },
  ): Promise<KnowledgeEntryRecord>;
  appendRevision(entryId: string, revision: KnowledgeRevisionRecord): Promise<void>;
  appendLifecycleEvent(entryId: string, event: KnowledgeLifecycleEventRecord): Promise<void>;
  listByFilter(filter: {
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
    labels?: string[];
  }): Promise<KnowledgeEntryRecord[]>;
  updateGovernance(
    entryId: string,
    governance: { labels?: string[]; requiredLevel?: number },
  ): Promise<void>;
  updateEmbeddingCache(entryId: string, cache: EmbeddingCacheRecord): Promise<void>;
  supersede(
    entryId: string,
    input: { replacementId: string; actorId: string },
  ): Promise<KnowledgeEntryRecord>;
  save?(entry: KnowledgeEntryRecord): Promise<void>;
}

// ---------------------------------------------------------------------------
// Candidate repository port
// ---------------------------------------------------------------------------

export interface CandidateRepositoryPort {
  insert(candidate: CandidateSubmission): Promise<void>;
  getById(candidateId: string): Promise<CandidateSubmission | null>;
  updateStatus(candidateId: string, status: CandidateStatus, error?: string): Promise<void>;
  attachAnalysis(candidateId: string, snapshot: AnalysisSnapshot): Promise<void>;
  attachDuplicateCase(candidateId: string, duplicateCase: DuplicateCase): Promise<void>;
  attachManualResult(
    candidateId: string,
    result: ManualResultSubmission,
    reviewedBy: string,
  ): Promise<void>;
  listByStatus(status: CandidateStatus): Promise<CandidateSubmission[]>;
  markResolved(candidateId: string, resolvedBy: string): Promise<void>;
  findByFingerprint(fingerprint: string): Promise<string | null>;
}

// ---------------------------------------------------------------------------
// Identity repository ports
// ---------------------------------------------------------------------------

export interface SessionRepositoryPort {
  nextId(): Promise<string>;
  create(session: Omit<SessionRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<SessionRecord>;
  getByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
  updateActiveTeam(sessionId: string, teamId: string | null): Promise<SessionRecord>;
}

export interface AccessKeyRepositoryPort {
  nextId(): Promise<string>;
  insert(key: AccessKeyRecord): Promise<void>;
  getByTokenHash(tokenHash: string): Promise<AccessKeyRecord | null>;
  getById(keyId: string): Promise<AccessKeyRecord | null>;
  revoke(keyId: string): Promise<void>;
  listByMember(memberId: string): Promise<AccessKeyRecord[]>;
}

// ---------------------------------------------------------------------------
// Team / membership repository ports
// ---------------------------------------------------------------------------

export interface TeamRepositoryPort {
  nextId(): Promise<string>;
  insert(team: TeamRecord): Promise<void>;
  getById(teamId: string): Promise<TeamRecord | null>;
  getBySlug(slug: string): Promise<TeamRecord | null>;
  listAll(): Promise<TeamRecord[]>;
  update(teamId: string, updates: Partial<TeamRecord>): Promise<void>;
}

export interface MembershipRepositoryPort {
  nextId(): Promise<string>;
  insert(membership: MembershipRecord): Promise<void>;
  getById(membershipId: string): Promise<MembershipRecord | null>;
  findByUserAndTeam(userId: string, teamId: string): Promise<MembershipRecord | null>;
  listByUser(userId: string): Promise<MembershipRecord[]>;
  listByTeam(teamId: string): Promise<MembershipRecord[]>;
  update(membershipId: string, updates: Partial<MembershipRecord>): Promise<void>;
}

// ---------------------------------------------------------------------------
// User repository port
// ---------------------------------------------------------------------------

export interface UserRepositoryPort {
  nextId(): Promise<string>;
  insert(user: UserRecord): Promise<void>;
  getById(userId: string): Promise<UserRecord | null>;
  getByHandle(handle: string): Promise<UserRecord | null>;
  update(userId: string, updates: Partial<UserRecord>): Promise<void>;
}

// ---------------------------------------------------------------------------
// Feedback repository port
// ---------------------------------------------------------------------------

export interface FeedbackRepositoryPort {
  nextId(): Promise<string>;
  insert(feedback: FeedbackQueueRecord): Promise<void>;
  getById(feedbackId: string): Promise<FeedbackQueueRecord | null>;
  listByEntry(entryId: string): Promise<FeedbackQueueRecord[]>;
  listByStatus(status: string): Promise<FeedbackQueueRecord[]>;
  listByFilter(filter: {
    status?: string[];
    problemType?: string[];
    entryId?: string;
    entryType?: string;
  }): Promise<FeedbackQueueRecord[]>;
  update(feedbackId: string, updates: Partial<FeedbackQueueRecord>): Promise<void>;
}

// ---------------------------------------------------------------------------
// Audit repository port
// ---------------------------------------------------------------------------

export interface AuditRepositoryPort {
  nextId(): Promise<string>;
  insert(event: AuditEventRecord): Promise<void>;
  getById(eventId: string): Promise<AuditEventRecord | null>;
  listByFilter(filter: {
    action?: string[];
    actorId?: string;
    entityId?: string;
    teamId?: string;
    requestId?: string;
    traceId?: string;
    operationId?: string;
    causationId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<{ items: AuditEventRecord[]; total: number }>;
}

// ---------------------------------------------------------------------------
// Aggregate repository bundle
// ---------------------------------------------------------------------------

export interface RepositoryPorts {
  knowledge: KnowledgeRepositoryPort;
  candidate: CandidateRepositoryPort;
  session: SessionRepositoryPort;
  accessKey: AccessKeyRepositoryPort;
  team: TeamRepositoryPort;
  membership: MembershipRepositoryPort;
  user: UserRepositoryPort;
  feedback: FeedbackRepositoryPort;
  audit: AuditRepositoryPort;
}
