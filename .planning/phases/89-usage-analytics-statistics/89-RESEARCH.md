# Phase 89: Usage Analytics & Statistics - Research

**Researched:** 2026-05-06
**Domain:** PostgreSQL time-series analytics, async event ingestion, REST API design
**Confidence:** HIGH

## Summary

Phase 89 adds usage analytics to TrapMap: an `usage_events` PostgreSQL table for recording every retrieval hit, three statistics APIs (usage time-series, hit ranking, system summary), and a data archival mechanism for events older than 90 days. The work sits entirely in the `packages/server` package.

The codebase already has all the building blocks this phase needs: (1) Drizzle ORM is the standard persistence layer (v0.45.2), with `sql` template tag for custom SQL expressions like `date_trunc`; (2) a repository pattern (`KnowledgeRepository`, `ArtifactRepository`, etc.) for PostgreSQL-backed data access; (3) `SkillShareerServices` decorated on Fastify for dependency injection; (4) `ResolvedAuthContext` carries `activeTeamId`, `actorId`, `subjectType`, and `effectivePermissions` for permission checks; (5) a fire-and-forget logging pattern via `void logUserOperation(...)` that the new event ingestion should mirror.

**Primary recommendation:** Add a `UsageAnalyticsRepository` interface with a PostgreSQL implementation using Drizzle ORM, register it on `SkillShareerServices`, and add `void` fire-and-forget calls in the retrieval routes (not the orchestrator internals) to avoid blocking the retrieval pipeline. For time-series aggregation queries, use Drizzle's `sql` template tag with PostgreSQL `date_trunc()` and `count()` -- the same pattern already used in `pg-keyword.ts`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
All implementation choices are at Claude's discretion -- discuss phase was skipped per user setting. Use ROADMAP phase goal, success criteria, and codebase conventions to guide decisions.

### Claude's Discretion
All implementation choices.

### Deferred Ideas (OUT OF SCOPE)
None -- discuss phase skipped.
</user_constraints>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Event ingestion (write usage_events) | API / Backend | -- | Writes happen server-side after successful retrieval |
| Time-series aggregation queries | API / Backend | Database / Storage | PostgreSQL does the heavy lifting via date_trunc + GROUP BY |
| Permission gating (stats access) | API / Backend | -- | Server-side RBAC enforcement using existing permission system |
| Data archival (90-day rollup) | Database / Storage | CLI | Archival is a database operation; CLI provides the trigger |
| Statistics API routes | API / Backend | -- | REST endpoints registered as Fastify plugins |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm | ^0.45.2 | Schema definition, queries, migrations | Already used for all PG tables [VERIFIED: package.json] |
| drizzle-kit | ^0.31.10 | Migration generation | Already configured with drizzle.config.ts [VERIFIED: package.json] |
| pg | ^8.20.0 | PostgreSQL client | Already used via Pool [VERIFIED: package.json] |
| fastify | ^5.6.1 | HTTP framework | All routes are Fastify plugins [VERIFIED: package.json] |
| zod | ^4.3.6 | Schema validation | Contracts package uses Zod for all request/response schemas [VERIFIED: package.json] |
| vitest | (workspace) | Test framework | All test files use vitest [VERIFIED: vitest.config.ts] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pg-mem | ^3.0.14 | In-memory PG for tests | Already used in existing PG repository tests [VERIFIED: package.json] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Drizzle sql tag for date_trunc | Raw pg Pool queries | Drizzle sql tag is type-safe and consistent with existing codebase. Raw queries work but lose type safety. |
| Separate analytics database | Same PG database | Separate DB adds operational complexity. Same DB is simpler and the query volume is expected to be manageable with proper indexing. |

**Installation:**
No new dependencies required -- all needed packages are already installed.

**Version verification:**
```
drizzle-orm: 0.45.2 (installed, matches latest npm registry)
zod: ^4.3.6 (installed)
fastify: ^5.6.1 (installed)
vitest: workspace-level
```

## Architecture Patterns

### System Architecture Diagram

