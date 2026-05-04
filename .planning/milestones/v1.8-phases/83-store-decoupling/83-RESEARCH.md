# Phase 83: Store Decoupling - Research Summary

**Research Date:** 2026-05-05
**Researcher:** Claude Opus 4.6
**Objective:** Answer "What do I need to know to PLAN this phase well?"

---

## Executive Summary

**Critical Discovery:** The repository pattern already exists in the codebase (Phases 61-63), but is in a **dual-write transition phase** rather than being the primary data access pattern. The actual work for Phase 83 is **completing the migration** from `store.transact()` to repository-based access, not introducing the pattern from scratch.

---

## 1. Current State Analysis

### 1.1 Store.ts Structure (774 lines)

**Location:** `packages/server/src/lib/store.ts`

**Contents:**
- **33+ TypeScript interfaces** defining record types
- **StoreData interface** with 15 collection fields
- **SkillShareerStore interface** (3 methods: `snapshot()`, `transact()`, `nextId()`)
- **JsonStore class** - file-backed implementation
- **Helper functions:** `nowIso()`, `hashSecret()`, `createOpaqueToken()`, `createSlug()`, `createEmptyStoreData()`, `cloneStoreData()`

**Key Interfaces Defined:**
```typescript
// Core Records
UserRecord, TeamRecord, MembershipRecord
AccessKeyRecord, SessionRecord

// Knowledge Domain
KnowledgeRecord, KnowledgeRevisionRecord
KnowledgeSubmissionRecord, KnowledgeReviewDecisionRecord
KnowledgeLifecycleEventRecord, AgentReviewRecord

// Artifact Domain
SkillArtifactRecord, SkillArtifactRevisionRecord
SkillArtifactFileRecord, SkillArtifactDerivedRecord
ClientManifestRecord, ArtifactFilePayloadRecord

// Candidate Domain
CandidateSubmissionRecord, DuplicateCaseRecord
EntityLineageRecord

// Supporting
AuditEventRecord, FeedbackQueueRecord
ConflictRelation, GraphIndexDocumentRecord
```

### 1.2 StoreData Collections (15 fields)

```typescript
interface StoreData {
  counters: Record<string, number>;
  users: UserRecord[];
  teams: TeamRecord[];
  memberships: MembershipRecord[];
  accessKeys: AccessKeyRecord[];
  sessions: SessionRecord[];
  knowledgeEntries: KnowledgeRecord[];      // @deprecated Phase 62
  auditEvents: AuditEventRecord[];
  skillArtifacts: SkillArtifactRecord[];    // @deprecated Phase 63
  artifactFilePayloads: ArtifactFilePayloadRecord[];
  candidateSubmissions: CandidateSubmissionRecord[]; // @deprecated Phase 61
  duplicateCases: DuplicateCaseRecord[];
  entityLineage: EntityLineageRecord[];
  graphIndexDocuments: GraphIndexDocumentRecord[];
  conflicts: ConflictRelation[];
  feedbackQueue: FeedbackQueueRecord[];
}
```

### 1.3 SkillShareerStore Interface

```typescript
export interface SkillShareerStore {
  snapshot(): Promise<StoreData>;
  transact<T>(mutator: (data: StoreData) => Promise<T> | T): Promise<T>;
  nextId(data: StoreData, prefix: string): string;
}
```

---

## 2. Import Graph

### 2.1 Files Using Store Pattern

| Pattern | File Count | Status |
|---------|------------|--------|
| `.transact()` | 61 files | Primary pattern (needs migration) |
| `knowledgeRepo.` | 3 files | Partially migrated |
| `artifactRepo.` | 1 file | Partially migrated |

### 2.2 Direct Store Import Locations

**Files importing from `store.ts`:** 68 files found

**Categories:**
- **Route handlers:** auth.ts, knowledge.ts, candidates.ts, review.ts, teams.ts, members.ts, etc.
- **Lib modules:** session.ts, audit.ts, knowledge.ts, artifacts/model.ts, indexing/pipeline.ts, etc.
- **Test files:** *.test.ts files throughout

