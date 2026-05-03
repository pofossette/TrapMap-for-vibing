# Phase 63: Skill Artifact Row-Level Table & JSONB Cleanup - Research

**Gathered:** 2026-05-03
**Analyst:** Claude Opus 4.6
**Phase Goal:** Complete the row-level migration with `skill_artifacts` and `artifact_revisions` tables, then remove JSONB shadow writes and downgrade `store_snapshot` to a cold backup/legacy role.

**Requirement ID:** WRITE-03

---

## Executive Summary

Phase 63 completes the write-path decomposition started in Phase 61 (candidates) and Phase 62 (knowledge entries) by:
1. Creating `skill_artifacts` table for current artifact state (mirroring `knowledge_entries` pattern)
2. Creating `artifact_revisions` table for immutable revision history with derived outputs
3. Implementing `PgArtifactRepository` with full CRUD operations
4. Removing JSONB shadow writes for all three decomposed domains
5. Potentially deprecating `store_snapshot` entirely or reducing it to low-volume collections

---

## Pattern Reference: Phase 61 & 62 Implementation

### Repository Pattern Architecture

Both Phase 61 and 62 followed this pattern:

```
┌─────────────────────────────────────────────────────────────┐
│                      Routes / Services                       │
│   if (repo) { repo.method() } else { store.transact() }     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Factory: createXxxRepository({ pool, store })  │
│   pool ? DualWriteXxxRepository(pgRepo, store)              │
│         : InMemoryXxxRepository(store)                      │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┴───────────────────┐
          ▼                                       ▼
┌──────────────────────┐              ┌──────────────────────┐
│ DualWriteXxxRepository│              │ InMemoryXxxRepository│
│ - primary: PgXxxRepo │              │ - store: JsonStore   │
│ - store: SkillShareer│              │ (tests, fallback)    │
│ Each method:         │              └──────────────────────┘
│   1. primary.method()│
│   2. store.transact()│
└──────────────────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────────┐
│              PgXxxRepository (PostgreSQL)                    │
│ - pool: Pool                                                │
│ - db: Drizzle ORM instance                                  │
│ - initialized: boolean (lazy schema creation)               │
│                                                              │
│ Methods use:                                                 │
│ - pool.query() for DDL (ensureSchema)                       │
│ - db.select/insert/update for queries                       │
│ - client = pool.connect() + BEGIN/COMMIT + SELECT FOR UPDATE│
│   for row-level locking on mutations                        │
└──────────────────────────────────────────────────────────────┘
```

### Key Implementation Files to Reference

| Phase | File | Purpose |
|-------|------|---------|
| 61 | `lib/candidates/repository.ts` | Interface + DualWrite + InMemory + Factory |
| 61 | `lib/candidates/pg-repository.ts` | PostgreSQL implementation with row-level locking |
| 61 | `lib/persistence/migrate-candidates.ts` | JSONB → table migration script |
| 62 | `lib/knowledge/repository.ts` | Same pattern for knowledge entries |
| 62 | `lib/knowledge/pg-repository.ts` | Knowledge with revisions + lifecycle events |
| 62 | `lib/persistence/migrate-knowledge.ts` | Migration with nested data handling |

### Schema Pattern from Phase 62

Phase 62 uses THREE tables for knowledge entries:

1. **`knowledge_entries`** - Mutable current state (1 row per entry)
   - `id`, `teamId`, `scope`, `labels`, `shortcut`, `detail`, `requiredLevel`
   - `lifecycleState`, `ownerUserId`, `boundary`, `maintenanceMeta`
   - `createdAt`, `updatedAt`

2. **`knowledge_revisions`** - Immutable revision history (N rows per entry)
   - `id` (composite: `{entry_id}_rev{revision}`)
   - `entryId` (FK reference), `revision`, `submittedAt`, `submittedByUserId`
   - `shortcut`, `detail`, `labels`, `reviewNotes`

3. **`lifecycle_events`** - Audit trail (N rows per entry)
   - `id`, `entryId`, `type`, `createdAt`, `actorUserId`
   - `submissionId`, `revision`, `state`, `note`

**Plus:** `knowledge_entry_id_seq` SEQUENCE for ID generation

---

## Current Skill Artifacts Data Model

### SkillArtifactRecord Structure (from `store.ts`)

