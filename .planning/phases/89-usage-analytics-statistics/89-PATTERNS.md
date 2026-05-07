# Phase 89: Usage Analytics & Statistics - Pattern Mapping

**Generated:** 2026-05-06
**Phase:** 89 - usage-analytics-statistics

## Files to Create/Modify

| File | Action | Role | Data Flow | Analog |
|------|--------|------|-----------|--------|
| `packages/server/src/lib/analytics/index.ts` | CREATE | Barrel export | N/A | `lib/knowledge/index.ts` |
| `packages/server/src/lib/analytics/repository.ts` | CREATE | Repository interface | N/A | `lib/knowledge/repository.ts` |
| `packages/server/src/lib/analytics/pg-repository.ts` | CREATE | PG implementation | Writes to usage_events table | `lib/knowledge/pg-repository.ts` |
| `packages/server/src/lib/analytics/pg-repository.test.ts` | CREATE | Unit tests | Tests repository methods | `lib/knowledge/pg-repository.test.ts` |
| `packages/server/src/routes/operations/stats.ts` | CREATE | REST endpoints | Reads from repository | `routes/operations/audit.ts` |
| `packages/server/src/routes/operations/stats.test.ts` | CREATE | Route tests | Tests HTTP endpoints | `routes/operations/audit.test.ts` |
| `packages/server/src/lib/persistence/schema.ts` | MODIFY | Schema definition | Adds usageEvents table | Existing table definitions |
| `packages/contracts/src/domain/common.ts` | MODIFY | Permission enum | Adds stats:read permission | Existing permissionSchema |
| `packages/contracts/src/domain/operations.ts` | MODIFY | API contracts | Adds stats query/response schemas | Existing auditQuerySchema |
| `packages/server/src/lib/rbac.ts` | MODIFY | Permission mapping | Adds stats:read to role templates | Existing ROLE_TEMPLATE_PERMISSIONS |
| `packages/server/src/lib/context.ts` | MODIFY | DI container | Adds usageAnalyticsRepo | Existing repo fields |
| `packages/server/src/routes/retrieval.ts` | MODIFY | Event ingestion | Fire-and-forget recording | Existing logUserOperation pattern |
| `packages/server/src/app.ts` | MODIFY | App wiring | Wires repository on onReady | Existing repository wiring |
| `packages/server/src/routes/operations/index.ts` | MODIFY | Route barrel | Exports statsRoutes | Existing exports |

---

## File: `packages/server/src/lib/analytics/repository.ts`

**Role:** Repository interface
**Data Flow:** N/A (interface definition only)
**Analog:** `packages/server/src/lib/knowledge/repository.ts` (lines 33-94)

**Pattern:**
```typescript
// EXCERPT FROM lib/knowledge/repository.ts (lines 33-50)
/**
 * Repository interface for knowledge entry CRUD operations.
 * Abstracts whether data lives in JSONB or dedicated PostgreSQL tables.
 *
 * This interface enables the dual-write pattern during transition
 * from JSONB snapshot storage to row-level PostgreSQL tables.
 */
export interface KnowledgeRepository {
  /**
   * Generate a new unique knowledge entry ID.
   * Uses PostgreSQL SEQUENCE for monotonic ID generation.
   */
  nextId(): Promise<string>;

  /**
   * Insert a new knowledge entry.
   * The entry ID should be pre-generated via nextId().
   */
  insert(entry: KnowledgeRecord): Promise<void>;
  // ... more methods
}
```

