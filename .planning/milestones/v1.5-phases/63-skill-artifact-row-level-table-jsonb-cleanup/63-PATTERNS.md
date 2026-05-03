# Phase 63: Skill Artifact Row-Level Table & JSONB Cleanup - Patterns

**Extracted:** 2026-05-03
**Sources:** Phase 61 (candidates), Phase 62 (knowledge), existing codebase

---

## File Classification & Data Flow

| File | Role | Data Flow | Pattern Source |
|------|------|-----------|----------------|
| `schema.ts` | Schema Definition | Drizzle ORM → PostgreSQL DDL | Phase 62 `knowledgeEntries` |
| `repository.ts` | Interface + Implementations | Routes → Repository → Store/DB | Phase 62 `knowledge/repository.ts` |
| `pg-repository.ts` | PostgreSQL Implementation | Repository → Drizzle → Pool | Phase 62 `knowledge/pg-repository.ts` |
| `migrate-artifacts.ts` | Migration Script | JSONB → PostgreSQL Tables | Phase 62 `migrate-knowledge.ts` |
| `context.ts` | Service Registry | App → Services → Routes | Phase 62 `context.ts` |
| `app.ts` | Initialization | Startup → Repository Creation | Phase 62 `app.ts` |
| `model.ts` | Domain Model | Routes → Model → Repository | Existing `artifacts/model.ts` |

---

## Pattern 1: Schema Definition

**Source:** `lib/persistence/schema.ts` (Phase 62 tables)

### 1.1 SEQUENCE for ID Generation

```typescript
// Drizzle ORM pattern for SEQUENCE
export const knowledgeEntryIdSeq = pgSequence('knowledge_entry_id_seq', {
  startWith: 1,
  increment: 1,
});

// For Phase 63:
export const skillArtifactIdSeq = pgSequence('skill_artifact_id_seq', {
  startWith: 1,
  increment: 1,
});
```

### 1.2 Primary Table (Current State)

```typescript
// Pattern from knowledgeEntries table
export const knowledgeEntries = pgTable(
  'knowledge_entries',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id'),
    scope: text('scope').notNull(),
    labels: jsonb('labels').notNull().$type<string[]>().default([]),
    shortcut: text('shortcut').notNull(),
    detail: text('detail').notNull(),
    requiredLevel: integer('required_level').notNull().default(0),
    lifecycleState: text('lifecycle_state').notNull().$type<LifecycleState>(),
    ownerUserId: text('owner_user_id').notNull(),
    boundary: jsonb('boundary').$type<Boundary | null>(),
    maintenanceMeta: jsonb('maintenance_meta').$type<MaintenanceMeta | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_knowledge_entries_lifecycle_state').on(table.lifecycleState),
    index('idx_knowledge_entries_team').on(table.teamId),
  ],
);

// For Phase 63 skill_artifacts:
export const skillArtifacts = pgTable(
  'skill_artifacts',
  {
    id: text('id').primaryKey(),
    teamId: text('team_id'),
    scope: text('scope').notNull(),
    labels: jsonb('labels').notNull().$type<string[]>().default([]),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    requiredLevel: integer('required_level').notNull().default(0),
    lifecycleState: text('lifecycle_state').notNull().$type<LifecycleState>(),
    ownerUserId: text('owner_user_id').notNull(),
    metadata: jsonb('metadata').notNull().$type<SkillArtifactMetadataRecord>(),
    agentReview: jsonb('agent_review').$type<AgentReviewRecord | null>(),
    maintenanceMeta: jsonb('maintenance_meta').$type<MaintenanceMetaRecord | null>(),
    decayMeta: jsonb('decay_meta').$type<DecayMetaRecord | null>(),
    evidenceMeta: jsonb('evidence_meta').$type<EvidenceMetaRecord | null>(),
    boundary: jsonb('boundary').$type<Boundary | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_skill_artifacts_lifecycle_state').on(table.lifecycleState),
    index('idx_skill_artifacts_team').on(table.teamId),
    index('idx_skill_artifacts_slug').on(table.slug),
  ],
);
```

### 1.3 Revision Table (Immutable History)