```typescript
interface SkillArtifactRecord {
  // Identity & Governance (at artifact root per T-12-07)
  id: string;
  teamId: string | null;
  scope: Scope;  // 'global' | 'project'
  labels: string[];
  title: string;
  slug: string;
  requiredLevel: number;
  lifecycleState: LifecycleState;
  ownerUserId: string;

  // Current revision (mutable pointer)
  latestRevision: SkillArtifactRevisionRecord;

  // Immutable history
  history: SkillArtifactRevisionRecord[];

  // Metadata
  metadata: SkillArtifactMetadataRecord;
  agentReview: AgentReviewRecord | null;
  reviewHistory: SkillArtifactReviewDecisionRecord[];
  reviewNotes: SkillArtifactReviewNoteRecord[];
  lifecycleHistory: SkillArtifactLifecycleEventRecord[];
  maintenanceMeta: MaintenanceMetaRecord | null;

  // Timestamps
  createdAt: string;
  updatedAt: string;
}
```

### SkillArtifactRevisionRecord Structure

```typescript
interface SkillArtifactRevisionRecord {
  revision: number;
  sourceHash: string;
  files: SkillArtifactFileRecord[];
  submittedAt: string;
  submittedByUserId: string;
  scriptDescriptors: SkillScriptDescriptorRecord[];
  derived: SkillArtifactDerivedRecord | null;  // profile, capsules, clientManifest
}
```

### Key Differences from KnowledgeEntry

| Aspect | KnowledgeEntry | SkillArtifact |
|--------|---------------|---------------|
| Content storage | `shortcut`/`detail` text fields | `files[]` array with paths, hashes, kinds |
| Derived outputs | Not stored | `profile`, `capsules[]`, `clientManifest` |
| Revision content | Inline text + labels | File manifest + script descriptors |
| Additional fields | `boundary` | `title`, `slug`, `metadata.sourceKind` |

---

## Proposed Schema Design

### 1. `skill_artifacts` Table (mirrors `knowledge_entries`)

```sql
CREATE TABLE skill_artifacts (
  id TEXT PRIMARY KEY,
  team_id TEXT,
  scope TEXT NOT NULL,
  labels JSONB NOT NULL DEFAULT '[]',
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  required_level INTEGER NOT NULL DEFAULT 0,
  lifecycle_state TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  metadata JSONB NOT NULL,  -- sourceKind, submissionCount, etc.
  agent_review JSONB,        -- AgentReviewRecord or null
  maintenance_meta JSONB,    -- MaintenanceMetaRecord or null
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_skill_artifacts_lifecycle_state ON skill_artifacts (lifecycle_state);
CREATE INDEX idx_skill_artifacts_team ON skill_artifacts (team_id) WHERE team_id IS NOT NULL;
CREATE INDEX idx_skill_artifacts_slug ON skill_artifacts (slug);
```

### 2. `artifact_revisions` Table (mirrors `knowledge_revisions`)

```sql
CREATE TABLE artifact_revisions (
  id TEXT PRIMARY KEY,  -- format: {artifact_id}_rev{revision}
  artifact_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  source_hash TEXT NOT NULL,
  files JSONB NOT NULL,           -- SkillArtifactFileRecord[]
  script_descriptors JSONB NOT NULL,  -- SkillScriptDescriptorRecord[]
  derived JSONB,                  -- SkillArtifactDerivedRecord or null
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL,
  submitted_by_user_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_artifact_revisions_artifact ON artifact_revisions (artifact_id);
CREATE UNIQUE INDEX idx_artifact_revisions_artifact_revision ON artifact_revisions (artifact_id, revision);
```

### 3. `artifact_lifecycle_events` Table (mirrors `lifecycle_events`)

```sql
CREATE TABLE artifact_lifecycle_events (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'submitted' | 'resubmitted' | 'agent-reviewed' | ...
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  actor_user_id TEXT,
  submission_id TEXT,
  revision INTEGER,
  state TEXT NOT NULL,
  note TEXT
);

CREATE INDEX idx_artifact_lifecycle_events_artifact ON artifact_lifecycle_events (artifact_id);
```

### 4. `artifact_review_decisions` Table (optional, or keep in JSONB)