**Apply to Phase 89:**
```typescript
// NEW FILE: packages/server/src/lib/analytics/repository.ts
import type { Pool } from 'pg';

/**
 * Usage event input for recording retrieval hits.
 */
export interface UsageEventInput {
  queryId: string;
  teamId: string | null;
  accountId: string;
  entryType: 'skill' | 'trap' | 'knowledge';
  entryId: string;
  queryText?: string;
}

/**
 * Repository interface for usage analytics operations.
 * Abstracts analytics data access for PostgreSQL-backed storage.
 */
export interface UsageAnalyticsRepository {
  /**
   * Record a single usage event (fire-and-forget).
   */
  recordEvent(event: UsageEventInput): Promise<void>;

  /**
   * Batch record multiple usage events (for fire-and-forget after retrieval).
   */
  recordEvents(events: UsageEventInput[]): Promise<void>;

  /**
   * Query usage time-series aggregated by time bucket.
   */
  queryUsageTimeSeries(params: {
    teamId?: string;
    accountId?: string;
    from: Date;
    to: Date;
    granularity: 'hour' | 'day' | 'week' | 'month';
  }): Promise<Array<{ period: string; count: number }>>;

  /**
   * Query hit ranking (top N entries by hit count).
   */
  queryHitRanking(params: {
    teamId?: string;
    entryType?: 'skill' | 'trap' | 'knowledge';
    from?: Date;
    to?: Date;
    limit: number;
  }): Promise<Array<{ entryId: string; entryType: string; count: number }>>;

  /**
   * Query system-wide summary statistics.
   */
  querySystemSummary(params: {
    from?: Date;
    to?: Date;
  }): Promise<{
    totalEvents: number;
    uniqueQueries: number;
    uniqueTeams: number;
    uniqueAccounts: number;
  }>;

  /**
   * Archive events older than specified days.
   */
  archiveOldEvents(olderThanDays: number): Promise<{ archivedCount: number }>;
}
```

---

## File: `packages/server/src/lib/analytics/pg-repository.ts`

**Role:** PostgreSQL implementation
**Data Flow:** Writes to `usage_events` table, reads for aggregation queries
**Analog:** `packages/server/src/lib/knowledge/pg-repository.ts` (lines 29-502)

**Key Patterns to Follow:**

### 1. Constructor with Drizzle initialization
```typescript
// EXCERPT FROM lib/knowledge/pg-repository.ts (lines 29-37)
export class PgKnowledgeRepository implements KnowledgeRepository {
  private db: ReturnType<typeof drizzle>;
  private initialized = false;

  constructor(private readonly pool: Pool) {
    this.db = drizzle(pool, {
      schema: { knowledgeEntries, knowledgeRevisions, lifecycleEvents },
    });
  }
```

### 2. Schema ensure pattern
```typescript
// EXCERPT FROM lib/knowledge/pg-repository.ts (lines 43-123)
private async ensureSchema(): Promise<void> {
  if (this.initialized) return;

  // Create SEQUENCE for ID generation
  await this.pool.query(`
    CREATE SEQUENCE IF NOT EXISTS knowledge_entry_id_seq START 1
  `);

  // Create table
  await this.pool.query(`
    CREATE TABLE IF NOT EXISTS knowledge_entries (
      id TEXT PRIMARY KEY,
      team_id TEXT,
      // ...
    )
  `);

  // Create indexes
  await this.pool.query(`
    CREATE INDEX IF NOT EXISTS idx_knowledge_entries_lifecycle_state
    ON knowledge_entries (lifecycle_state)
  `);

  this.initialized = true;
}
```

### 3. Time-series aggregation with date_trunc
```typescript
// PATTERN FROM RESEARCH (not in existing code, but follows Drizzle patterns)
import { sql, count, and, gte, lte, eq } from 'drizzle-orm';

async queryUsageTimeSeries(params) {
  await this.ensureSchema();

  const conditions = [];
  if (params.teamId) conditions.push(eq(usageEvents.teamId, params.teamId));
  if (params.accountId) conditions.push(eq(usageEvents.accountId, params.accountId));
  conditions.push(gte(usageEvents.createdAt, params.from));
  conditions.push(lte(usageEvents.createdAt, params.to));

  const truncatedDate = sql`date_trunc(${params.granularity}, ${usageEvents.createdAt})`;

  const result = await this.db
    .select({
      period: truncatedDate.mapWith(String),
      count: count(),
    })
    .from(usageEvents)
    .where(and(...conditions))
    .groupBy(truncatedDate)
    .orderBy(truncatedDate);

  return result;
}
```

---

## File: `packages/server/src/lib/analytics/pg-repository.test.ts`

**Role:** Unit tests for repository
**Data Flow:** Tests against real PostgreSQL (conditional on DATABASE_URL)
**Analog:** `packages/server/src/lib/knowledge/pg-repository.test.ts` (lines 1-487)

**Key Patterns:**