### 2.3 Usage Patterns by Entity

| Entity | Current Access | Repository Exists? |
|--------|----------------|-------------------|
| knowledgeEntries | `data.knowledgeEntries` | Yes (KnowledgeRepository) |
| skillArtifacts | `data.skillArtifacts` | Yes (ArtifactRepository) |
| candidateSubmissions | `data.candidateSubmissions` | Yes (CandidateRepository) |
| users | `data.users` | No |
| teams | `data.teams` | No |
| memberships | `data.memberships` | No |
| sessions | `data.sessions` | No |
| accessKeys | `data.accessKeys` | No |
| auditEvents | `data.auditEvents` | No |
| feedbackQueue | `data.feedbackQueue` | No |
| conflicts | `data.conflicts` | No |
| graphIndexDocuments | `data.graphIndexDocuments` | No |

---

## 3. Existing Repository Patterns

### 3.1 KnowledgeRepository (Phase 62)

**Location:** `packages/server/src/lib/knowledge/repository.ts`

**Interface Methods:**
```typescript
interface KnowledgeRepository {
  nextId(): Promise<string>;
  insert(entry: KnowledgeRecord): Promise<void>;
  getById(entryId: string): Promise<KnowledgeRecord | null>;
  updateLifecycle(entryId: string, newState: LifecycleState, context): Promise<void>;
  appendRevision(entryId: string, revision: KnowledgeRevisionRecord): Promise<void>;
  appendLifecycleEvent(entryId: string, event: KnowledgeLifecycleEventRecord): Promise<void>;
  listByFilter(filter: {...}): Promise<KnowledgeRecord[]>;
  updateGovernance(entryId: string, governance: {...}): Promise<void>;
}
```

**Implementations:**
- `PgKnowledgeRepository` - PostgreSQL with row-level locking
- `InMemoryKnowledgeRepository` - Uses JsonStore
- `DualWriteKnowledgeRepository` - Write to both (transition pattern)

### 3.2 ArtifactRepository (Phase 63)

**Location:** `packages/server/src/lib/artifacts/repository.ts`

**Interface Methods:**
```typescript
interface ArtifactRepository {
  nextId(): Promise<string>;
  insert(artifact: SkillArtifactRecord): Promise<void>;
  getById(artifactId: string): Promise<SkillArtifactRecord | null>;
  updateLifecycle(artifactId: string, newState: LifecycleState, context): Promise<void>;
  appendRevision(artifactId: string, revision: SkillArtifactRevisionRecord): Promise<void>;
  updateRevisionDerived(artifactId: string, revision: number, derived): Promise<void>;
  appendLifecycleEvent(artifactId: string, event): Promise<void>;
  listByFilter(filter: {...}): Promise<SkillArtifactRecord[]>;
  updateGovernance(artifactId: string, governance: {...}): Promise<void>;
}
```

### 3.3 CandidateRepository (Phase 61)

**Location:** `packages/server/src/lib/candidates/repository.ts`

**Interface Methods:**
```typescript
interface CandidateRepository {
  insert(candidate: CandidateSubmission): Promise<void>;
  getById(candidateId: string): Promise<CandidateSubmission | null>;
  updateStatus(candidateId: string, status: CandidateStatus, error?: string): Promise<void>;
  attachAnalysis(candidateId: string, snapshot: AnalysisSnapshot): Promise<void>;
  attachDuplicateCase(candidateId: string, duplicateCase: DuplicateCase): Promise<void>;
  attachManualResult(candidateId: string, result: ManualResultSubmission, reviewedBy: string): Promise<void>;
  listByStatus(status: CandidateStatus): Promise<CandidateSubmission[]>;
  markResolved(candidateId: string, resolvedBy: string): Promise<void>;
}
```

### 3.4 PostgreSQL Implementations