```sql
CREATE TABLE artifact_review_decisions (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  decided_at TIMESTAMP WITH TIME ZONE NOT NULL,
  decided_by_user_id TEXT NOT NULL,
  decision TEXT NOT NULL,  -- 'approve' | 'reject'
  notes TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_artifact_review_decisions_artifact ON artifact_review_decisions (artifact_id);
```

### 5. `artifact_review_notes` Table (optional, or keep in JSONB)

```sql
CREATE TABLE artifact_review_notes (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  author_type TEXT NOT NULL,  -- 'submitter' | 'agent' | 'reviewer' | 'system'
  author_user_id TEXT,
  message TEXT NOT NULL
);

CREATE INDEX idx_artifact_review_notes_artifact ON artifact_review_notes (artifact_id);
```

### 6. SEQUENCE for ID Generation

```sql
CREATE SEQUENCE skill_artifact_id_seq START 1;
```

---

## Mutation Pattern Analysis

### Where Skill Artifacts Are Modified

| File | Function | Operation |
|------|----------|-----------|
| `lib/artifacts/model.ts` | `createSkillArtifactRecord()` | Create new artifact |
| `lib/artifacts/model.ts` | `appendSkillArtifactRevision()` | Add revision to existing |
| `lib/artifacts/model.ts` | `applyDerivedArtifactOutputs()` | Update revision's derived outputs |
| `lib/artifacts/edit.ts` | `submitSkillEdit()` | Edit via pre-review + revision append |
| `routes/operations.ts` | Import/export, activation, deactivation | Lifecycle + governance operations |

### Required Repository Methods

```typescript
interface ArtifactRepository {
  // ID generation
  nextId(): Promise<string>;

  // CRUD
  insert(artifact: SkillArtifactRecord): Promise<void>;
  getById(artifactId: string): Promise<SkillArtifactRecord | null>;
  updateLifecycle(
    artifactId: string,
    newState: LifecycleState,
    context: { actorId: string; note?: string }
  ): Promise<void>;

  // Revisions
  appendRevision(artifactId: string, revision: SkillArtifactRevisionRecord): Promise<void>;
  updateRevisionDerived(
    artifactId: string,
    revision: number,
    derived: SkillArtifactDerivedRecord
  ): Promise<void>;

  // Lifecycle events
  appendLifecycleEvent(artifactId: string, event: SkillArtifactLifecycleEventRecord): Promise<void>;

  // Query
  listByFilter(filter: {
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
  }): Promise<SkillArtifactRecord[]>;

  // Governance
  updateGovernance(
    artifactId: string,
    governance: { labels?: string[]; requiredLevel?: number; title?: string }
  ): Promise<void>;

  // Review (optional - could stay in artifact's JSONB columns)
  appendReviewDecision(artifactId: string, decision: SkillArtifactReviewDecisionRecord): Promise<void>;
  appendReviewNote(artifactId: string, note: SkillArtifactReviewNoteRecord): Promise<void>;
}
```

---

## JSONB Cleanup Strategy

### Current StoreData Collections

```typescript
interface StoreData {
  counters: Record<string, number>;
  users: UserRecord[];
  teams: TeamRecord[];
  memberships: MembershipRecord[];
  accessKeys: AccessKeyRecord[];
  sessions: SessionRecord[];
  knowledgeEntries: KnowledgeRecord[];      // ← Phase 62 decomposed
  auditEvents: AuditEventRecord[];
  skillArtifacts: SkillArtifactRecord[];    // ← Phase 63 target
  artifactFilePayloads: ArtifactFilePayloadRecord[];
  candidateSubmissions: CandidateSubmissionRecord[];  // ← Phase 61 decomposed
  duplicateCases: DuplicateCaseRecord[];
  entityLineage: EntityLineageRecord[];
  graphIndexDocuments: GraphIndexDocumentRecord[];
  conflicts: ConflictRelation[];
  feedbackQueue: FeedbackQueueRecord[];
}
```

### Collections After Decomposition