```typescript
// Pattern from knowledgeRevisions table
export const knowledgeRevisions = pgTable(
  'knowledge_revisions',
  {
    id: text('id').primaryKey(), // format: {entry_id}_rev{revision}
    entryId: text('entry_id').notNull(),
    revision: integer('revision').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    submittedByUserId: text('submitted_by_user_id').notNull(),
    shortcut: text('shortcut').notNull(),
    detail: text('detail').notNull(),
    labels: jsonb('labels').notNull().$type<string[]>().default([]),
    reviewNotes: jsonb('review_notes').notNull().$type<ReviewNote[]>().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_knowledge_revisions_entry').on(table.entryId)],
);

// For Phase 63 artifact_revisions:
export const artifactRevisions = pgTable(
  'artifact_revisions',
  {
    id: text('id').primaryKey(), // format: {artifact_id}_rev{revision}
    artifactId: text('artifact_id').notNull(),
    revision: integer('revision').notNull(),
    sourceHash: text('source_hash').notNull(),
    files: jsonb('files').notNull().$type<SkillArtifactFileRecord[]>(),
    scriptDescriptors: jsonb('script_descriptors').notNull().$type<SkillScriptDescriptorRecord[]>(),
    derived: jsonb('derived').$type<SkillArtifactDerivedRecord | null>(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
    submittedByUserId: text('submitted_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_artifact_revisions_artifact').on(table.artifactId),
    uniqueIndex('idx_artifact_revisions_artifact_revision').on(table.artifactId, table.revision),
  ],
);
```

### 1.4 Lifecycle Events Table (Audit Trail)

```typescript
// Pattern from lifecycleEvents table
export const lifecycleEvents = pgTable(
  'lifecycle_events',
  {
    id: text('id').primaryKey(),
    entryId: text('entry_id').notNull(),
    type: text('type').notNull().$type<LifecycleEventType>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    actorUserId: text('actor_user_id'),
    submissionId: text('submission_id'),
    revision: integer('revision'),
    state: text('state').notNull().$type<LifecycleState>(),
    note: text('note'),
  },
  (table) => [index('idx_lifecycle_events_entry').on(table.entryId)],
);

// For Phase 63 artifact_lifecycle_events:
export const artifactLifecycleEvents = pgTable(
  'artifact_lifecycle_events',
  {
    id: text('id').primaryKey(),
    artifactId: text('artifact_id').notNull(),
    type: text('type').notNull().$type<ArtifactLifecycleEventType>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    actorUserId: text('actor_user_id'),
    submissionId: text('submission_id'),
    revision: integer('revision'),
    state: text('state').notNull().$type<LifecycleState>(),
    note: text('note'),
  },
  (table) => [index('idx_artifact_lifecycle_events_artifact').on(table.artifactId)],
);
```

---

## Pattern 2: Repository Interface

**Source:** `lib/knowledge/repository.ts`

### 2.1 Interface Definition

```typescript
/**
 * Repository interface for artifact CRUD operations.
 * Abstracts whether data lives in JSONB or dedicated PostgreSQL tables.
 */
export interface ArtifactRepository {
  /** Generate a new unique artifact ID using PostgreSQL SEQUENCE */
  nextId(): Promise<string>;

  /** Insert a new artifact with all related data */
  insert(artifact: SkillArtifactRecord): Promise<void>;

  /** Get an artifact by ID with all related data */
  getById(artifactId: string): Promise<SkillArtifactRecord | null>;

  /** Update lifecycle state with row-level locking */
  updateLifecycle(
    artifactId: string,
    newState: LifecycleState,
    context: { actorId: string; note?: string },
  ): Promise<void>;

  /** Append a new revision with row-level locking */
  appendRevision(artifactId: string, revision: SkillArtifactRevisionRecord): Promise<void>;

  /** Update derived outputs on a specific revision */
  updateRevisionDerived(
    artifactId: string,
    revision: number,
    derived: SkillArtifactDerivedRecord,
  ): Promise<void>;

  /** Append a lifecycle event */
  appendLifecycleEvent(artifactId: string, event: SkillArtifactLifecycleEventRecord): Promise<void>;

  /** List artifacts by filter criteria */
  listByFilter(filter: {
    lifecycleState?: LifecycleState;
    teamId?: string;
    ownerUserId?: string;
  }): Promise<SkillArtifactRecord[]>;

  /** Update governance fields with row-level locking */
  updateGovernance(
    artifactId: string,
    governance: { labels?: string[]; requiredLevel?: number; title?: string },
  ): Promise<void>;
}
```