**Schema Management:** Each `Pg*Repository` includes:
- `ensureSchema()` method for lazy table creation
- SEQUENCE for ID generation
- Indexes for common queries
- Row-level locking with `SELECT FOR UPDATE`

**Tables Created:**
- `knowledge_entries`, `knowledge_revisions`, `lifecycle_events`
- `skill_artifacts`, `artifact_revisions`, `artifact_lifecycle_events`
- (Candidates use task queue pattern)

---

## 4. Technical Approach

### 4.1 Recommended Repository Interfaces to Create

Based on usage analysis, these additional repositories are needed:

#### High Priority (auth/session domain)
```typescript
interface SessionRepository {
  create(session: Omit<SessionRecord, 'id'>): Promise<SessionRecord>;
  getByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
  updateActiveTeam(sessionId: string, teamId: string | null): Promise<void>;
}

interface AccessKeyRepository {
  insert(key: AccessKeyRecord): Promise<void>;
  getByTokenHash(tokenHash: string): Promise<AccessKeyRecord | null>;
  revoke(keyId: string): Promise<void>;
  listByMember(memberId: string): Promise<AccessKeyRecord[]>;
}
```

#### Medium Priority (team/user domain)
```typescript
interface UserRepository {
  insert(user: UserRecord): Promise<void>;
  getById(userId: string): Promise<UserRecord | null>;
  getByHandle(handle: string): Promise<UserRecord | null>;
}

interface TeamRepository {
  insert(team: TeamRecord): Promise<void>;
  getById(teamId: string): Promise<TeamRecord | null>;
  listAll(): Promise<TeamRecord[]>;
}

interface MembershipRepository {
  insert(membership: MembershipRecord): Promise<void>;
  getById(membershipId: string): Promise<MembershipRecord | null>;
  findByUserAndTeam(userId: string, teamId: string): Promise<MembershipRecord | null>;
  listByUser(userId: string): Promise<MembershipRecord[]>;
  update(membershipId: string, updates: Partial<MembershipRecord>): Promise<void>;
}
```

#### Low Priority (supporting domain)
```typescript
interface AuditEventRepository {
  insert(event: AuditEventRecord): Promise<void>;
  listByFilter(filter: { teamId?: string; actorId?: string }): Promise<AuditEventRecord[]>;
}

interface FeedbackQueueRepository {
  insert(feedback: FeedbackQueueRecord): Promise<void>;
  getById(feedbackId: string): Promise<FeedbackQueueRecord | null>;
  listByStatus(status: string): Promise<FeedbackQueueRecord[]>;
  updateStatus(feedbackId: string, status: string, resolvedBy?: string): Promise<void>;
}
```

### 4.2 Migration Strategy (Incremental, Not Big-Bang)

**Recommended approach:** Entity-by-entity migration

1. **Phase 83a: Session/AccessKey Repository** (auth domain)
   - Create SessionRepository interface + implementations
   - Create AccessKeyRepository interface + implementations
   - Migrate auth.ts routes
   - ~5 files affected

2. **Phase 83b: User/Team/Membership Repository** (team domain)
   - Create UserRepository, TeamRepository, MembershipRepository
   - Migrate teams.ts, members.ts routes
   - Migrate session.ts helper functions
   - ~10 files affected

3. **Phase 83c: Complete Knowledge Migration**
   - Migrate remaining knowledge.ts transact blocks
   - Migrate traps.ts routes
   - ~15 files affected

4. **Phase 83d: Complete Artifact Migration**
   - Migrate artifacts/model.ts
   - Migrate operations routes
   - ~10 files affected

5. **Phase 83e: Supporting Repositories**
   - AuditEventRepository, FeedbackQueueRepository
   - Migrate remaining routes
   - ~20 files affected

### 4.3 Dual-Write Completion Strategy