| Collection | Status Post-Phase 63 | Rationale |
|------------|---------------------|-----------|
| `candidateSubmissions` | Remove JSONB write | Phase 61 migrated |
| `knowledgeEntries` | Remove JSONB write | Phase 62 migrated |
| `skillArtifacts` | Remove JSONB write | Phase 63 migrates |
| `artifactFilePayloads` | Keep in JSONB | Low frequency, large blobs |
| `duplicateCases` | Keep in JSONB | Low volume |
| `entityLineage` | Keep in JSONB | Low volume |
| `graphIndexDocuments` | Keep in JSONB | Index-specific |
| `conflicts` | Keep in JSONB | Low volume |
| `feedbackQueue` | Keep in JSONB | Low volume |
| `users/teams/memberships` | Keep in JSONB | Auth tables, low volume |
| `sessions/accessKeys` | Keep in JSONB | Auth tables |
| `auditEvents` | Keep in JSONB | Append-only audit log |

### DualWrite Removal Process

1. **Phase 63-A**: Implement `PgArtifactRepository` with DualWrite (like Phase 61/62)
2. **Phase 63-B**: Deploy, migrate existing data, verify consistency
3. **Phase 63-C**: Remove DualWrite wrapper - write ONLY to PostgreSQL
4. **Phase 63-D**: Remove JSONB writes for `candidateSubmissions`, `knowledgeEntries`, `skillArtifacts`

### store_snapshot Post-Cleanup

```typescript
// Minimal StoreData after cleanup
interface StoreDataV2 {
  counters: Record<string, number>;
  users: UserRecord[];
  teams: TeamRecord[];
  memberships: MembershipRecord[];
  accessKeys: AccessKeyRecord[];
  sessions: SessionRecord[];
  auditEvents: AuditEventRecord[];
  artifactFilePayloads: ArtifactFilePayloadRecord[];
  duplicateCases: DuplicateCaseRecord[];
  entityLineage: EntityLineageRecord[];
  graphIndexDocuments: GraphIndexDocumentRecord[];
  conflicts: ConflictRelation[];
  feedbackQueue: FeedbackQueueRecord[];
}
```

---

## Validation Architecture

### 1. Schema Migration Validation