### 1. Conditional test suite
```typescript
// EXCERPT FROM lib/knowledge/pg-repository.test.ts (lines 24-35)
const DATABASE_URL = process.env.TRAPMAP_DATABASE_URL || process.env.DATABASE_URL;
const describeIfDb = DATABASE_URL ? describe : describe.skip;

let pool: Pool | null = null;

async function getPool(): Promise<Pool | null> {
  if (!DATABASE_URL) return null;
  if (pool) return pool;
  pool = new PgPool({ connectionString: DATABASE_URL });
  return pool;
}
```

### 2. Cleanup pattern
```typescript
// EXCERPT FROM lib/knowledge/pg-repository.test.ts (lines 120-125)
beforeEach(async () => {
  // Clean up test data before each test
  await testPool.query("DELETE FROM knowledge_entries WHERE id LIKE 'knowledge_test_%'");
  await testPool.query("DELETE FROM knowledge_revisions WHERE entry_id LIKE 'knowledge_test_%'");
  await testPool.query("DELETE FROM lifecycle_events WHERE entry_id LIKE 'knowledge_test_%'");
});
```

### 3. Test helper creation
```typescript
// EXCERPT FROM lib/knowledge/pg-repository.test.ts (lines 38-103)
function createTestEntry(overrides: Partial<KnowledgeRecord> = {}): KnowledgeRecord {
  const now = nowIso();
  return {
    id: 'knowledge_test_1',
    teamId: null,
    // ... all required fields
    ...overrides,
  };
}
```

---

## File: `packages/server/src/routes/operations/stats.ts`

**Role:** REST endpoints for statistics
**Data Flow:** HTTP request → auth resolution → permission check → repository query → response
**Analog:** `packages/server/src/routes/operations/audit.ts` (lines 1-39)

**Key Pattern:**
```typescript
// EXCERPT FROM routes/operations/audit.ts (full file)
import { auditListResponseSchema, auditQuerySchema } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { createAuditEvent, queryAuditEvents, toAuditEvent } from '../../lib/audit.js';
import { requirePermission } from '../../lib/rbac.js';
import { resolveAuthContext } from '../../lib/session.js';

export const auditRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/operations/audit', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'audit:read');

    const query = auditQuerySchema.parse(request.query as Record<string, unknown>);
    const data = await app.skillShareer.store.snapshot();

    const result = queryAuditEvents({
      data,
      query: {
        ...(query.action !== undefined && { action: query.action }),
        // ... filter mapping
        limit: query.limit,
      },
      auth,
    });

    const items = result.items.map((record) => toAuditEvent(record, data));

    return auditListResponseSchema.parse({
      items,
      nextCursor: null,
      total: result.total,
    });
  });
};
```

**Apply to Phase 89:**
```typescript
// NEW FILE: packages/server/src/routes/operations/stats.ts
import { statsUsageQuerySchema, statsUsageResponseSchema } from '@trapmap/contracts';
import type { FastifyPluginAsync } from 'fastify';

import { AppError } from '../../lib/errors.js';
import { requirePermission } from '../../lib/rbac.js';
import { resolveAuthContext } from '../../lib/session.js';

export const statsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/v1/operations/stats/usage', async (request) => {
    const auth = await resolveAuthContext(app.skillShareer, request);
    requirePermission(auth, 'stats:read');

    const repo = app.skillShareer.usageAnalyticsRepo;
    if (!repo) {
      throw new AppError(503, 'analytics_unavailable', 'Analytics requires PostgreSQL');
    }

    const query = statsUsageQuerySchema.parse(request.query as Record<string, unknown>);

    // Non-system-admin can only see their own team's data
    const teamId = auth.subjectType === 'system-admin'
      ? query.teamId
      : auth.activeTeamId;

    const result = await repo.queryUsageTimeSeries({
      teamId: teamId ?? undefined,
      from: new Date(query.from),
      to: new Date(query.to),
      granularity: query.granularity,
    });

    return statsUsageResponseSchema.parse({ items: result });
  });

  app.get('/v1/operations/stats/hits', async (request) => {
    // Similar pattern for hit ranking
  });

  app.get('/v1/operations/stats/summary', async (request) => {
    // System-admin only for system-wide summary
  });
};
```