```
Retrieval Routes (retrieval.ts)
  |
  +-- searchKnowledge/searchKnowledgeV2/...
        |
        v
  Retrieval Orchestrator (orchestrator.ts)
        |
        v  (after successful result)
  [NEW] void recordUsageEvents(pool, auth, result)
        |  (fire-and-forget, non-blocking)
        v
  usage_events table (PostgreSQL)
        |
        +----------------+------------------+
        |                |                  |
        v                v                  v
  GET /stats/usage   GET /stats/hits   GET /stats/summary
  (time-series)      (ranking)         (aggregate)
        |                |                  |
        v                v                  v
  UsageAnalyticsRepository  (PG queries with date_trunc, GROUP BY)
```

### Recommended Project Structure
```
packages/server/src/
  lib/
    analytics/
      index.ts              # Barrel export
      repository.ts         # UsageAnalyticsRepository interface
      pg-repository.ts      # PostgreSQL implementation
      pg-repository.test.ts # Tests
  routes/
    operations/
      stats.ts              # Stats route handlers
      stats.test.ts         # Stats route tests
  lib/persistence/
    schema.ts               # Add usageEvents table definition
```

### Pattern 1: Repository Pattern (follows existing KnowledgeRepository)
**What:** Interface + Pg* implementation + factory function
**When to use:** All PostgreSQL-backed data access
**Example:**
```typescript
// repository.ts
export interface UsageAnalyticsRepository {
  recordEvent(event: UsageEventInput): Promise<void>;
  recordEvents(events: UsageEventInput[]): Promise<void>;
  queryUsageTimeSeries(params: UsageTimeSeriesQuery): Promise<TimeSeriesBucket[]>;
  queryHitRanking(params: HitRankingQuery): Promise<HitRankingEntry[]>;
  querySystemSummary(params: SummaryQuery): Promise<SystemSummary>;
  archiveOldEvents(olderThanDays: number): Promise<ArchiveResult>;
}

// pg-repository.ts
export class PgUsageAnalyticsRepository implements UsageAnalyticsRepository {
  private db: ReturnType<typeof drizzle>;
  constructor(private readonly pool: Pool) {
    this.db = drizzle(pool, { schema: { usageEvents } });
  }
  // ...
}
```
[VERIFIED: pattern matches packages/server/src/lib/knowledge/repository.ts and pg-repository.ts]

### Pattern 2: Fire-and-Forget Event Recording (follows existing logUserOperation pattern)
**What:** Use `void` to fire-and-forget async writes from the retrieval route
**When to use:** Non-critical side effects that must not block the response
**Example:**
```typescript
// In retrieval route, after successful search:
if (app.skillShareer.usageAnalyticsRepo) {
  void app.skillShareer.usageAnalyticsRepo.recordEvents(
    buildUsageEvents(auth, result)
  );
}
```
[VERIFIED: pattern matches routes/retrieval.ts lines 41-52]

### Pattern 3: Time-Series Aggregation with Drizzle sql tag
**What:** Use Drizzle's `sql` template tag for PostgreSQL-specific aggregation
**When to use:** GROUP BY with date_trunc for time bucketing
**Example:**
```typescript
import { sql, count } from 'drizzle-orm';

const truncatedDate = sql`date_trunc(${granularity}, ${usageEvents.createdAt})`;

const result = await this.db
  .select({
    period: truncatedDate.mapWith(String),
    total: count(),
  })
  .from(usageEvents)
  .where(and(...conditions))
  .groupBy(truncatedDate)
  .orderBy(truncatedDate);
```
[CITED: github.com/drizzle-team/drizzle-orm/discussions/2893 -- community-verified pattern for date_trunc with Drizzle]

### Pattern 4: Conditional Repository (follows existing PostgresStore pattern)
**What:** Repository is only available when PostgreSQL is configured
**When to use:** Services that require PG and should gracefully degrade
**Example:**
```typescript
// In context.ts, add to SkillShareerServices:
usageAnalyticsRepo: UsageAnalyticsRepository | undefined;

// In app.ts onReady hook:
if (store instanceof PostgresStore) {
  app.skillShareer.usageAnalyticsRepo = createUsageAnalyticsRepository({ pool });
}
```
[VERIFIED: pattern matches existing knowledgeRepo/artifactRepo/sessionRepo setup in app.ts]