Current state in `routes/knowledge.ts`:
```typescript
// Current: Dual-write pattern
const entry = await app.skillShareer.store.transact((data) => {
  const record = createKnowledgeEntryRecord({...});
  data.knowledgeEntries.push(record);
  return toKnowledgeEntry(data, record);
});

// Secondary write to PostgreSQL
if (knowledgeRepo) {
  await knowledgeRepo.insert(record);
}
```

**Target state:**
```typescript
// Target: Repository-first pattern
const entryId = await knowledgeRepo.nextId();
const record = createKnowledgeEntryRecord({ id: entryId, ... });
await knowledgeRepo.insert(record);
const entry = toKnowledgeEntry(record);
```

---

## 5. Validation Architecture

### 5.1 Existing Test Coverage

**Store tests:** `lib/store.test.ts`
- Contract tests for both JsonStore and PostgresStore
- Tests for transact, snapshot, nextId operations

**Repository tests:**
- `lib/knowledge/pg-repository.test.ts` - PostgreSQL-specific tests
- `lib/artifacts/pg-repository.test.ts` - PostgreSQL-specific tests
- `lib/candidates/repository.test.ts` - Includes MockRepository pattern

### 5.2 Test Strategy for New Repositories

**Pattern from existing tests:**
```typescript
// Mock repository for testing
class MockRepository implements XRepository {
  public calls: Array<{ method: string; args: unknown[] }> = [];
  private data: Map<string, XRecord> = new Map();

  // Implement interface methods with call recording
}

// Contract tests
function runRepositoryContractTests(
  name: string,
  createRepo: () => XRepository
) {
  describe(`${name} - repository contract`, () => {
    // Test all interface methods
  });
}
```

### 5.3 Recommended Test Coverage

For each new repository:

1. **Contract tests** - Test interface behavior
2. **PostgreSQL tests** - Test PgXxxRepository with pg-mem
3. **In-memory tests** - Test InMemoryXxxRepository with JsonStore
4. **Integration tests** - Test route handlers with mock repositories

### 5.4 Regression Detection

**Key files to ensure tests pass:**
- All existing route tests (`routes/*.test.ts`)
- Store contract tests (`lib/store.test.ts`)
- Repository tests (`lib/*/repository.test.ts`)

**Run command:** `pnpm test` (2424+ tests should pass)

---

## 6. Dependency Injection Context

### 6.1 Current Context Structure

**Location:** `packages/server/src/lib/context.ts`

```typescript
interface SkillShareerServices {
  config: ServerConfig;
  store: SkillShareerStore;
  indexAdapters: IndexAdapter[];
  ai: AiProviders;
  knowledgeRepo: KnowledgeRepository | undefined;  // Only set with PostgreSQL
  artifactRepo: ArtifactRepository | undefined;    // Only set with PostgreSQL
}
```

### 6.2 Proposed Context Extension

```typescript
interface SkillShareerServices {
  config: ServerConfig;
  store: SkillShareerStore;  // Keep for backward compatibility during transition
  indexAdapters: IndexAdapter[];
  ai: AiProviders;

  // Repositories (all optional during transition)
  knowledgeRepo: KnowledgeRepository | undefined;
  artifactRepo: ArtifactRepository | undefined;
  candidateRepo: CandidateRepository | undefined;

  // New repositories
  sessionRepo: SessionRepository | undefined;
  accessKeyRepo: AccessKeyRepository | undefined;
  userRepo: UserRepository | undefined;
  teamRepo: TeamRepository | undefined;
  membershipRepo: MembershipRepository | undefined;
  auditRepo: AuditEventRepository | undefined;
  feedbackRepo: FeedbackQueueRepository | undefined;
}
```

### 6.3 Initialization in app.ts

Current pattern:
```typescript
app.addHook('onReady', async () => {
  const store = app.skillShareer.store;
  if (store instanceof PostgresStore) {
    const pool = store.getPool();
    app.skillShareer.knowledgeRepo = createKnowledgeRepository({ pool, store });
    app.skillShareer.artifactRepo = createArtifactRepository({ pool, store });
  }
});
```

---