---

## File: `packages/server/src/lib/persistence/schema.ts`

**Role:** Drizzle schema definitions
**Data Flow:** Defines table structure for migrations and queries
**Analog:** Existing table definitions (lines 217-256 for knowledge_entries)

**Key Pattern:**
```typescript
// EXCERPT FROM lib/persistence/schema.ts (lines 217-256)
export const knowledgeEntries = pgTable(
  'knowledge_entries',
  {
    /** Unique entry identifier (e.g., knowledge_123) */
    id: text('id').primaryKey(),
    /** Team ID if team-scoped, null for global */
    teamId: text('team_id'),
    /** Scope: 'global' or 'project' */
    scope: text('scope').notNull(),
    /** Labels for filtering and categorization */
    labels: jsonb('labels').notNull().$type<string[]>().default([]),
    // ... more columns
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_knowledge_entries_lifecycle_state').on(table.lifecycleState),
    index('idx_knowledge_entries_team').on(table.teamId),
  ],
);
```

**Apply to Phase 89:**
```typescript
// ADD TO lib/persistence/schema.ts
/**
 * Usage events table for recording retrieval hits.
 * Each row represents one hit on a knowledge entry or skill artifact.
 * Enables time-series analytics and hit ranking queries.
 */
export const usageEvents = pgTable(
  'usage_events',
  {
    /** Unique event identifier */
    id: text('id').primaryKey(),
    /** Query ID grouping hits from same search request */
    queryId: text('query_id').notNull(),
    /** Team ID (maps to "organization" in requirements) */
    teamId: text('team_id'),
    /** Account ID of the user who made the request */
    accountId: text('account_id').notNull(),
    /** Entry type: 'skill' | 'trap' | 'knowledge' */
    entryType: text('entry_type').notNull(),
    /** The hit entry's ID */
    entryId: text('entry_id').notNull(),
    /** Optional original query text */
    queryText: text('query_text'),
    /** Event timestamp */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Composite indexes matching query patterns
    index('idx_usage_events_team_created').on(table.teamId, table.createdAt),
    index('idx_usage_events_account_created').on(table.accountId, table.createdAt),
    index('idx_usage_events_entry_type_created').on(table.entryType, table.createdAt),
    index('idx_usage_events_entry_id_created').on(table.entryId, table.createdAt),
  ],
);
```

---

## File: `packages/contracts/src/domain/common.ts`

**Role:** Shared type definitions
**Data Flow:** Defines Permission enum used across packages
**Analog:** Existing permissionSchema (lines 20-35)

**Key Pattern:**
```typescript
// EXCERPT FROM contracts/src/domain/common.ts (lines 20-35)
export const permissionSchema = z.enum([
  'session:read',
  'team:create',
  'team:list',
  'team:select',
  'member:create',
  'member:update',
  'member:key:create',
  'knowledge:submit',
  'knowledge:search',
  'knowledge:review',
  'knowledge:update',
  'knowledge:export',
  'knowledge:import',
  'audit:read',
]);
```

**Apply to Phase 89:**
```typescript
// MODIFY: Add 'stats:read' to the enum
export const permissionSchema = z.enum([
  'session:read',
  'team:create',
  'team:list',
  'team:select',
  'member:create',
  'member:update',
  'member:key:create',
  'knowledge:submit',
  'knowledge:search',
  'knowledge:review',
  'knowledge:update',
  'knowledge:export',
  'knowledge:import',
  'audit:read',
  'stats:read',  // NEW
]);
```

---

## File: `packages/server/src/lib/rbac.ts`

**Role:** Permission mapping
**Data Flow:** Maps role templates to permissions
**Analog:** Existing ROLE_TEMPLATE_PERMISSIONS (lines 9-13)

**Key Pattern:**
```typescript
// EXCERPT FROM lib/rbac.ts (lines 1-13)
import type { Permission, RoleTemplate } from '@trapmap/contracts';
import { permissionSchema } from '@trapmap/contracts';

const ALL_PERMISSIONS = [...permissionSchema.options];

export const ROLE_TEMPLATE_PERMISSIONS: Record<RoleTemplate, Permission[]> = {
  user: ['session:read', 'team:list', 'team:select', 'knowledge:submit', 'knowledge:search'],
  admin: [...ALL_PERMISSIONS],
  'system-admin': [...ALL_PERMISSIONS],
};
```