### Anti-Patterns to Avoid
- **Synchronous event writes in retrieval pipeline:** Must use fire-and-forget. Analytics failures should never block a retrieval response. [ASSUMED]
- **Putting analytics logic inside the orchestrator internals:** The retrieval routes already have `void logUserOperation(...)` hooks. Follow the same pattern at the route level, not deep in the pipeline. [VERIFIED: existing pattern in routes/retrieval.ts]
- **Adding stats permission to existing role templates without contracts update:** Any new permission must be added to `permissionSchema` in contracts. [VERIFIED: contracts/src/domain/common.ts line 20-35]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Time bucketing (day/week/month) | Custom date math in TypeScript | PostgreSQL `date_trunc()` via Drizzle `sql` tag | PG handles timezone, edge cases, DST transitions |
| Table creation and migrations | Manual SQL strings for schema | Drizzle schema.ts + drizzle-kit generate | Existing pattern, type-safe, version-controlled |
| Permission checking | Custom role checks in route handler | `requirePermission()` from lib/rbac.ts | Already handles system-admin bypass and permission list |
| Request validation | Manual type guards | Zod schemas in contracts package | Consistent validation, generates types |

**Key insight:** The codebase has a mature repository pattern with Pg* implementations. Following this pattern exactly means the new analytics module integrates seamlessly with existing DI and test infrastructure.

## Common Pitfalls

### Pitfall 1: Forgetting to Add New Permission to Contracts
**What goes wrong:** Adding a permission like `stats:read` only to the RBAC module, not to the Zod `permissionSchema` enum.
**Why it happens:** The permission enum in `contracts/src/domain/common.ts` is the single source of truth.
**How to avoid:** Add `stats:read` to `permissionSchema` first, then add it to `ROLE_TEMPLATE_PERMISSIONS` in `rbac.ts`.
**Warning signs:** TypeScript compilation errors or Zod parse failures at runtime.

### Pitfall 2: Blocking Retrieval Pipeline with Analytics Writes
**What goes wrong:** `await`-ing the analytics write inside the retrieval handler.
**Why it happens:** Forgetting to use fire-and-forget pattern.
**How to avoid:** Always use `void repo.recordEvents(...)` pattern, matching the existing `void logUserOperation(...)` calls in retrieval routes.
**Warning signs:** Increased retrieval latency; analytics failures causing 500s on search endpoints.

### Pitfall 3: Missing Composite Indexes for Query Patterns
**What goes wrong:** Creating individual indexes on `organization_id`, `account_id`, `created_at`, `entry_type` separately instead of composite indexes covering actual queries.
**Why it happens:** Following the requirement literally instead of analyzing query patterns.
**How to avoid:** Create composite indexes that match the actual WHERE + GROUP BY patterns: `(organization_id, created_at)`, `(entry_type, created_at)`, `(entry_id, created_at)`.
**Warning signs:** Slow stats API responses as data grows.

### Pitfall 4: organization_id vs team_id Naming Mismatch
**What goes wrong:** The ROADMAP says `organization_id` but the existing codebase uses `teamId` everywhere (teams, memberships, knowledge entries).
**Why it happens:** ROADMAP uses generic "organization" terminology, but the actual domain model calls them "teams."
**How to avoid:** Use `team_id` as the column name in usage_events to match the existing schema. The concept of "organization" maps 1:1 to "team" in TrapMap.
**Warning signs:** Confusion when joining with teams/memberships tables; inconsistent naming.

### Pitfall 5: Recording One Event per Hit vs One Event per Search
**What goes wrong:** Recording one row per search request OR one row per result hit -- the requirement is ambiguous.
**Why it happens:** The ROADMAP says "record each retrieval request" but also says "record hit entry's entry_type and entry_id."
**How to avoid:** Record one event per result hit (each returned entry gets a row). This enables hit ranking queries. The search request count can be derived by counting distinct queries or adding a `query_id` field.
**Warning signs:** Unable to build hit ranking without per-hit granularity.

### Pitfall 6: Archival Without Testing Against Production Data Shapes
**What goes wrong:** The archival mechanism aggregates and deletes, but edge cases (empty periods, partial data) cause data loss.
**Why it happens:** Archival is destructive; testing requires realistic data.
**How to avoid:** Write archival as an idempotent operation that can be re-run safely. Test with edge cases: empty tables, single-row tables, data exactly at the 90-day boundary.
**Warning signs:** Data disappears after archival run; unable to recover.