### 2.2 DualWrite Wrapper

```typescript
/**
 * Dual-write repository that writes to both primary and JSONB shadow.
 * Used during transition from JSONB snapshot to row-level PostgreSQL tables.
 */
export class DualWriteArtifactRepository implements ArtifactRepository {
  constructor(
    private readonly primary: ArtifactRepository,
    private readonly store: SkillShareerStore,
  ) {}

  async nextId(): Promise<string> {
    return this.primary.nextId();
  }

  async insert(artifact: SkillArtifactRecord): Promise<void> {
    await this.primary.insert(artifact);
    await this.store.transact((data) => {
      if (!data.skillArtifacts) {
        data.skillArtifacts = [];
      }
      data.skillArtifacts.push(artifact);
    });
  }

  async getById(artifactId: string): Promise<SkillArtifactRecord | null> {
    return this.primary.getById(artifactId);
  }

  async updateLifecycle(
    artifactId: string,
    newState: LifecycleState,
    context: { actorId: string; note?: string },
  ): Promise<void> {
    await this.primary.updateLifecycle(artifactId, newState, context);
    await this.store.transact((data) => {
      const artifact = data.skillArtifacts?.find((a) => a.id === artifactId);
      if (artifact) {
        transitionLifecycleState(artifact, newState, context.note ?? 'update');
        artifact.updatedAt = new Date().toISOString();
      }
    });
  }

  async appendRevision(artifactId: string, revision: SkillArtifactRevisionRecord): Promise<void> {
    await this.primary.appendRevision(artifactId, revision);
    await this.store.transact((data) => {
      const artifact = data.skillArtifacts?.find((a) => a.id === artifactId);
      if (artifact) {
        artifact.history.push(revision);
        artifact.latestRevision = revision;
        artifact.updatedAt = new Date().toISOString();
      }
    });
  }

  // ... other methods follow same pattern
}
```

### 2.3 InMemory Implementation

```typescript
/**
 * In-memory repository that uses JsonStore for all operations.
 * Used when no PostgreSQL pool is available (tests, local dev).
 */
export class InMemoryArtifactRepository implements ArtifactRepository {
  constructor(private readonly store: SkillShareerStore) {}

  async nextId(): Promise<string> {
    const data = await this.store.snapshot();
    return this.store.nextId(data, 'artifact');
  }

  async insert(artifact: SkillArtifactRecord): Promise<void> {
    await this.store.transact((data) => {
      if (!data.skillArtifacts) {
        data.skillArtifacts = [];
      }
      data.skillArtifacts.push(artifact);
    });
  }

  async getById(artifactId: string): Promise<SkillArtifactRecord | null> {
    const data = await this.store.snapshot();
    return data.skillArtifacts?.find((a) => a.id === artifactId) ?? null;
  }

  // ... other methods use store.transact() pattern
}
```

### 2.4 Factory Function

```typescript
/**
 * Factory function to create the appropriate ArtifactRepository.
 * Returns DualWriteArtifactRepository when pool is available,
 * InMemoryArtifactRepository otherwise.
 */
export function createArtifactRepository(config: {
  pool?: Pool;
  store: SkillShareerStore;
}): ArtifactRepository {
  if (config.pool) {
    // Dynamic import to avoid loading pg module in test environments
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PgArtifactRepository } = require('./pg-repository.js') as {
      PgArtifactRepository: new (pool: Pool) => ArtifactRepository;
    };
    const pgRepo = new PgArtifactRepository(config.pool);
    return new DualWriteArtifactRepository(pgRepo, config.store);
  }
  return new InMemoryArtifactRepository(config.store);
}
```

---

## Pattern 3: PostgreSQL Repository Implementation

**Source:** `lib/knowledge/pg-repository.ts`

### 3.1 Class Structure

```typescript
/**
 * PostgreSQL-backed repository for artifact CRUD operations.
 * Implements row-level locking for concurrent-safe updates.
 */
export class PgArtifactRepository implements ArtifactRepository {
  private db: ReturnType<typeof drizzle>;
  private initialized = false;

  constructor(private readonly pool: Pool) {
    this.db = drizzle(pool, {
      schema: { skillArtifacts, artifactRevisions, artifactLifecycleEvents },
    });
  }
}
```