## 7. Key Decisions for Planning

### 7.1 Questions to Answer Before Planning

1. **Should we keep backward compatibility with JsonStore?**
   - Current: Both JsonStore and PostgresStore supported
   - Option A: Maintain both (more complex)
   - Option B: PostgreSQL-only (simpler, breaks non-PostgreSQL deployments)

2. **What is the migration order?**
   - Recommended: Auth → Team → Knowledge → Artifacts → Supporting
   - Alternative: Knowledge-first (highest business value)

3. **Should repositories return domain types or records?**
   - Current: Return `*Record` types
   - Option: Return domain types (e.g., `KnowledgeEntry` instead of `KnowledgeRecord`)

4. **How to handle cross-entity transactions?**
   - Current: Single `store.transact()` for atomic multi-entity updates
   - Option: Saga pattern with per-repository transactions

5. **When to remove dual-write pattern?**
   - After all entities migrated?
   - After data migration verified?

### 7.2 Estimated Effort

Based on analysis:

| Phase | Effort | Risk |
|-------|--------|------|
| 83a: Session/AccessKey | 2-3 hours | Low |
| 83b: User/Team/Membership | 3-4 hours | Medium |
| 83c: Complete Knowledge | 4-6 hours | Medium |
| 83d: Complete Artifacts | 3-4 hours | Medium |
| 83e: Supporting | 4-6 hours | Low |
| **Total** | **16-23 hours** | **Medium** |

---

## 8. Risks and Mitigations

### 8.1 Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing tests | High | Run full test suite after each entity migration |
| Cross-entity transaction semantics | Medium | Document patterns that need multi-entity updates |
| Performance regression | Medium | Benchmark before/after for critical paths |
| Data inconsistency during transition | High | Maintain dual-write until migration complete |

### 8.2 Mitigation Strategies

1. **Incremental migration** - Migrate one entity at a time
2. **Feature flags** - Toggle repository vs. direct access
3. **Comprehensive tests** - Add tests before each migration
4. **Rollback plan** - Keep dual-write capability during transition

---

## 9. Files Reference

### 9.1 Key Files to Modify

| File | Purpose |
|------|---------|
| `lib/store.ts` | Keep types, deprecate JsonStore if moving to PostgreSQL-only |
| `lib/context.ts` | Add new repository fields |
| `app.ts` | Initialize new repositories |
| `routes/auth.ts` | Migrate to SessionRepository |
| `routes/knowledge.ts` | Complete migration to KnowledgeRepository |
| `routes/teams.ts` | Migrate to TeamRepository/MembershipRepository |
| `lib/session.ts` | Migrate helper functions |

### 9.2 New Files to Create

| File | Purpose |
|------|---------|
| `lib/auth/repository.ts` | SessionRepository interface + implementations |
| `lib/auth/pg-repository.ts` | PgSessionRepository |
| `lib/users/repository.ts` | UserRepository interface + implementations |
| `lib/users/pg-repository.ts` | PgUserRepository |
| `lib/teams/repository.ts` | TeamRepository, MembershipRepository |
| `lib/teams/pg-repository.ts` | PgTeamRepository, PgMembershipRepository |
| `lib/audit/repository.ts` | AuditEventRepository |
| `lib/feedback/repository.ts` | FeedbackQueueRepository |

---

## 10. Summary

### What's Already Done
- Repository pattern exists for Knowledge, Artifacts, Candidates
- PostgreSQL implementations with row-level locking
- In-memory implementations for testing
- Dual-write pattern for transition

### What's Needed
1. Complete migration from `store.transact()` to repository methods
2. Create additional repositories for remaining entities
3. Update route handlers to use repositories
4. Remove or deprecate dual-write pattern

### Recommended Approach
- Entity-by-entity migration (not big-bang)
- Start with auth domain (SessionRepository, AccessKeyRepository)
- Maintain backward compatibility during transition
- Add comprehensive tests before each migration

---

*Research completed: 2026-05-05*