## Code Examples

### Usage Events Table Schema (Drizzle)
```typescript
// In packages/server/src/lib/persistence/schema.ts
export const usageEvents = pgTable(
  'usage_events',
  {
    id: text('id').primaryKey(),
    queryId: text('query_id').notNull(),           // Groups hits from same search
    teamId: text('team_id'),                        // Maps to "organization_id" in requirements
    accountId: text('account_id').notNull(),        // Maps to user who made the request
    entryType: text('entry_type').notNull(),        // 'skill' | 'trap' | 'knowledge'
    entryId: text('entry_id').notNull(),            // The hit entry's ID
    queryText: text('query_text'),                  // Optional original query
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_usage_events_team_created').on(table.teamId, table.createdAt),
    index('idx_usage_events_account_created').on(table.accountId, table.createdAt),
    index('idx_usage_events_entry_type_created').on(table.entryType, table.createdAt),
    index('idx_usage_events_entry_id_created').on(table.entryId, table.createdAt),
  ],
);
```
[VERIFIED: pattern matches existing table definitions in schema.ts]

### Adding stats:read Permission
```typescript
// In packages/contracts/src/domain/common.ts
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
  'stats:read',      // NEW
]);

// In packages/server/src/lib/rbac.ts
export const ROLE_TEMPLATE_PERMISSIONS: Record<RoleTemplate, Permission[]> = {
  user: ['session:read', 'team:list', 'team:select', 'knowledge:submit', 'knowledge:search'],
  admin: [...ALL_PERMISSIONS],
  'system-admin': [...ALL_PERMISSIONS],
};
```
[VERIFIED: matches existing permission/RBAC structure]

### Stats Route Pattern
```typescript
// In packages/server/src/routes/operations/stats.ts
import type { FastifyPluginAsync } from 'fastify';
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

    // Parse query params, filter by team for non-system-admin
    const teamId = auth.subjectType === 'system-admin'
      ? (query.teamId ?? undefined)
      : auth.activeTeamId;

    return repo.queryUsageTimeSeries({ teamId, ... });
  });
};
```
[VERIFIED: follows audit.ts and other operations route patterns]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual SQL strings for table creation | Drizzle schema.ts + drizzle-kit | Phase 61+ | Type-safe schema, auto-generated migrations |
| In-memory store only | PostgreSQL with repository pattern | Phase 62+ | Row-level locking, proper indexes |
| setTimeout-based async | PostgreSQL SKIP LOCKED task queue | Phase 61 | Reliable async processing |

**Deprecated/outdated:**
- Direct StoreData mutation for knowledge/artifacts: Use dedicated PG repositories instead

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "organization" in ROADMAP maps 1:1 to "team" in codebase | Schema Design | Column naming inconsistency; need to clarify with user |
| A2 | "account_id" in ROADMAP maps to user ID (actorId) in auth context | Schema Design | Wrong data recorded if account != user |
| A3 | One usage_event row per result hit (not per search query) is the correct granularity | Ingestion Design | Hit ranking won't work with per-query granularity |
| A4 | Analytics only works with PostgreSQL (graceful degradation for JSON store) | Architecture | If analytics should also work with JSON store, need fallback implementation |
| A5 | Archival CLI should be a standalone script, not a server endpoint | Architecture | If it should be an endpoint, different auth and design needed |

## Open Questions

1. **Event granularity: per-hit or per-query?**
   - What we know: ROADMAP says "record each retrieval request" and also "record hit entry's entry_type and entry_id"
   - What's unclear: Is it one row per search request, or one row per result hit?
   - Recommendation: Record one row per result hit with a shared `query_id`. This supports hit ranking queries and usage time-series can count distinct `query_id`.

2. **Should analytics work without PostgreSQL?**
   - What we know: Many features (knowledge repo, artifact repo) are PG-only and gracefully degrade
   - What's unclear: Whether analytics APIs should return 503 or empty data when PG is not configured
   - Recommendation: Follow existing pattern -- return 503 with clear error message, matching how other PG-only features behave.