### 3.2 Schema Initialization (Lazy DDL)

```typescript
/**
 * Ensure the artifact tables and indexes exist.
 * Called idempotently before each operation.
 */
private async ensureSchema(): Promise<void> {
  if (this.initialized) return;

  // Create SEQUENCE for ID generation
  await this.pool.query(`
    CREATE SEQUENCE IF NOT EXISTS skill_artifact_id_seq START 1
  `);

  // Create skill_artifacts table
  await this.pool.query(`
    CREATE TABLE IF NOT EXISTS skill_artifacts (
      id TEXT PRIMARY KEY,
      team_id TEXT,
      scope TEXT NOT NULL,
      labels JSONB NOT NULL DEFAULT '[]',
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      required_level INTEGER NOT NULL DEFAULT 0,
      lifecycle_state TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      metadata JSONB NOT NULL,
      agent_review JSONB,
      maintenance_meta JSONB,
      decay_meta JSONB,
      evidence_meta JSONB,
      boundary JSONB,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  // Create artifact_revisions table
  await this.pool.query(`
    CREATE TABLE IF NOT EXISTS artifact_revisions (
      id TEXT PRIMARY KEY,
      artifact_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      source_hash TEXT NOT NULL,
      files JSONB NOT NULL,
      script_descriptors JSONB NOT NULL,
      derived JSONB,
      submitted_at TIMESTAMP WITH TIME ZONE NOT NULL,
      submitted_by_user_id TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
    )
  `);

  // Create artifact_lifecycle_events table
  await this.pool.query(`
    CREATE TABLE IF NOT EXISTS artifact_lifecycle_events (
      id TEXT PRIMARY KEY,
      artifact_id TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL,
      actor_user_id TEXT,
      submission_id TEXT,
      revision INTEGER,
      state TEXT NOT NULL,
      note TEXT
    )
  `);

  // Create indexes
  await this.pool.query(`
    CREATE INDEX IF NOT EXISTS idx_skill_artifacts_lifecycle_state
    ON skill_artifacts (lifecycle_state)
  `);

  await this.pool.query(`
    CREATE INDEX IF NOT EXISTS idx_skill_artifacts_team
    ON skill_artifacts (team_id) WHERE team_id IS NOT NULL
  `);

  await this.pool.query(`
    CREATE INDEX IF NOT EXISTS idx_artifact_revisions_artifact
    ON artifact_revisions (artifact_id)
  `);

  await this.pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_artifact_revisions_artifact_revision
    ON artifact_revisions (artifact_id, revision)
  `);

  await this.pool.query(`
    CREATE INDEX IF NOT EXISTS idx_artifact_lifecycle_events_artifact
    ON artifact_lifecycle_events (artifact_id)
  `);

  this.initialized = true;
}
```

### 3.3 ID Generation

```typescript
/**
 * Generate a new unique artifact ID using PostgreSQL SEQUENCE.
 */
async nextId(): Promise<string> {
  await this.ensureSchema();

  const result = await this.pool.query<{ id: string }>(
    "SELECT nextval('skill_artifact_id_seq')::text AS id",
  );
  return `artifact_${result.rows[0]!.id}`;
}
```

### 3.4 Insert with Transaction

```typescript
/**
 * Insert a new artifact with all related data.
 */
async insert(artifact: SkillArtifactRecord): Promise<void> {
  await this.ensureSchema();

  const client = await this.pool.connect();
  try {
    await client.query('BEGIN');

    // Insert into skill_artifacts
    await client.query(
      `INSERT INTO skill_artifacts (
        id, team_id, scope, labels, title, slug, required_level,
        lifecycle_state, owner_user_id, metadata, agent_review,
        maintenance_meta, decay_meta, evidence_meta, boundary,
        created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        artifact.id,
        artifact.teamId,
        artifact.scope,
        JSON.stringify(artifact.labels),
        artifact.title,
        artifact.slug,
        artifact.requiredLevel,
        artifact.lifecycleState,
        artifact.ownerUserId,
        JSON.stringify(artifact.metadata),
        artifact.agentReview ? JSON.stringify(artifact.agentReview) : null,
        artifact.maintenanceMeta ? JSON.stringify(artifact.maintenanceMeta) : null,
        artifact.decayMeta ? JSON.stringify(artifact.decayMeta) : null,
        artifact.evidenceMeta ? JSON.stringify(artifact.evidenceMeta) : null,
        artifact.boundary ? JSON.stringify(artifact.boundary) : null,
        artifact.createdAt,
        artifact.updatedAt,
      ],
    );

    // Insert all revisions
    for (const revision of artifact.history) {
      await client.query(
        `INSERT INTO artifact_revisions (
          id, artifact_id, revision, source_hash, files, script_descriptors,
          derived, submitted_at, submitted_by_user_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          `${artifact.id}_rev${revision.revision}`,
          artifact.id,
          revision.revision,
          revision.sourceHash,
          JSON.stringify(revision.files),
          JSON.stringify(revision.scriptDescriptors),
          revision.derived ? JSON.stringify(revision.derived) : null,
          revision.submittedAt,
          revision.submittedByUserId,
          revision.submittedAt,
        ],
      );
    }

    // Insert all lifecycle events
    for (const event of artifact.lifecycleHistory) {
      await client.query(
        `INSERT INTO artifact_lifecycle_events (
          id, artifact_id, type, created_at, actor_user_id,
          submission_id, revision, state, note
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          event.id,
          artifact.id,
          event.type,
          event.createdAt,
          event.actorUserId,
          event.submissionId,
          event.revision,
          event.state,
          event.note,
        ],
      );
    }

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
```

### 3.5 Row-Level Locking Pattern

```typescript
/**
 * Update lifecycle state with row-level locking.
 */