**Apply to Phase 89:**
No changes needed here if using `ALL_PERMISSIONS` - it will automatically include the new permission.
If explicit list, add 'stats:read' to user role if team-scoped access is desired, or keep admin-only.

---

## File: `packages/server/src/lib/context.ts`

**Role:** Dependency injection container
**Data Flow:** Holds service references including repositories
**Analog:** Existing SkillShareerServices interface (lines 15-34)

**Key Pattern:**
```typescript
// EXCERPT FROM lib/context.ts (lines 15-34)
export interface SkillShareerServices {
  config: ServerConfig;
  store: SkillShareerStore;
  indexAdapters: IndexAdapter[];
  ai: AiProviders;
  /** Knowledge repository for row-level PostgreSQL operations (undefined when using JsonStore) */
  knowledgeRepo: KnowledgeRepository | undefined;
  /** Artifact repository for row-level PostgreSQL operations (undefined when using JsonStore) */
  artifactRepo: ArtifactRepository | undefined;
  /** Session repository for auth operations (undefined when using JsonStore) */
  sessionRepo: SessionRepository | undefined;
  /** Access key repository for auth operations (undefined when using JsonStore) */
  accessKeyRepo: AccessKeyRepository | undefined;
  /** User repository for user operations (undefined when using JsonStore) */
  userRepo: UserRepository | undefined;
  /** Team repository for team operations (undefined when using JsonStore) */
  teamRepo: TeamRepository | undefined;
  /** Membership repository for membership operations (undefined when using JsonStore) */
  membershipRepo: MembershipRepository | undefined;
}
```

**Apply to Phase 89:**
```typescript
// ADD to SkillShareerServices interface
export interface SkillShareerServices {
  // ... existing fields
  /** Usage analytics repository for statistics (undefined when using JsonStore) */
  usageAnalyticsRepo: UsageAnalyticsRepository | undefined;
}
```

---

## File: `packages/server/src/routes/retrieval.ts`

**Role:** Retrieval endpoints with fire-and-forget logging
**Data Flow:** HTTP request → retrieval → fire-and-forget usage event recording
**Analog:** Existing logUserOperation pattern (lines 40-52)

**Key Pattern:**
```typescript
// EXCERPT FROM routes/retrieval.ts (lines 40-56)
// Execute retrieval search
const result = await searchKnowledge(app.skillShareer, auth, query);

// Log user operation (fire-and-forget)
void logUserOperation(app.skillShareer.config.userOpsLog, {
  timestamp: nowIso(),
  actorId: auth.actorId,
  actorHandle: auth.handle,
  action: 'search',
  targetId: null,
  teamId: auth.activeTeamId,
  metadata: {
    endpoint: 'v1-retrieval-search',
    resultCount: result.globalConstraints.length + result.projectKnowledge.length,
  },
});

// Validate and return response
return retrievalResponseSchema.parse(result);
```

**Apply to Phase 89:**
```typescript
// ADD after successful retrieval, alongside logUserOperation
// Record usage events (fire-and-forget)
if (app.skillShareer.usageAnalyticsRepo) {
  void app.skillShareer.usageAnalyticsRepo.recordEvents(
    buildUsageEvents(auth, result, queryId)
  );
}
```

---

## File: `packages/server/src/app.ts`

**Role:** Application wiring
**Data Flow:** Wires repositories on onReady hook
**Analog:** Existing repository wiring (lines 236-283)

**Key Pattern:**
```typescript
// EXCERPT FROM app.ts (lines 236-283)
app.addHook('onReady', async () => {
  // Check if store is PostgreSQL-backed
  const store = app.skillShareer.store;
  if (store instanceof PostgresStore) {
    const pool = store.getPool();

    // Create knowledge repository for row-level operations
    app.skillShareer.knowledgeRepo = createKnowledgeRepository({
      pool,
      store,
    });

    // Create artifact repository for row-level operations
    app.skillShareer.artifactRepo = createArtifactRepository({
      pool,
      store,
    });
    // ... more repositories
  }
});
```