3. **entry_type values: what about knowledge entries that are not skills/traps?**
   - What we know: ROADMAP lists "skill/trap/knowledge" as entry types
   - What's unclear: The codebase distinguishes between knowledge entries (generic) and skill artifacts. Are these the three types?
   - Recommendation: Use `'knowledge'` for knowledge entries and `'skill'` for skill artifacts. Traps are a sub-type of knowledge entries in the current data model, but can be tracked separately via labels.

## Environment Availability

Step 2.6: SKIPPED (no new external dependencies -- all required tools are already installed)

The phase uses only existing infrastructure: PostgreSQL (optional, already configured), Drizzle ORM, Fastify, and Vitest. No new external tools or services are required.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (workspace-level) |
| Config file | vitest.config.ts (project root) |
| Quick run command | `pnpm vitest run --project server packages/server/src/lib/analytics/` |
| Full suite command | `pnpm vitest run --project server` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-1 | usage_events table creation and schema | unit | `pnpm vitest run --project server packages/server/src/lib/analytics/pg-repository.test.ts` | Wave 0 |
| REQ-2 | Fire-and-forget event recording after retrieval | unit | `pnpm vitest run --project server packages/server/src/routes/retrieval.test.ts` | Needs extension |
| REQ-3 | Usage time-series aggregation with day/week/month granularity | unit | `pnpm vitest run --project server packages/server/src/lib/analytics/pg-repository.test.ts` | Wave 0 |
| REQ-4 | Hit ranking Top N with time/entry_type filters | unit | `pnpm vitest run --project server packages/server/src/lib/analytics/pg-repository.test.ts` | Wave 0 |
| REQ-5 | System summary with active teams/users counts | unit | `pnpm vitest run --project server packages/server/src/lib/analytics/pg-repository.test.ts` | Wave 0 |
| REQ-6 | Permission gating (admin sees all, org admin sees own, user denied) | unit | `pnpm vitest run --project server packages/server/src/routes/operations/stats.test.ts` | Wave 0 |
| REQ-7 | Composite indexes on usage_events | unit | (verified via schema.ts inspection) | Wave 0 |
| REQ-8 | Archival of events older than 90 days | unit | `pnpm vitest run --project server packages/server/src/lib/analytics/pg-repository.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run --project server packages/server/src/lib/analytics/`
- **Per wave merge:** `pnpm vitest run --project server`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `packages/server/src/lib/analytics/pg-repository.test.ts` -- covers REQ-1,3,4,5,8
- [ ] `packages/server/src/routes/operations/stats.test.ts` -- covers REQ-6
- [ ] `packages/contracts/src/domain/common.ts` -- add `stats:read` to permissionSchema (code edit)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Existing session/auth system via resolveAuthContext |
| V4 Access Control | yes | requirePermission('stats:read') + team scoping for non-system-admin |
| V5 Input Validation | yes | Zod schemas for query parameters |
| V9 Communication | no | No new external communication |

### Known Threat Patterns for Fastify + PostgreSQL Analytics

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthorized stats access (user viewing other org data) | Information Disclosure | requirePermission + team filter in queries |
| SQL injection via query parameters | Tampering | Drizzle parameterized queries (never raw user input in sql tag) |
| Analytics data leakage via timing attacks | Information Disclosure | Standard RBAC checks before any query execution |
| DoS via unbounded time-range queries | Denial of Service | Enforce max time range in Zod schema validation |

## Sources

### Primary (HIGH confidence)
- Codebase inspection: packages/server/src/ -- all architectural patterns verified by direct file reading
- packages/server/package.json -- dependency versions confirmed
- packages/contracts/src/domain/common.ts -- permission enum confirmed
- packages/server/src/lib/persistence/schema.ts -- Drizzle table definition patterns confirmed

### Secondary (MEDIUM confidence)
- [Drizzle ORM Discussion #2893](https://github.com/drizzle-team/drizzle-orm/discussions/2893) -- community-verified pattern for date_trunc GROUP BY with Drizzle sql tag

### Tertiary (LOW confidence)
- None -- all claims verified from codebase or official sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, versions verified
- Architecture: HIGH -- patterns established by existing repository/PG implementations
- Pitfalls: MEDIUM -- organization vs team mapping is an assumption (A1), entry granularity is an assumption (A3)

**Research date:** 2026-05-06
**Valid until:** 2026-06-05 (stable -- no fast-moving dependencies)