async updateLifecycle(
  artifactId: string,
  newState: LifecycleState,
  context: { actorId: string; note?: string },
): Promise<void> {
  await this.ensureSchema();

  const client = await this.pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the row for update
    const { rows } = await client.query<DrizzleSkillArtifactRow>(
      'SELECT * FROM skill_artifacts WHERE id = $1 FOR UPDATE',
      [artifactId],
    );

    if (rows.length === 0) {
      throw new Error(`Artifact ${artifactId} not found`);
    }

    const artifact = rowToSkillArtifact(rows[0]!);

    // Validate transition using state machine
    transitionLifecycleState(artifact, newState, context.note ?? 'update');

    const now = new Date().toISOString();

    // Update the artifact
    await client.query(
      'UPDATE skill_artifacts SET lifecycle_state = $1, updated_at = $2 WHERE id = $3',
      [newState, now, artifactId],
    );

    // Insert lifecycle event
    await client.query(
      `INSERT INTO artifact_lifecycle_events (id, artifact_id, type, created_at, actor_user_id, state, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        `ale_${artifactId}_${Date.now()}`,
        artifactId,
        'updated',
        now,
        context.actorId,
        newState,
        context.note ?? null,
      ],
    );

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
```

### 3.6 Row-to-Record Mapping

```typescript
/**
 * Database row shape for skill_artifacts table.
 * Drizzle returns snake_case column names from PostgreSQL.
 */
interface DrizzleSkillArtifactRow {
  id: string;
  team_id: string | null;
  scope: string;
  labels: string[];
  title: string;
  slug: string;
  required_level: number;
  lifecycle_state: LifecycleState;
  owner_user_id: string;
  metadata: SkillArtifactMetadataRecord;
  agent_review: AgentReviewRecord | null;
  maintenance_meta: MaintenanceMetaRecord | null;
  decay_meta: DecayMetaRecord | null;
  evidence_meta: EvidenceMetaRecord | null;
  boundary: Boundary | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Map a Drizzle row to partial SkillArtifactRecord fields.
 */
function rowToSkillArtifact(row: DrizzleSkillArtifactRow): SkillArtifactRecord {
  return {
    id: row.id,
    teamId: row.team_id,
    scope: row.scope as 'global' | 'project',
    labels: row.labels,
    title: row.title,
    slug: row.slug,
    requiredLevel: row.required_level,
    lifecycleState: row.lifecycle_state,
    ownerUserId: row.owner_user_id,
    metadata: row.metadata,
    agentReview: row.agent_review,
    maintenanceMeta: row.maintenance_meta,
    decayMeta: row.decay_meta,
    evidenceMeta: row.evidence_meta,
    boundary: row.boundary,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    // These fields are populated separately
    latestRevision: {
      revision: 0,
      sourceHash: '',
      files: [],
      submittedAt: row.created_at.toISOString(),
      submittedByUserId: row.owner_user_id,
      scriptDescriptors: [],
      derived: null,
    },
    history: [],
    reviewHistory: [],
    reviewNotes: [],
    lifecycleHistory: [],
  };
}

/**
 * Reconstruct a full SkillArtifactRecord from database rows.
 */
function reconstructSkillArtifactRecord(
  artifactRow: DrizzleSkillArtifactRow,
  revisionRows: DrizzleArtifactRevisionRow[],
  eventRows: DrizzleArtifactLifecycleEventRow[],
): SkillArtifactRecord {
  const artifact = rowToSkillArtifact(artifactRow);

  // Populate revisions
  const revisions = revisionRows.map(rowToArtifactRevision);
  artifact.history = revisions;
  if (revisions.length > 0) {
    artifact.latestRevision = revisions[revisions.length - 1]!;
  }

  // Populate lifecycle events
  artifact.lifecycleHistory = eventRows.map(rowToArtifactLifecycleEvent);

  return artifact;
}
```

---

## Pattern 4: Migration Script

**Source:** `lib/persistence/migrate-knowledge.ts`

### 4.1 Interfaces

```typescript
export interface MigrationConfig {
  /** PostgreSQL connection pool */
  pool: Pool;
  /** Store to read artifacts from */
  store: SkillShareerStore;
  /** If true, don't write to database, just report what would be done */
  dryRun?: boolean;
  /** Batch size for processing (defaults to 100) */
  batchSize?: number;
  /** Progress callback */
  onProgress?: (info: { processed: number; total: number; artifactId: string }) => void;
}

export interface MigrationError {
  artifactId: string;
  error: string;
}

export interface MigrationResult {
  /** Total artifacts examined */
  totalArtifacts: number;
  /** Artifacts successfully migrated */
  migrated: number;
  /** Artifacts skipped (already exist in table) */
  skipped: number;
  /** Errors encountered */
  errors: MigrationError[];
  /** Total duration in milliseconds */
  durationMs: number;
}
```

### 4.2 Migration Function

```typescript
/**
 * Migrate skill artifacts from JSONB snapshot to relational tables.
 *
 * This function:
 * 1. Reads all skillArtifacts from the store snapshot
 * 2. For each artifact, checks if it already exists in the relational table
 * 3. Inserts artifacts that don't exist (idempotent)
 * 4. Reports progress and errors
 * 5. Synchronizes the SEQUENCE to max(existing_ids) + 1 after migration
 */
export async function migrateSkillArtifacts(config: MigrationConfig): Promise<MigrationResult> {
  const { pool, store, dryRun = false, batchSize = 100, onProgress } = config;

  const startTime = Date.now();
  const result: MigrationResult = {
    totalArtifacts: 0,
    migrated: 0,
    skipped: 0,
    errors: [],
    durationMs: 0,
  };

  // Get snapshot of all artifacts from JSONB store
  const data = await store.snapshot();
  const artifacts = data.skillArtifacts ?? [];
  result.totalArtifacts = artifacts.length;

  if (artifacts.length === 0) {
    result.durationMs = Date.now() - startTime;
    return result;
  }

  // Create repository for relational table operations
  const repo = new PgArtifactRepository(pool);

  // Process each artifact
  for (let i = 0; i < artifacts.length; i++) {
    const artifact = artifacts[i];
    if (!artifact) continue;

    try {
      if (dryRun) {
        // In dry-run mode, count everything as skipped
        result.skipped++;
      } else {
        // Check if already migrated (idempotent)
        const existing = await repo.getById(artifact.id);
        if (existing) {
          result.skipped++;
        } else {
          // Insert the artifact with all nested data
          await repo.insert(artifact);
          result.migrated++;
        }
      }
    } catch (error) {
      result.errors.push({
        artifactId: artifact.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Report progress
    onProgress?.({
      processed: i + 1,
      total: result.totalArtifacts,
      artifactId: artifact.id,
    });
  }

  // Synchronize SEQUENCE after migration
  if (!dryRun && result.migrated > 0) {
    await synchronizeSequence(pool, artifacts);
  }

  result.durationMs = Date.now() - startTime;
  return result;
}
```

### 4.3 SEQUENCE Synchronization

```typescript
/**
 * Synchronize the skill_artifact_id_seq to be greater than all existing IDs.
 */
async function synchronizeSequence(pool: Pool, artifacts: SkillArtifactRecord[]): Promise<void> {
  // Extract numeric IDs from artifact IDs (format: "artifact_N")
  const numericIds: number[] = [];
  for (const artifact of artifacts) {
    const match = artifact.id.match(/^artifact_(\d+)$/);
    if (match) {
      numericIds.push(parseInt(match[1]!, 10));
    } else {
      // For non-standard IDs, use hash-based approach
      const hash = simpleHash(artifact.id);
      numericIds.push(hash);
    }
  }

  if (numericIds.length === 0) {
    return;
  }

  const maxId = Math.max(...numericIds);

  // Set the sequence to maxId + 1
  await pool.query(
    `SELECT setval('skill_artifact_id_seq', $1, false)`,
    [maxId + 1],
  );
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}
```

---

## Pattern 5: Service Integration

**Source:** `lib/context.ts` and `app.ts`

### 5.1 Context Interface Update

```typescript
// In lib/context.ts
import type { ArtifactRepository } from './artifacts/index.js';

export interface SkillShareerServices {
  config: ServerConfig;
  store: SkillShareerStore;
  indexAdapters: IndexAdapter[];
  ai: AiProviders;
  /** Knowledge repository for row-level PostgreSQL operations */
  knowledgeRepo: KnowledgeRepository | undefined;
  /** Artifact repository for row-level PostgreSQL operations */
  artifactRepo: ArtifactRepository | undefined;
}
```

### 5.2 App Initialization

```typescript
// In app.ts
import { createArtifactRepository } from './lib/artifacts/index.js';

// In onReady hook:
app.addHook('onReady', async () => {
  const store = app.skillShareer.store;
  if (store instanceof PostgresStore) {
    const pool = store.getPool();

    // Create knowledge repository
    app.skillShareer.knowledgeRepo = createKnowledgeRepository({
      pool,
      store,
    });

    // Create artifact repository
    app.skillShareer.artifactRepo = createArtifactRepository({
      pool,
      store,
    });

    // ... rest of initialization
  }
});
```

---

## Pattern 6: Model Integration

**Source:** `lib/artifacts/model.ts`

### 6.1 Repository Usage in createSkillArtifactRecord

```typescript
export async function createSkillArtifactRecord(args: {
  store: SkillShareerStore;
  data: StoreData;
  artifactRepo?: ArtifactRepository; // Add optional repository
  ownerUserId: string;
  // ... other args
}): Promise<ServerSkillArtifactRecord> {
  // ... build artifact record ...

  // If repository available, use it; otherwise fall back to store mutation
  if (args.artifactRepo) {
    await args.artifactRepo.insert(artifact);
  } else {
    if (!args.data.skillArtifacts) {
      args.data.skillArtifacts = [];
    }
    args.data.skillArtifacts.push(artifact);
  }

  return artifact;
}
```

---

## Key Differences: Knowledge vs Artifacts

| Aspect | KnowledgeEntry | SkillArtifact |
|--------|---------------|---------------|
| **Content storage** | `shortcut`/`detail` text | `files[]` array with paths, hashes |
| **Derived outputs** | Not stored | `profile`, `capsules[]`, `clientManifest` |
| **Revision content** | Inline text + labels | File manifest + script descriptors |
| **Additional fields** | `boundary` | `title`, `slug`, `metadata.sourceKind` |
| **JSONB complexity** | Low | High (nested arrays in revisions) |

---

## Test Patterns

### Schema Validation Tests

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
    expect(result.rows).toContainEqual({ column_name: 'files', data_type: 'jsonb' });
  });
});
```

### Data Consistency Tests

```typescript
describe('Data Consistency', () => {
  it('should migrate all artifacts from JSONB to tables', async () => {
    const jsonbCount = (await store.snapshot()).skillArtifacts?.length ?? 0;
    const tableCount = (await pool.query('SELECT COUNT(*) FROM skill_artifacts')).rows[0].count;
    expect(parseInt(tableCount)).toBe(jsonbCount);
  });
});
```

---

*Patterns extracted from Phase 61, Phase 62, and existing codebase*