**Apply to Phase 89:**
```typescript
// ADD inside the PostgresStore block
// Create usage analytics repository for statistics
app.skillShareer.usageAnalyticsRepo = createUsageAnalyticsRepository({ pool });
```

Also add to initial decoration (lines 155-174):
```typescript
app.decorate('skillShareer', {
  // ... existing fields
  // usageAnalyticsRepo is set when PostgreSQL pool is available (in onReady hook)
  usageAnalyticsRepo: undefined,
});
```

---

## File: `packages/contracts/src/domain/operations.ts`

**Role:** API contracts for operations endpoints
**Data Flow:** Defines request/response schemas for stats endpoints
**Analog:** Existing auditQuerySchema and auditListResponseSchema (lines 246-274)

**Key Pattern:**
```typescript
// EXCERPT FROM contracts/src/domain/operations.ts (lines 246-274)
export const auditQuerySchema = z.object({
  action: z.array(z.enum([...])).optional(),
  actorId: entityIdSchema.optional(),
  entityId: entityIdSchema.optional(),
  teamId: entityIdSchema.optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).max(128).optional(),
});

export const auditListResponseSchema = z.object({
  items: z.array(auditEventSchema),
  nextCursor: z.string().min(1).max(128).nullable(),
  total: z.number().int().min(0),
});
```

**Apply to Phase 89:**
```typescript
// ADD to contracts/src/domain/operations.ts
export const statsUsageQuerySchema = z.object({
  teamId: entityIdSchema.optional(),
  accountId: entityIdSchema.optional(),
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  granularity: z.enum(['hour', 'day', 'week', 'month']).default('day'),
});

export const statsUsageItemSchema = z.object({
  period: z.string(),
  count: z.number().int().min(0),
});

export const statsUsageResponseSchema = z.object({
  items: z.array(statsUsageItemSchema),
});

export const statsHitRankingQuerySchema = z.object({
  teamId: entityIdSchema.optional(),
  entryType: z.enum(['skill', 'trap', 'knowledge']).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  limit: z.number().int().min(1).max(100).default(10),
});

export const statsHitRankingItemSchema = z.object({
  entryId: entityIdSchema,
  entryType: z.enum(['skill', 'trap', 'knowledge']),
  count: z.number().int().min(0),
});

export const statsHitRankingResponseSchema = z.object({
  items: z.array(statsHitRankingItemSchema),
});

export const statsSummaryQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});

export const statsSummaryResponseSchema = z.object({
  totalEvents: z.number().int().min(0),
  uniqueQueries: z.number().int().min(0),
  uniqueTeams: z.number().int().min(0),
  uniqueAccounts: z.number().int().min(0),
});

export type StatsUsageQuery = z.infer<typeof statsUsageQuerySchema>;
export type StatsUsageResponse = z.infer<typeof statsUsageResponseSchema>;
export type StatsHitRankingQuery = z.infer<typeof statsHitRankingQuerySchema>;
export type StatsHitRankingResponse = z.infer<typeof statsHitRankingResponseSchema>;
export type StatsSummaryQuery = z.infer<typeof statsSummaryQuerySchema>;
export type StatsSummaryResponse = z.infer<typeof statsSummaryResponseSchema>;
```

---

## Summary: Key Architectural Decisions

1. **Fire-and-forget pattern**: Use `void repo.recordEvents(...)` after successful retrieval, matching existing `void logUserOperation(...)` pattern

2. **Conditional repository availability**: Repository is `undefined` when PostgreSQL is not configured, matching existing pattern for knowledgeRepo, artifactRepo, etc.

3. **Permission gating**: Use `requirePermission(auth, 'stats:read')` pattern, with team scoping for non-system-admin users

4. **Time-series aggregation**: Use Drizzle `sql` template tag with PostgreSQL `date_trunc()` for time bucketing

5. **Composite indexes**: Create indexes matching actual query patterns (team+created, entry_type+created, etc.)

6. **Event granularity**: One row per result hit (not per search query), enabling hit ranking queries

7. **503 on missing PostgreSQL**: Stats endpoints throw `AppError(503, 'analytics_unavailable', ...)` when PG is not configured