```typescript
describe('Schema Migration Validation', () => {
  it('should create skill_artifacts table with all columns', async () => {
    const result = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'skill_artifacts'
    `);
    expect(result.rows).toContainEqual({ column_name: 'id', data_type: 'text' });
    expect(result.rows).toContainEqual({ column_name: 'title', data_type: 'text' });
    // ... verify all columns
  });

  it('should create all indexes', async () => {
    const result = await pool.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename IN ('skill_artifacts', 'artifact_revisions', 'artifact_lifecycle_events')
    `);
    expect(result.rows).toHaveLength(expectedIndexCount);
  });

  it('should create SEQUENCE', async () => {
    const result = await pool.query(`
      SELECT nextval('skill_artifact_id_seq')
    `);
    expect(result.rows[0].nextval).toBe(1);
  });
});
```

### 2. Data Consistency Validation

```typescript
describe('Data Consistency', () => {
  it('should migrate all artifacts from JSONB to tables', async () => {
    const jsonbCount = (await store.snapshot()).skillArtifacts.length;
    const tableCount = (await pool.query('SELECT COUNT(*) FROM skill_artifacts')).rows[0].count;
    expect(tableCount).toBe(jsonbCount);
  });

  it('should preserve revision history', async () => {
    const artifacts = (await store.snapshot()).skillArtifacts;
    for (const artifact of artifacts) {
      const revisions = await pool.query(
        'SELECT * FROM artifact_revisions WHERE artifact_id = $1 ORDER BY revision',
        [artifact.id]
      );
      expect(revisions.rows).toHaveLength(artifact.history.length);
    }
  });

  it('should preserve lifecycle events', async () => {
    const artifacts = (await store.snapshot()).skillArtifacts;
    for (const artifact of artifacts) {
      const events = await pool.query(
        'SELECT * FROM artifact_lifecycle_events WHERE artifact_id = $1',
        [artifact.id]
      );
      expect(events.rows).toHaveLength(artifact.lifecycleHistory.length);
    }
  });

  it('should preserve derived outputs', async () => {
    const artifacts = (await store.snapshot()).skillArtifacts;
    for (const artifact of artifacts) {
      for (const rev of artifact.history) {
        if (rev.derived) {
          const row = await pool.query(
            'SELECT derived FROM artifact_revisions WHERE artifact_id = $1 AND revision = $2',
            [artifact.id, rev.revision]
          );
          expect(row.rows[0]?.derived).toBeTruthy();
        }
      }
    }
  });
});
```

### 3. JSONB Write Removal Verification

```typescript
describe('JSONB Write Removal', () => {
  it('should not write to skillArtifacts in JSONB after migration', async () => {
    const beforeSnapshot = await store.snapshot();
    const beforeCount = beforeSnapshot.skillArtifacts.length;

    // Create new artifact via repository
    const newArtifact = createTestArtifact();
    await artifactRepo.insert(newArtifact);

    const afterSnapshot = await store.snapshot();

    // JSONB should NOT have new artifact (after DualWrite removal)
    expect(afterSnapshot.skillArtifacts.length).toBe(beforeCount);

    // PostgreSQL should have new artifact
    const pgArtifact = await artifactRepo.getById(newArtifact.id);
    expect(pgArtifact).toBeTruthy();
  });

  it('should not write to candidateSubmissions after Phase 61 cleanup', async () => {
    // Verify candidate submissions go only to PostgreSQL
  });

  it('should not write to knowledgeEntries after Phase 62 cleanup', async () => {
    // Verify knowledge entries go only to PostgreSQL
  });
});
```

### 4. API Compatibility Verification

```typescript
describe('API Compatibility', () => {
  it('should return same artifact data from API after migration', async () => {
    // Create via API
    const createResponse = await app.inject({
      method: 'POST',
      url: '/v1/skills/import',
      payload: testSkillImport,
    });

    // Read via API
    const getResponse = await app.inject({
      method: 'GET',
      url: `/v1/skills/${createResponse.json().artifactId}`,
    });

    // Verify structure matches contract
    expect(getResponse.json()).toMatchObject({
      id: expect.any(String),
      title: testSkillImport.title,
      lifecycleState: expect.any(String),
    });
  });

  it('should support artifact edit flow', async () => {
    // Test full edit lifecycle
  });

  it('should support artifact activation', async () => {
    // Test activation with manifest
  });
});
```

### 5. Migration Script Tests

```typescript
describe('Artifact Migration Script', () => {
  it('should support dry-run mode', async () => {
    const result = await migrateArtifacts({ pool, store, dryRun: true });
    expect(result.migrated).toBe(0);

    // Verify no data written
    const count = await pool.query('SELECT COUNT(*) FROM skill_artifacts');
    expect(count.rows[0].count).toBe('0');
  });

  it('should be idempotent', async () => {
    // Run twice
    await migrateArtifacts({ pool, store });
    const result2 = await migrateArtifacts({ pool, store });

    expect(result2.migrated).toBe(0);
    expect(result2.skipped).toBeGreaterThan(0);
  });

  it('should handle nested data correctly', async () => {
    await migrateArtifacts({ pool, store });

    const artifact = (await store.snapshot()).skillArtifacts[0];
    const pgArtifact = await artifactRepo.getById(artifact.id);

    // Verify files array preserved
    expect(pgArtifact?.latestRevision.files).toHaveLength(
      artifact.latestRevision.files.length
    );

    // Verify script descriptors preserved
    expect(pgArtifact?.latestRevision.scriptDescriptors).toHaveLength(
      artifact.latestRevision.scriptDescriptors.length
    );

    // Verify derived outputs preserved
    expect(pgArtifact?.latestRevision.derived?.profile?.title).toBe(
      artifact.latestRevision.derived?.profile?.title
    );
  });

  it('should synchronize SEQUENCE after migration', async () => {
    await migrateArtifacts({ pool, store });

    // Get max ID from table
    const maxResult = await pool.query(
      "SELECT MAX(id) FROM skill_artifacts WHERE id LIKE 'artifact_%'"
    );
    const maxId = parseInt(maxResult.rows[0].max.split('_')[1]);

    // Verify next SEQUENCE value is higher
    const seqResult = await pool.query("SELECT nextval('skill_artifact_id_seq')");
    expect(parseInt(seqResult.rows[0].nextval)).toBeGreaterThan(maxId);
  });
});
```

---

## Implementation Wave Plan

### Wave 1: Schema & Repository Core (Plans 63-01, 63-02)

1. **Plan 63-01**: Add schema to `schema.ts`
   - `skill_artifact_id_seq` SEQUENCE
   - `skill_artifacts` table
   - `artifact_revisions` table
   - `artifact_lifecycle_events` table
   - Optional: `artifact_review_decisions`, `artifact_review_notes` tables

2. **Plan 63-02**: Create `lib/artifacts/repository.ts` + `pg-repository.ts`
   - `ArtifactRepository` interface
   - `PgArtifactRepository` implementation with FOR UPDATE locking
   - `DualWriteArtifactRepository` (temporary)
   - `InMemoryArtifactRepository` for tests
   - `createArtifactRepository()` factory

### Wave 2: Route Integration (Plan 63-03)

1. **Plan 63-03**: Update `routes/operations.ts` and `lib/artifacts/*.ts`
   - Add `artifactRepo` to `SkillShareerServices` in `context.ts`
   - Update `app.ts` to create repository on PostgreSQL
   - Modify `createSkillArtifactRecord()` to use repository when available
   - Modify `appendSkillArtifactRevision()` to use repository when available
   - Modify `submitSkillEdit()` to use repository when available

### Wave 3: Migration & Cleanup (Plan 63-04)

1. **Plan 63-04**: Create migration script + remove JSONB writes
   - `lib/persistence/migrate-artifacts.ts` migration script
   - Tests for migration script
   - Remove DualWrite wrapper (switch to PostgreSQL-only)
   - Remove JSONB writes for `candidateSubmissions`, `knowledgeEntries`, `skillArtifacts`
   - Update `StoreData` type to reflect remaining collections

---

## Open Questions for Planning

1. **Review data storage**: Should `reviewHistory` and `reviewNotes` be separate tables or stay in artifact's JSONB column?
   - Separate tables: More normalized, easier queries
   - JSONB column: Simpler, matches current pattern

2. **File payloads**: Should `artifactFilePayloads` also be migrated to a dedicated table?
   - Current: Stored in JSONB with base64 content
   - Alternative: `artifact_file_contents` table with large TEXT columns

3. **Index tables**: Are there plans for artifact-specific embedding/keyword index tables?
   - Currently no `artifact_embeddings` or `artifact_keywords` tables found
   - May need to add later for skill artifact retrieval

4. **Backfill timing**: Should migration happen during deployment or as a separate job?
   - Deployment: Simpler, but adds deploy time
   - Separate job: More complex, but doesn't block deploy

---

## Files to Create/Modify

### Created
- `packages/server/src/lib/artifacts/repository.ts` - Interface and implementations
- `packages/server/src/lib/artifacts/pg-repository.ts` - PostgreSQL implementation
- `packages/server/src/lib/artifacts/pg-repository.test.ts` - Repository tests
- `packages/server/src/lib/persistence/migrate-artifacts.ts` - Migration script
- `packages/server/src/lib/persistence/migrate-artifacts.test.ts` - Migration tests

### Modified
- `packages/server/src/lib/persistence/schema.ts` - Add new tables
- `packages/server/src/lib/context.ts` - Add `artifactRepo` to services
- `packages/server/src/lib/store.ts` - Update `StoreData` after cleanup
- `packages/server/src/app.ts` - Repository initialization
- `packages/server/src/routes/operations.ts` - Repository integration
- `packages/server/src/lib/artifacts/model.ts` - Repository usage
- `packages/server/src/lib/artifacts/edit.ts` - Repository usage
- `packages/server/src/lib/artifacts/index.ts` - Export repository

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Derived output data loss during migration | Medium | High | Comprehensive validation tests, dry-run mode |
| Performance regression with large file manifests | Low | Medium | JSONB storage for files[] is efficient |
| Breaking existing skill artifact retrieval | Low | High | API compatibility tests, staged rollout |
| DualWrite inconsistencies during transition | Medium | Low | PostgreSQL is authoritative; JSONB is shadow |

---

## Success Metrics

1. **Schema**: All 4+ tables created with correct columns and indexes
2. **Repository**: Full CRUD implemented matching existing mutation patterns
3. **Migration**: 100% of existing artifacts migrated without data loss
4. **Cleanup**: JSONB shadow writes removed for 3 decomposed domains
5. **Tests**: All existing tests pass + new repository/migration tests pass
6. **Performance**: Artifact operations complete without JSONB dependency

---

*Research completed: 2026-05-03*
